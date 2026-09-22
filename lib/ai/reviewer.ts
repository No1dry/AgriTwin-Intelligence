import { jsonrepair } from "jsonrepair";
import { extractJson } from "./json-util";
import { getModelTag, runLlm } from "./llm";
import { requestedBriefCounts } from "../editorial/runtime.mjs";
import type { Category } from "../sources/types";
import type { ArticleInput, BriefItem, DailyReport } from "./pipeline";

export interface QualityReviewAttempt {
  status: "passed" | "failed";
  score: number;
  blockingIssues: string[];
  suggestions: string[];
  summary: string;
  attempt: number;
}

export interface QualityReview {
  status: "passed" | "failed";
  reviewer: string;
  score: number;
  blockingIssues: string[];
  suggestions: string[];
  summary: string;
  attempt: number;
  maxAttempts?: number;
  exhausted?: boolean;
  history?: QualityReviewAttempt[];
}

export interface RevisionOptions {
  nextAttempt: number;
  maxAttempts: number;
  reviewHistory: QualityReviewAttempt[];
  validationFeedback?: string[];
  revisionRole: "editor" | "worker";
}

type ReviewResponse = {
  score?: number;
  passed?: boolean;
  blocking_issues?: string[];
  suggestions?: string[];
  summary?: string;
};

function evidencePayload(articles: ArticleInput[]): unknown[] {
  return articles.slice(0, 80).map((article) => ({
    title: article.title,
    url: article.url,
    source: article.source,
    category: article.category,
    evidence: (article.summary || article.excerpt || "").slice(0, 500),
  }));
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function reviewAttempt(review: QualityReview): QualityReviewAttempt {
  return {
    status: review.status,
    score: review.score,
    blockingIssues: review.blockingIssues,
    suggestions: review.suggestions,
    summary: review.summary,
    attempt: review.attempt,
  };
}

function canonicalBrief(
  value: unknown,
  category: Category,
  evidenceByUrl: Map<string, ArticleInput>,
): BriefItem | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Partial<BriefItem>;
  const url = cleanText(raw.url);
  const evidence = evidenceByUrl.get(url);
  if (!evidence || evidence.category !== category) return undefined;
  const title = cleanText(raw.title) || cleanText(evidence.title);
  const summary =
    cleanText(raw.summary) ||
    cleanText(evidence.summary) ||
    cleanText(evidence.excerpt);
  if (!title || !summary) return undefined;
  const parsedImportance = Number(raw.importance);
  return {
    title,
    url: evidence.url,
    // The source is evidence-owned. A revision cannot rename or fabricate it.
    source: evidence.source,
    summary,
    importance: Number.isFinite(parsedImportance)
      ? Math.max(1, Math.min(10, Math.round(parsedImportance)))
      : 5,
  };
}

function evidenceBrief(article: ArticleInput): BriefItem {
  return {
    title: cleanText(article.title),
    url: article.url,
    source: article.source,
    summary:
      cleanText(article.summary) ||
      cleanText(article.excerpt) ||
      "该信源发布了新的相关内容，详情以原文为准。",
    importance: 5,
  };
}

function stabilizeSection(
  category: Category,
  revised: unknown,
  baseline: BriefItem[],
  articles: ArticleInput[],
  target: number,
): BriefItem[] {
  const evidenceByUrl = new Map(articles.map((article) => [article.url, article]));
  const candidates = articles.filter((article) => article.category === category);
  const desired = Math.min(target, candidates.length);
  const combined = [
    ...(Array.isArray(revised) ? revised : []),
    ...baseline,
    ...candidates.map(evidenceBrief),
  ];
  const output: BriefItem[] = [];
  const seenUrls = new Set<string>();
  for (const item of combined) {
    const brief = canonicalBrief(item, category, evidenceByUrl);
    if (!brief || seenUrls.has(brief.url)) continue;
    seenUrls.add(brief.url);
    output.push(brief);
    if (output.length >= desired) break;
  }
  return output;
}

/**
 * Keep a model revision evidence-bound and structurally complete. A truncated
 * revision can update the fields it produced without erasing valid sections
 * from the previous draft.
 */
