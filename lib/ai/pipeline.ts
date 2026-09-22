import { jsonrepair } from "jsonrepair";
import { runLlm } from "./llm";
import { extractJson } from "./json-util";
import { SYSTEM_PROMPT_DIGEST_EN, SYSTEM_PROMPT_DIGEST_ZH } from "./prompts";
import { REPORT_LOCALE } from "../sources/registry";
import type { Category, RawArticle } from "../sources/types";
import {
  getEditorialConfig,
  matchingTopics,
  requestedBriefCounts,
} from "../editorial/runtime.mjs";
import { isRoleEnabled } from "./llm";
import {
  reviewDailyReportWithFailover,
  reviseDailyReport,
  toReviewAttempt,
  validateEvidenceBoundReport,
  type QualityReview,
  type QualityReviewAttempt,
  type RevisionOptions,
} from "./reviewer";

const SYSTEM_PROMPT_DIGEST =
  REPORT_LOCALE === "en" ? SYSTEM_PROMPT_DIGEST_EN : SYSTEM_PROMPT_DIGEST_ZH;

export interface BriefItem {
  title: string;
  url: string;
  source: string;
  summary: string;
  importance: number;
}

export interface DailyReport {
  hero_headline: string;
  daily_overview: string;
  tech_briefs: BriefItem[];
  finance_briefs: BriefItem[];
  politics_briefs: BriefItem[];
  editor_note: string;
  keywords: string[];
  quality_review?: QualityReview;
  /** Optional trading-signals section, present when scripts/daily.ts ran successfully. */
  trading?: TradingSection;
}

const MIN_DAILY_BRIEFS = {
  tech: 3,
  finance: 3,
  politics: 2,
} as const;

/** Reject syntactically repaired but editorially incomplete model output. */
export function validateDailyReport(report: DailyReport): string[] {
  const errors: string[] = [];
  if (!report.hero_headline.trim()) errors.push("hero_headline is empty");
  if (!report.daily_overview.trim()) errors.push("daily_overview is empty");
  if (!report.editor_note.trim()) errors.push("editor_note is empty");
  if (report.keywords.filter((keyword) => keyword.trim()).length < 5) {
    errors.push(`keywords has ${report.keywords.length}, expected at least 5`);
  }
  const sections = [
    ["tech_briefs", report.tech_briefs, MIN_DAILY_BRIEFS.tech],
    ["finance_briefs", report.finance_briefs, MIN_DAILY_BRIEFS.finance],
    ["politics_briefs", report.politics_briefs, MIN_DAILY_BRIEFS.politics],
  ] as const;
  for (const [name, briefs, minimum] of sections) {
    if (briefs.length < minimum) {
      errors.push(`${name} has ${briefs.length}, expected at least ${minimum}`);
    }
    briefs.forEach((brief, index) => {
      if (!brief.title?.trim()) errors.push(`${name}[${index}].title is empty`);
      if (!brief.url?.trim()) errors.push(`${name}[${index}].url is empty`);
      if (!brief.summary?.trim())
        errors.push(`${name}[${index}].summary is empty`);
      if (!brief.source?.trim())
        errors.push(`${name}[${index}].source is empty`);
    });
  }
  return errors;
}

export function resolveReviewMaxAttempts(
  value = process.env.LLM_REVIEW_MAX_ATTEMPTS,
): number {
  const parsed = Number.parseInt(value ?? "4", 10);
  return Number.isFinite(parsed) ? Math.max(2, Math.min(6, parsed)) : 4;
}

type ReviewFunction = (
  report: DailyReport,
  articles: ArticleInput[],
  threshold: number,
  attempt: number,
) => Promise<QualityReview>;

type ReviseFunction = (
  report: DailyReport,
  articles: ArticleInput[],
  review: QualityReview,
  options: RevisionOptions,
) => Promise<DailyReport>;

export interface ReviewLoopOptions {
  maxAttempts?: number;
  revisionRetries?: number;
  review?: ReviewFunction;
  revise?: ReviseFunction;
}

function configuredCountErrors(
  report: DailyReport,
  articles: ArticleInput[],
): string[] {
  const requested = requestedBriefCounts();
  const errors: string[] = [];
  for (const category of ["tech", "finance", "politics"] as Category[]) {
    const available = articles.filter((item) => item.category === category).length;
    const expected = Math.min(requested[category], available);
    const actual = report[`${category}_briefs`].length;
    if (actual < expected)
      errors.push(`${category}_briefs has ${actual}, expected ${expected}`);
  }
  return errors;
}

