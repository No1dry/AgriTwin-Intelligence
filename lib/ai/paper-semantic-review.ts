import { jsonrepair } from "jsonrepair";
import { extractJson } from "./json-util";
import { hasDedicatedRole, runLlm } from "./llm";
import type { ArticleInput } from "./pipeline";
import type { SemanticPaperAssessment } from "../papers/curation";
import { getEditorialConfig } from "../editorial/runtime.mjs";

type SemanticResponse = {
  papers?: Array<{
    url?: string;
    relevance?: number;
    quality?: number;
    novelty?: number;
    topics?: string[];
    reason?: string;
  }>;
};

const TOPICS = new Set(["VLA", "Agent", "World Model", "具身智能"]);
const clamp = (value: unknown): number =>
  Math.max(
    0,
    Math.min(100, Number.isFinite(Number(value)) ? Number(value) : 0),
  );

export async function reviewPaperCandidates(
  papers: ArticleInput[],
): Promise<Map<string, SemanticPaperAssessment>> {
  if (!hasDedicatedRole("worker") || papers.length === 0) return new Map();
  const result = new Map<string, SemanticPaperAssessment>();
  const candidates = papers.slice(0, 40);
  const batches: ArticleInput[][] = [];
  for (let offset = 0; offset < candidates.length; offset += 10) {
    batches.push(candidates.slice(offset, offset + 10));
  }
  let cursor = 0;
  const concurrency = Math.min(
    getEditorialConfig()?.models.workerConcurrency ?? 2,
    batches.length,
  );
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (cursor < batches.length) {
        const batchIndex = cursor++;
        const batch = batches[batchIndex];
        try {
          const { text } = await runLlm({
            role: "worker",
            reasoningEffort: "low",
            timeoutMs: 180_000,
            maxTokens: 6_144,
            maxRetries: 0,
            systemPrompt: `你是 AI 研究论文初审员。根据完整标题和摘要，判断论文对 VLA、Agent、World Model、具身智能研究的相关性与研究质量。\n\n严格区分：仅在应用场景中顺带使用 agent/model 的论文，不等于核心 Agent 或 World Model 研究；金融、医疗、化学等垂直应用若没有可迁移的方法贡献，应降低 relevance。不要因热门或标题新奇提高质量分。\n\n输出单一合法 JSON：{"papers":[{"url":"原URL","relevance":0-100,"quality":0-100,"novelty":0-100,"topics":["VLA"|"Agent"|"World Model"|"具身智能"],"reason":"不超过45字的中文依据"}]}`,
            userPrompt: JSON.stringify(
              batch.map((paper) => ({
                url: paper.url,
                title: paper.title,
                abstract: (paper.contentText || paper.excerpt || "").slice(
                  0,
                  8_000,
                ),
                source: paper.source,
                meta: paper.meta,
              })),
            ),
          });
          let parsed: SemanticResponse;
          try {
            parsed = JSON.parse(extractJson(text)) as SemanticResponse;
          } catch {
            parsed = JSON.parse(
              jsonrepair(extractJson(text)),
            ) as SemanticResponse;
          }
          const allowedUrls = new Set(batch.map((paper) => paper.url));
          for (const item of parsed.papers ?? []) {
            if (!item.url || !allowedUrls.has(item.url)) continue;
            result.set(item.url, {
              relevance: clamp(item.relevance),
              quality: clamp(item.quality),
              novelty: clamp(item.novelty),
              topics: (item.topics ?? []).filter((topic) => TOPICS.has(topic)),
              reason: String(item.reason ?? "")
                .replace(/\s+/g, " ")
                .trim()
                .slice(0, 120),
            });
          }
        } catch (error) {
          console.warn(
            `[paper-worker] semantic review failed for batch ${batchIndex + 1}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }),
  );
  return result;
}