export function stabilizeRevisedReport(
  baseline: DailyReport,
  parsed: Partial<DailyReport>,
  articles: ArticleInput[],
): DailyReport {
  const counts = requestedBriefCounts();
  const revisedKeywords = Array.isArray(parsed.keywords) ? parsed.keywords : [];
  const keywords = [...revisedKeywords, ...baseline.keywords]
    .map(cleanText)
    .filter((value, index, values) => value && values.indexOf(value) === index)
    .slice(0, 8);
  return {
    hero_headline: cleanText(parsed.hero_headline) || baseline.hero_headline,
    daily_overview: cleanText(parsed.daily_overview) || baseline.daily_overview,
    tech_briefs: stabilizeSection(
      "tech",
      parsed.tech_briefs,
      baseline.tech_briefs,
      articles,
      counts.tech,
    ),
    finance_briefs: stabilizeSection(
      "finance",
      parsed.finance_briefs,
      baseline.finance_briefs,
      articles,
      counts.finance,
    ),
    politics_briefs: stabilizeSection(
      "politics",
      parsed.politics_briefs,
      baseline.politics_briefs,
      articles,
      counts.politics,
    ),
    editor_note: cleanText(parsed.editor_note) || baseline.editor_note,
    keywords,
  };
}

export function validateEvidenceBoundReport(
  report: DailyReport,
  articles: ArticleInput[],
): string[] {
  const evidenceByUrl = new Map(articles.map((article) => [article.url, article]));
  const errors: string[] = [];
  const seenUrls = new Set<string>();
  const sections = [
    ["tech", report.tech_briefs],
    ["finance", report.finance_briefs],
    ["politics", report.politics_briefs],
  ] as const;
  for (const [category, briefs] of sections) {
    for (const [index, brief] of briefs.entries()) {
      const evidence = evidenceByUrl.get(brief.url);
      const path = `${category}_briefs[${index}]`;
      if (!evidence) errors.push(`${path}.url is absent from candidate evidence`);
      else if (evidence.category !== category)
        errors.push(`${path}.url belongs to ${evidence.category}`);
      else if (brief.source !== evidence.source)
        errors.push(`${path}.source does not match candidate evidence`);
      if (seenUrls.has(brief.url)) errors.push(`${path}.url is duplicated`);
      seenUrls.add(brief.url);
    }
  }
  return errors;
}

function parseJson<T>(text: string): T {
  const json = extractJson(text);
  try {
    return JSON.parse(json) as T;
  } catch {
    return JSON.parse(jsonrepair(json)) as T;
  }
}

export function normalizeQualityReview(
  parsed: ReviewResponse,
  threshold: number,
  attempt: number,
  reviewer: string,
): QualityReview {
  const score = Math.max(0, Math.min(100, Number(parsed.score) || 0));
  const blockingIssues = (parsed.blocking_issues ?? [])
    .map((value) => String(value).replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 12);
  const suggestions = (parsed.suggestions ?? [])
    .map((value) => String(value).replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 12);
  const passed =
    parsed.passed === true && score >= threshold && blockingIssues.length === 0;
  return {
    status: passed ? "passed" : "failed",
    reviewer,
    score,
    blockingIssues,
    suggestions,
    summary: String(parsed.summary ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 240),
    attempt,
  };
}

export async function reviewDailyReport(
  report: DailyReport,
  articles: ArticleInput[],
  threshold: number,
  attempt: number,
  role: "reviewer" | "worker" = "reviewer",
): Promise<QualityReview> {
  const { text } = await runLlm({
    role,
    reasoningEffort: role === "reviewer" ? "high" : "low",
    timeoutMs: 240_000,
    // DeepSeek counts reasoning and visible content in max_tokens. The old
    // 6K cap could be consumed entirely by high-effort reasoning, leaving an
    // empty message.content even though reasoning_content was populated.
    maxTokens: role === "reviewer" ? 32_768 : 16_384,
    maxRetries: 0,
    systemPrompt: `你是每日技术情报的独立审稿员。你不能增加事实，只能依据候选证据审查成稿。重点检查：\n1. 每个标题、URL、来源和摘要是否能由候选证据支持；\n2. 科技、财经、时政是否覆盖当日最重要且互不重复的事件；\n3. 是否遗漏高价值 VLA、Agent、World Model、具身智能或重大产业事件；\n4. 是否有夸大、无证据数字、陈旧信息、近义重复或空泛表达；\n5. 中文总览是否准确、完整、自然。\n\n评分 0-100。严重事实问题、URL 不匹配、栏目明显缺失或重复必须进入 blocking_issues。输出单一合法 JSON：{"score":0-100,"passed":true|false,"blocking_issues":["..."],"suggestions":["..."],"summary":"不超过80字"}。passed 只有在分数达到给定阈值且没有 blocking issue 时才能为 true。`,
    userPrompt: JSON.stringify({
      threshold,
      report,
      candidateEvidence: evidencePayload(articles),
    }),
  });
  const parsed = parseJson<ReviewResponse>(text);
  return normalizeQualityReview(
    parsed,
    threshold,
    attempt,
    getModelTag(role),
  );
}