function reportFingerprint(report: DailyReport): string {
  const { quality_review: _qualityReview, trading: _trading, ...content } = report;
  return JSON.stringify(content);
}

function isBetterReview(candidate: QualityReview, current?: QualityReview): boolean {
  if (!current) return true;
  if (candidate.status !== current.status) return candidate.status === "passed";
  if (candidate.score !== current.score) return candidate.score > current.score;
  return candidate.blockingIssues.length < current.blockingIssues.length;
}

function auditedReview(
  review: QualityReview,
  history: QualityReviewAttempt[],
  maxAttempts: number,
  exhausted: boolean,
): QualityReview {
  return {
    ...review,
    maxAttempts,
    exhausted,
    history,
  };
}

/**
 * Bounded editor/reviewer loop. Every failed review becomes the next editor
 * instruction; only a structurally valid, evidence-bound revision is reviewed.
 */
export async function runReviewLoop(
  initialReport: DailyReport,
  articles: ArticleInput[],
  threshold: number,
  options: ReviewLoopOptions = {},
): Promise<{ report: DailyReport; review: QualityReview }> {
  const maxAttempts = Math.max(
    2,
    Math.min(6, options.maxAttempts ?? resolveReviewMaxAttempts()),
  );
  const revisionRetries = Math.max(
    1,
    Math.min(2, options.revisionRetries ?? 2),
  );
  const reviewFn = options.review ?? reviewDailyReportWithFailover;
  const reviseFn = options.revise ?? reviseDailyReport;
  const history: QualityReviewAttempt[] = [];
  let currentReport = initialReport;
  let bestReport = initialReport;
  let bestReview: QualityReview | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let currentReview: QualityReview;
    try {
      currentReview = await reviewFn(
        currentReport,
        articles,
        threshold,
        attempt,
      );
    } catch (error) {
      if (!bestReview) throw error;
      console.warn(
        `[reviewer] round ${attempt}/${maxAttempts} unavailable after an earlier failed review; preserving the quality gate: ${error instanceof Error ? error.message : String(error)}`,
      );
      break;
    }
    history.push(toReviewAttempt(currentReview));
    console.log(
      `[reviewer] round ${attempt}/${maxAttempts}: ${currentReview.status} score=${currentReview.score} blockers=${currentReview.blockingIssues.length}`,
    );

    if (isBetterReview(currentReview, bestReview)) {
      bestReport = currentReport;
      bestReview = currentReview;
    }
    if (currentReview.status === "passed") {
      const finalReview = auditedReview(
        currentReview,
        history,
        maxAttempts,
        false,
      );
      return { report: currentReport, review: finalReview };
    }
    if (attempt >= maxAttempts) break;

    let acceptedRevision: DailyReport | undefined;
    let validationFeedback: string[] = [];
    for (let revisionTry = 1; revisionTry <= revisionRetries; revisionTry += 1) {
      try {
        const revised = await reviseFn(currentReport, articles, currentReview, {
          nextAttempt: attempt + 1,
          maxAttempts,
          reviewHistory: history,
          validationFeedback,
          // Kimi remains the primary editor. If its full-document revision is
          // truncated or invalid, DeepSeek Worker takes the bounded retry so
          // the loop does not repeat the same provider failure twice.
          revisionRole: revisionTry === 1 ? "editor" : "worker",
        });
        const errors = [
          ...validateDailyReport(revised),
          ...configuredCountErrors(revised, articles),
          ...validateEvidenceBoundReport(revised, articles),
        ];
        if (reportFingerprint(revised) === reportFingerprint(currentReport))
          errors.push("revision made no effective change");
        if (errors.length === 0) {
          acceptedRevision = revised;
          break;
        }
        validationFeedback = errors;
        console.warn(
          `[reviewer] ${revisionTry === 1 ? "editor" : "worker fallback"} revision ${revisionTry}/${revisionRetries} rejected before re-review: ${errors.join("; ")}`,
        );
      } catch (error) {
        validationFeedback = [
          `revision call failed: ${error instanceof Error ? error.message : String(error)}`,
        ];
        console.warn(
          `[reviewer] ${revisionTry === 1 ? "editor" : "worker fallback"} revision ${revisionTry}/${revisionRetries} failed: ${validationFeedback[0]}`,
        );
      }
    }
    if (!acceptedRevision) {
      console.warn(
        `[reviewer] stopping after ${attempt} review round(s): no valid revision was produced after ${revisionRetries} bounded retries`,
      );
      break;
    }
    currentReport = acceptedRevision;
  }

  if (!bestReview) throw new Error("reviewer returned no usable result");
  const finalReview = auditedReview(bestReview, history, maxAttempts, true);
  return { report: bestReport, review: finalReview };
}