type ReviewerRunner = typeof reviewDailyReport;

/** Retry the independent reviewer once, then use DeepSeek Worker as a bounded
 * reviewer fallback. Empty or truncated model output is treated as an outage,
 * not as permission to publish an unreviewed report. */
export async function reviewDailyReportWithFailover(
  report: DailyReport,
  articles: ArticleInput[],
  threshold: number,
  attempt: number,
  runner: ReviewerRunner = reviewDailyReport,
): Promise<QualityReview> {
  const roles = ["reviewer", "reviewer", "worker"] as const;
  let lastError: unknown;
  for (const [index, role] of roles.entries()) {
    try {
      return await runner(report, articles, threshold, attempt, role);
    } catch (error) {
      lastError = error;
      console.warn(
        `[reviewer] ${role} call ${index + 1}/${roles.length} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(String(lastError ?? "reviewer unavailable"));
}

export async function reviseDailyReport(
  report: DailyReport,
  articles: ArticleInput[],
  review: QualityReview,
  options: RevisionOptions,
): Promise<DailyReport> {
  const counts = requestedBriefCounts();
  const { text } = await runLlm({
    role: options.revisionRole,
    // Revisions are strict JSON generation. Disable thinking so both Kimi and
    // DeepSeek spend the budget on a complete document.
    reasoningEffort: "none",
    timeoutMs: options.revisionRole === "worker" ? 240_000 : 300_000,
    maxTokens: options.revisionRole === "worker" ? 6_144 : 8_192,
    maxRetries: 0,
    systemPrompt: `你是中文日报${options.revisionRole === "worker" ? "返修执行编辑" : "主编"}，正在执行第 ${options.nextAttempt}/${options.maxAttempts} 轮质量返修。独立审稿员指出了成稿问题，你必须逐条解决全部 blocking issue，并尽量采纳 suggestions。只依据候选证据修订，不得编造事实、数字、来源或 URL。

输出完整合法 JSON，schema 固定为 hero_headline、daily_overview、tech_briefs、finance_briefs、politics_briefs、editor_note、keywords；BriefItem 必须包含 title、url、source、summary、importance。目标条数固定为科技 ${counts.tech} 条、财经 ${counts.finance} 条、时政 ${counts.politics} 条。删除重复或不合格条目时，必须从同栏目候选证据中补入另一条独立事件。未要求修改的字段也必须完整保留，禁止输出空字段、空数组、占位符、Markdown 或解释文字。输出前自行检查 JSON 闭合、栏目条数、URL 归属和审稿意见是否全部落实。`,
    userPrompt: JSON.stringify({
      currentReport: report,
      reviewer: {
        blockingIssues: review.blockingIssues,
        suggestions: review.suggestions,
        summary: review.summary,
      },
      previousReviews: options.reviewHistory.map((item) => ({
        attempt: item.attempt,
        score: item.score,
        blockingIssues: item.blockingIssues,
      })),
      structuralFeedback: options.validationFeedback ?? [],
      candidateEvidence: evidencePayload(articles),
    }),
  });
  const parsed = parseJson<Partial<DailyReport>>(text);
  return stabilizeRevisedReport(report, parsed, articles);
}

export function toReviewAttempt(review: QualityReview): QualityReviewAttempt {
  return reviewAttempt(review);
}