import type { TickerAnalysis } from "../trading/signals";
import type { CryptoGlobalStats } from "../trading/coingecko";
import type { FearGreedSnapshot } from "../trading/fear-greed";
import type { TradingCommentary } from "./trading-commentary";

export interface TradingSection extends TradingCommentary {
  generated_at: string;
  tickers: TickerAnalysis[];
  crypto_fear_greed?: FearGreedSnapshot;
  crypto_global?: CryptoGlobalStats;
}

export interface ArticleInput extends RawArticle {
  source: string;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isContentFilterError(error: unknown): boolean {
  return /content_filter|considered high risk|high.risk/i.test(
    errorMessage(error),
  );
}

function clipText(value: string | undefined, limit: number): string {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

const HIGH_VALUE_SOURCE_IDS = new Set([
  "openai-news",
  "anthropic-news",
  "anthropic-research",
  "deepmind-blog",
  "huggingface-blog",
  "huggingface-papers",
  "google-research-blog",
  "microsoft-research-blog",
  "nvidia-research",
  "arxiv-cs-ai",
  "arxiv-cs-lg",
  "openreview",
  "bloomberg-markets",
  "wsj-markets",
  "ft-companies",
  "bbc-world",
  "guardian-world",
  "nyt-world",
]);

function fallbackScore(article: ArticleInput): number {
  const published = article.publishedAt?.getTime();
  const ageDays = published
    ? Math.max(0, (Date.now() - published) / 86_400_000)
    : 14;
  const freshness = Math.max(0, 14 - ageDays) * 2;
  const summaryQuality = article.summary?.trim()
    ? 16
    : article.excerpt?.trim()
      ? 5
      : 0;
  const sourceQuality = HIGH_VALUE_SOURCE_IDS.has(article.sourceId) ? 10 : 0;
  const listPenalty =
    article.sourceId === "github-trending" || article.sourceId === "v2ex-hot"
      ? 5
      : 0;
  const text = `${article.title} ${article.summary ?? article.excerpt ?? ""}`;
  let editorialSignal = 0;
  const config = getEditorialConfig();
  if (article.category === "tech" && config)
    editorialSignal += matchingTopics(article, config).reduce(
      (best, topic) =>
        Math.max(
          best,
          topic.weight * 15 + { P0: 6, P1: 3, P2: 0 }[topic.priority],
        ),
      0,
    );
  const priority = config?.sourceOverrides[article.sourceId]?.priority;
  if (priority) editorialSignal += { P0: 8, P1: 4, P2: 0 }[priority];
  if (article.category === "tech") {
    if (
      /release|launch|model|research|paper|benchmark|open.?source|发布|推出|模型|研究|论文|基准|开源|推理|训练/i.test(
        text,
      )
    )
      editorialSignal += 14;
  } else if (article.category === "finance") {
    if (
      /Federal Reserve|\bFed\b|central bank|interest rate|inflation|GDP|S&P|Nasdaq|Dow|Treasury|bond|market|stocks?|oil|gold|Bitcoin|\bBTC\b|央行|美联储|利率|通胀|经济|指数|美股|国债|市场|原油|黄金|比特币/i.test(
        text,
      )
    )
      editorialSignal += 18;
    if (
      /appoint|named .*CEO|chief executive|son|daughter|接任|任命|首席执行官|之子|之女/i.test(
        text,
      )
    )
      editorialSignal -= 14;
  } else {
    if (
      /president|prime minister|government|parliament|election|policy|sanction|war|conflict|ceasefire|diploma|military|China|United States|Russia|Ukraine|Israel|Iran|政府|总统|首相|议会|选举|政策|制裁|战争|冲突|停火|外交|军方|中国|美国|俄罗斯|乌克兰|以色列|伊朗/i.test(
        text,
      )
    )
      editorialSignal += 18;
    if (
      /police|arrest|found dead|murder|body|local crime|e-bike|警方|逮捕|死亡|尸体|停车场|电动自行车/i.test(
        text,
      )
    )
      editorialSignal -= 22;
  }
  return (
    freshness + summaryQuality + sourceQuality + editorialSignal - listPenalty
  );
}

function compactHeadline(value: string, limit = 32): string {
  const sentence =
    value
      .replace(/\s+/g, " ")
      .trim()
      .split(/[。；;.!?]/, 1)[0] ?? "";
  if (sentence.length <= limit) return sentence;
  const naturalBreak = sentence.match(
    new RegExp(`^(.{10,${limit}}?)(?:用于|通过|处理|实现|以便|并且|，|,)`),
  );
  return naturalBreak?.[1]?.trim() || clipText(sentence, limit);
}

function localizedFallbackTitle(article: ArticleInput): string {
  const title = compactHeadline(article.title, 36);
  if (REPORT_LOCALE === "en" || /[\u3400-\u9fff]/.test(title)) return title;
  const summaryLead = clipText(article.summary, 80)
    .split(/[，,:：。；;.!?]/, 1)[0]
    ?.trim();
  return /[\u3400-\u9fff]/.test(summaryLead)
    ? compactHeadline(summaryLead, 30)
    : title;
}

function rankedFallbackItems(items: ArticleInput[]): ArticleInput[] {
  return [...items].sort((a, b) => {
    const quality = fallbackScore(b) - fallbackScore(a);
    if (quality !== 0) return quality;
    return (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0);
  });
}

function fallbackBriefs(items: ArticleInput[], limit: number): BriefItem[] {
  return rankedFallbackItems(items)
    .slice(0, limit)
    .map((article) => ({
      title: localizedFallbackTitle(article),
      url: article.url,
      source: article.source,
      summary:
        clipText(article.summary || article.excerpt, 160) ||
        (REPORT_LOCALE === "en"
          ? "The source published a new item; open the original article for its methods, evidence, and full context."
          : "该信源发布了新的相关内容，可通过原文查看具体方法、数据和完整背景。"),
      importance: 5,
    }));
}

function summaryClause(item: BriefItem | undefined, limit = 76): string {
  return clipText(item?.summary, limit).replace(/[。；;.!?]+$/, "");
}

function deriveFallbackKeywords(items: ArticleInput[]): string[] {
  const text = items
    .map((item) => `${item.title} ${item.summary ?? item.excerpt ?? ""}`)
    .join("\n");
  const patterns: Array<[[string, string], RegExp]> = [
    [["大模型", "Foundation Models"], /大模型|LLM|GPT|Claude|Kimi|Gemini/i],
    [["智能体", "AI Agents"], /智能体|Agent/i],
    [["人工智能", "Artificial Intelligence"], /人工智能|\bAI\b/i],
    [
      ["全球市场", "Global Markets"],
      /市场|美股|股票|利率|通胀|ETF|比特币|BTC/i,
    ],
    [["政策监管", "Policy"], /政策|监管|政府|法规|法案/i],
    [["国际局势", "World Affairs"], /国际|外交|战争|冲突|制裁/i],
    [["开源生态", "Open Source"], /开源|open.?source|GitHub/i],
    [["机器人", "Robotics"], /机器人|具身智能|robot/i],
    [["芯片算力", "AI Compute"], /芯片|算力|GPU|NVIDIA|半导体/i],
  ];
  const labelIndex = REPORT_LOCALE === "en" ? 1 : 0;
  const keywords = patterns
    .filter(([, pattern]) => pattern.test(text))
    .map(([labels]) => labels[labelIndex]);
  const defaults =
    REPORT_LOCALE === "en"
      ? [
          "Technology",
          "Artificial Intelligence",
          "Markets",
          "Macroeconomics",
          "Policy",
          "World News",
        ]
      : [
          "技术前沿",
          "人工智能",
          "市场观察",
          "宏观经济",
          "政策动态",
          "国际要闻",
        ];
  for (const keyword of defaults) {
    if (keywords.length >= 6) break;
    if (!keywords.includes(keyword)) keywords.push(keyword);
  }
  return keywords.slice(0, 6);
}

export function buildDeterministicFallback(items: ArticleInput[]): DailyReport {
  const grouped: Record<Category, ArticleInput[]> = {
    tech: [],
    finance: [],
    politics: [],
  };
  for (const item of items) grouped[item.category].push(item);
  const counts = requestedBriefCounts();
  const tech = fallbackBriefs(grouped.tech, counts.tech);
  const finance = fallbackBriefs(grouped.finance, counts.finance);
  const politics = fallbackBriefs(grouped.politics, counts.politics);
  const headline =
    tech[0]?.title ||
    finance[0]?.title ||
    politics[0]?.title ||
    (REPORT_LOCALE === "en" ? "Today's Brief" : "今日简报");
  const overviewParts =
    REPORT_LOCALE === "en"
      ? [
          ["Technology", summaryClause(tech[0], 95)],
          ["Markets", summaryClause(finance[0], 85)],
          ["World affairs", summaryClause(politics[0], 85)],
        ]
      : [
          ["技术方面", summaryClause(tech[0])],
          ["财经方面", summaryClause(finance[0])],
          ["时政方面", summaryClause(politics[0])],
        ];
  const overview =
    overviewParts
      .filter(([, summary]) => summary)
      .map(
        ([label, summary]) =>
          `${label}${REPORT_LOCALE === "en" ? ": " : "，"}${summary}`,
      )
      .join(REPORT_LOCALE === "en" ? ". " : "。") +
    (REPORT_LOCALE === "en" ? "." : "。");
  const keywords = deriveFallbackKeywords(items);
  const focus = keywords.slice(0, 4).join(REPORT_LOCALE === "en" ? ", " : "、");
  return {
    hero_headline: headline,
    daily_overview: overview,
    tech_briefs: tech,
    finance_briefs: finance,
    politics_briefs: politics,
    editor_note:
      REPORT_LOCALE === "en"
        ? `Today's main threads are ${focus || "technology, markets, and policy"}. Follow the original sources as methods, data, and policy details develop.`
        : `今日信息主线集中在${focus || "技术、市场与政策变化"}，可结合完整技术动态和原文继续跟踪方法、数据与实际影响。`,
    keywords,
  };
}

const PER_CATEGORY_LIMIT: Record<Category, number> = {
  // Preserve the original editorial breadth for the primary digest call.
  tech: 25,
  finance: 20,
  politics: 15,
};

const RETRY_CATEGORY_LIMIT: Record<Category, number> = {
  // Only the recovery call is smaller; it still keeps all three sections
  // and is selected by the same quality-aware, source-balanced algorithm.
  tech: 16,
  finance: 11,
  politics: 9,
};

const MAX_AGE_DAYS = 14;

/**
 * Pick `limit` items from `items` so every source gets a fair shot.
 *
 * Why this exists: the previous `slice(0, limit)` honored insertion order,
 * which is the source-iteration order in daily.ts. That gave whichever
 * source came first 100% of the quota — e.g. all 25 tech slots filled by
 * Hacker News before GitHub Trending / Solidot / V2EX / 阮一峰 got a turn.
 *
 * Strategy: drop items older than MAX_AGE_DAYS, group by sourceId,
 * sort each bucket newest-first, then round-robin one item per source
 * until we hit the limit. Sources with fewer items naturally drop out
 * and others absorb the slack.
 */
function selectRoundRobin(
  items: ArticleInput[],
  limit: number,
): ArticleInput[] {
  const cutoff = Date.now() - MAX_AGE_DAYS * 86_400_000;
  const fresh = items.filter(
    (it) => !it.publishedAt || it.publishedAt.getTime() >= cutoff,
  );

  const bySource = new Map<string, ArticleInput[]>();
  for (const it of fresh) {
    const arr = bySource.get(it.sourceId) ?? [];
    arr.push(it);
    bySource.set(it.sourceId, arr);
  }
  for (const arr of bySource.values()) {
    arr.sort(
      (a, b) =>
        fallbackScore(b) - fallbackScore(a) ||
        (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0),
    );
  }

  // Keep round-robin source diversity, but let the strongest current item
  // from each source determine which buckets enter a capped set first.
  const buckets = Array.from(bySource.values()).sort(
    (a, b) => fallbackScore(b[0]) - fallbackScore(a[0]),
  );
  const out: ArticleInput[] = [];
  let madeProgress = true;
  while (out.length < limit && madeProgress) {
    madeProgress = false;
    for (const b of buckets) {
      if (b.length === 0) continue;
      out.push(b.shift()!);
      madeProgress = true;
      if (out.length >= limit) break;
    }
  }
  return out;
}

async function callOnce(
  userPayloadJson: string,
  compactRetry = false,
  role: "editor" | "worker" = "editor",
): Promise<DailyReport> {
  const policy = getEditorialConfig();
  const requested = requestedBriefCounts();
  // Claude Code CLI's built-in system prompt biases the model toward
  // conversational markdown output. Anchor the format expectation in the
  // user message (instruction recency wins) *and* explicitly demand every
  // schema field be populated — without this Sonnet has been observed to
  // emit a JSON shell with empty arrays to "satisfy" a JSON-only ask.
  const userPrompt =
    REPORT_LOCALE === "en"
      ? [
          "**Output language: ENGLISH ONLY.** Every string value in the JSON — hero_headline, daily_overview, every brief's title/summary, editor_note, keywords — must be written entirely in English. No Chinese characters anywhere.",
          "",
          "Your task: generate today's daily brief from the candidate news below. **The response MUST be a single valid JSON object** — starts with `{`, ends with `}`, no markdown, no code fences, no explanations.",
          "",
          "The JSON must contain every field non-empty (briefs arrays per the system-prompt counts):",
          "  - hero_headline: 10-25 word headline of the day",
          "  - daily_overview: **150-250 word** paragraph covering tech / finance / politics signals so a reader sees the whole picture at a glance",
          "  - tech_briefs: **3-5** tech BriefItems",
          "  - finance_briefs: **3-5** finance BriefItems",
          "  - politics_briefs: **2-3** politics BriefItems",
          "  - editor_note: 30-60 word editor's note",
          "  - keywords: 5-8 keywords",
          "",
          "BriefItem fields: title, url (copied verbatim from candidate), source, summary, importance (1-10).",
          "**Quote rule (important!)**: For any quotation INSIDE a JSON string, use single quotes ' or curly quotes '\" — **never** raw double quotes \", which break JSON parsing.",
          "No trailing commas.",
          "",
          `Candidate news (JSON array, ${userPayloadJson.length} chars):`,
          userPayloadJson,
        ].join("\n")
      : [
          "你的任务：根据下方候选新闻，生成一份当日简报，**响应必须是一个合法 JSON 对象**——以 `{` 开头，以 `}` 结尾，不要 markdown / 不要代码围栏 / 不要任何解释。",
          "",
          "JSON 必须包含全部字段且不能为空（briefs 数组按 system prompt 规定的条数填充）：",
          "  - hero_headline: 10-25 字的当日一句话头条",
          "  - daily_overview: **150-220 字** 的当日总览段落，一段话覆盖技术 / 财经 / 时政 的核心信号，让读者一眼抓住全貌",
          "  - tech_briefs: **3-5 条** 科技 BriefItem",
          "  - finance_briefs: **3-5 条** 财经 BriefItem",
          "  - politics_briefs: **2-3 条** 时政 BriefItem",
          "  - editor_note: 30-60 字的编辑短评",
          "  - keywords: 5-8 个关键词",
          "",
          "BriefItem 字段：title、url（必须从候选条目原样选取）、source、summary、importance(1-10)。",
          '**引号规则（重要！）**：JSON 字符串内的中文引用请使用**中文全角引号**「」或者 “”，**绝对不要**用英文双引号 " —— 那会导致 JSON 解析失败。例：写 商务部回应「内卷」 而不是 商务部回应"内卷"。',
          "不要使用单引号、不要末尾多余逗号。",
          "",
          "候选新闻（JSON 数组，共 " + userPayloadJson.length + " 字符）：",
          userPayloadJson,
        ].join("\n");
  const retryHint = compactRetry
    ? REPORT_LOCALE === "en"
      ? [
          "This is a compact retry because the previous JSON was incomplete.",
          "Keep the response short enough to close every JSON delimiter: daily_overview 80-120 words; 3 tech briefs; 3 finance briefs; 2 politics briefs; each summary 25-45 words; editor_note 20-40 words; 5 keywords.",
          "Do not add any explanation or markdown. Return one complete JSON object.",
        ].join("\n")
      : [
          "这是一次压缩重试，因为上一轮 JSON 输出不完整。",
          "请严格缩短输出并确保所有 JSON 括号闭合：daily_overview 80-120 字；科技 3 条；财经 3 条；时政 2 条；每条 summary 25-45 字；editor_note 20-40 字；keywords 5 个。",
          "不要解释、不要 markdown，只返回一个完整合法的 JSON 对象。",
        ].join("\n")
    : "";
  const baseUserPrompt = retryHint
    ? `${userPrompt}\n\n${retryHint}`
    : userPrompt;
  const finalUserPrompt = policy
    ? `${baseUserPrompt}\n\n${
        REPORT_LOCALE === "en"
          ? `Editorial configuration overrides the counts above: aim for ${requested.tech} tech, ${requested.finance} finance and ${requested.politics} politics briefs. Use distinct evidence-backed candidates; do not invent or duplicate items to fill a quota. Research priorities: `
          : `本次编辑配置优先于上面的默认条数：目标科技 ${requested.tech} 条、财经 ${requested.finance} 条、时政 ${requested.politics} 条。每条必须有独立事实依据；候选不足时允许少于目标，不得编造或重复凑数。当前研究方向：`
      }${policy.researchTopics
        .filter((topic) => topic.enabled && topic.weight > 0)
        .map((topic) => `${topic.name} (${topic.priority}, ${topic.weight})`)
        .join(" / ")}`
    : baseUserPrompt;

  const { text } = await runLlm({
    role,
    // The digest must be complete JSON. Reasoning tokens compete with the
    // visible JSON budget and previously caused empty or truncated outputs.
    reasoningEffort: "none",
    systemPrompt: SYSTEM_PROMPT_DIGEST,
    userPrompt: finalUserPrompt,
    timeoutMs: policy
      ? (compactRetry
          ? Math.min(240, policy.models.editorTimeout)
          : policy.models.editorTimeout) * 1000
      : compactRetry
        ? 240_000
        : 300_000,
    maxTokens: policy
      ? Math.min(
          16384,
          Math.max(
            compactRetry ? 6144 : 8192,
            Object.values(requested).reduce((a, b) => a + b, 0) *
              (compactRetry ? 260 : 350),
          ),
        )
      : compactRetry
        ? 6144
        : 8192,
    // The pipeline already performs a smaller, purpose-built retry. Avoid
    // the SDK repeating the same slow request two more times first.
    maxRetries: 0,
  });
  const cleaned = extractJson(text);
  let parsed: Partial<DailyReport>;
  try {
    parsed = JSON.parse(cleaned) as Partial<DailyReport>;
  } catch (strictErr) {
    // LLMs routinely emit JSON with unescaped quotes inside Chinese
    // strings (e.g. 商务部回应"内卷"). jsonrepair fixes most of these
    // mechanically before we ever surface a failure.
    try {
      const repaired = jsonrepair(cleaned);
      parsed = JSON.parse(repaired) as Partial<DailyReport>;
      console.warn("[pipeline] JSON.parse failed but jsonrepair recovered");
    } catch {
      try {
        const fs = await import("node:fs");
        fs.mkdirSync("logs", { recursive: true });
        const ts = new Date().toISOString().replace(/[:.]/g, "-");
        fs.writeFileSync(`logs/claude-raw-${ts}.txt`, text, "utf8");
        fs.writeFileSync(`logs/claude-cleaned-${ts}.txt`, cleaned, "utf8");
        console.warn(
          `[pipeline] both JSON.parse and jsonrepair failed; raw at logs/claude-raw-${ts}.txt`,
        );
      } catch {
        // best-effort logging
      }
      throw strictErr;
    }
  }
  const report: DailyReport = {
    hero_headline: parsed.hero_headline ?? "",
    daily_overview: parsed.daily_overview ?? "",
    tech_briefs: parsed.tech_briefs ?? [],
    finance_briefs: parsed.finance_briefs ?? [],
    politics_briefs: parsed.politics_briefs ?? [],
    editor_note: parsed.editor_note ?? "",
    keywords: parsed.keywords ?? [],
  };
  const validationErrors = validateDailyReport(report);
  if (policy) {
    const candidates = JSON.parse(userPayloadJson) as Array<{
      category: Category;
    }>;
    for (const category of ["tech", "finance", "politics"] as Category[]) {
      const possible = candidates.filter(
        (item) => item.category === category,
      ).length;
      if (
        report[`${category}_briefs`].length <
        Math.min(requested[category], possible)
      )
        validationErrors.push(
          `${category} did not satisfy the configured count with available candidates`,
        );
    }
  }
  if (validationErrors.length > 0) {
    throw new Error(`incomplete digest: ${validationErrors.join("; ")}`);
  }
  return report;
}

export async function generateDailyReport(
  articles: ArticleInput[],
): Promise<{
  report: DailyReport;
  tokensUsed: number;
  review?: QualityReview;
}> {
  const grouped: Record<Category, ArticleInput[]> = {
    tech: [],
    finance: [],
    politics: [],
  };
  for (const a of articles) grouped[a.category].push(a);

  const compact = (Object.keys(grouped) as Category[]).flatMap((c) =>
    selectRoundRobin(
      grouped[c],
      getEditorialConfig()?.daily.editorCandidates[c] ?? PER_CATEGORY_LIMIT[c],
    ),
  );

  const retryCompact = (Object.keys(grouped) as Category[]).flatMap((c) =>
    selectRoundRobin(grouped[c], RETRY_CATEGORY_LIMIT[c]),
  );

  const toPayload = (selected: ArticleInput[]) =>
    selected.map((a, i) => ({
      n: i + 1,
      title: a.title,
      url: a.url,
      source: a.source,
      category: a.category,
      // The already-generated introduction is denser and more consistently
      // Chinese than the raw excerpt. The source title and URL remain intact.
      excerpt: (a.summary || a.excerpt || "").slice(0, 160),
      published: a.publishedAt?.toISOString() ?? "",
    }));
  const userPayload = toPayload(compact);
  const retryUserPayload = toPayload(retryCompact);
  const userPayloadJson = JSON.stringify(userPayload);
  const titleOnlyPayloadJson = JSON.stringify(
    retryUserPayload.map(({ excerpt: _excerpt, ...item }) => item),
  );
  const retryPayloadJson = JSON.stringify(retryUserPayload);

  let report: DailyReport;
  try {
    report = await callOnce(userPayloadJson);
  } catch (firstErr) {
    const retryPayload = isContentFilterError(firstErr)
      ? titleOnlyPayloadJson
      : retryPayloadJson;
    console.warn(
      `[pipeline] first LLM call failed, retrying${isContentFilterError(firstErr) ? " without excerpts" : ""}: ${errorMessage(firstErr)}`,
    );
    try {
      // A different model handles recovery so one provider cannot repeat the
      // same malformed-output failure twice in a row.
      report = await callOnce(retryPayload, true, "worker");
    } catch (secondErr) {
      console.warn(
        `[pipeline] DeepSeek worker recovery failed; using deterministic fallback: ${errorMessage(secondErr)}`,
      );
      report = buildDeterministicFallback(compact);
    }
  }

  let review: QualityReview | undefined;
  if (isRoleEnabled("reviewer")) {
    const threshold = getEditorialConfig()?.models.reviewerThreshold ?? 80;
    try {
      const reviewed = await runReviewLoop(report, compact, threshold);
      report = reviewed.report;
      review = reviewed.review;
    } catch (error) {
      console.warn(
        `[reviewer] unavailable after bounded failover; blocking unreviewed digest: ${error instanceof Error ? error.message : String(error)}`,
      );
      const maxAttempts = resolveReviewMaxAttempts();
      review = {
        status: "failed",
        reviewer: "reviewer-unavailable",
        score: 0,
        blockingIssues: [
          "独立审稿模型与备用审稿模型均不可用，本期未完成质量审查。",
        ],
        suggestions: ["恢复 DeepSeek 服务后重新生成并审查本期日报。"],
        summary: "质量审查服务连续不可用，禁止未经审查直接推送。",
        attempt: 0,
        maxAttempts,
        exhausted: true,
        history: [],
      };
    }
    if (review) {
      report.quality_review = review;
      console.log(
        `[reviewer] final ${review.status} score=${review.score} attempt=${review.attempt}/${review.maxAttempts ?? review.attempt} exhausted=${review.exhausted ?? false} model=${review.reviewer}`,
      );
    }
  }

  // Max subscription has no per-call token meter — we expose 0 for schema
  // compatibility; consumers should treat 0 as "metric not available".
  return { report, tokensUsed: 0, review };
}
