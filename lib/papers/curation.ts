import type { ArticleInput } from "../ai/pipeline";
import type { SourceDef } from "../sources/types";
import { getEditorialConfig, matchingTopics } from "../editorial/runtime.mjs";

export const PAPER_DISPLAY_LIMIT = 20;
export const PAPER_HISTORY_DAYS = 14;
export const MIN_PAPER_SCORE = 52;

export interface PaperAssessment {
  score: number;
  focusTags: string[];
}

export interface SemanticPaperAssessment {
  relevance: number;
  quality: number;
  novelty: number;
  topics: string[];
  reason: string;
}

export interface PaperSelectionAssessment extends PaperAssessment {
  deterministicScore: number;
  semantic?: SemanticPaperAssessment;
}

const FOCUS_PATTERNS: Array<{ tag: string; score: number; pattern: RegExp }> = [
  {
    tag: "VLA",
    score: 48,
    pattern:
      /\bVLA(?:s)?\b|vision[-\s]?language[-\s]?action|vision[-\s]?language[-\s]?(?:control|policy)|robotic foundation model/i,
  },
  {
    tag: "World Model",
    score: 44,
    pattern:
      /\bworld[-\s]?models?\b|latent[-\s](?:dynamics|world)|predictive world|video world model/i,
  },
  {
    tag: "Agent",
    score: 34,
    pattern:
      /\bagents?\b|agentic|multi[-\s]?agent|tool[-\s]?(?:use|using)|computer[-\s]?use|web[-\s]?agent|autonomous research/i,
  },
  {
    tag: "具身智能",
    score: 32,
    pattern:
      /embodied (?:ai|agent|intelligence|reasoning)|robot learning|robot policy|visuomotor|具身智能|机器人学习|机器人策略/i,
  },
];

const PAPER_SOURCE_IDS = new Set([
  "huggingface-papers",
  "arxiv-cs-ai",
  "arxiv-cs-lg",
  "openreview",
]);

function articleTime(article: ArticleInput): number {
  const value = article.publishedAt;
  if (!value) return 0;
  const timestamp =
    value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function textOf(article: ArticleInput): string {
  return `${article.title}\n${article.excerpt ?? ""}\n${article.contentText ?? ""}\n${article.summary ?? ""}`;
}

export function isResearchPaper(
  article: ArticleInput,
  source: SourceDef | undefined,
): boolean {
  return (
    PAPER_SOURCE_IDS.has(article.sourceId) || source?.type === "academic-author"
  );
}

export function paperCanonicalKey(article: ArticleInput): string {
  const arxivId = article.url.match(
    /(?:arxiv\.org\/(?:abs|pdf)\/|huggingface\.co\/papers\/)(\d{4}\.\d{4,5})(?:v\d+)?/i,
  )?.[1];
  if (arxivId) return `arxiv:${arxivId.toLowerCase()}`;

  const normalizedTitle = article.title
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9\u3400-\u9fff]+/g, "")
    .slice(0, 180);
  return normalizedTitle ? `title:${normalizedTitle}` : `url:${article.url}`;
}

export function assessPaper(
  article: ArticleInput,
  source: SourceDef | undefined,
): PaperAssessment {
  const text = textOf(article);
  const config = getEditorialConfig();
  const points: Record<string, number> = {
    vla: 48 / 1.4,
    agent: 34 / 1.2,
    "world-model": 44,
    embodied: 32 / 0.8,
  };
  const configuredTopics = matchingTopics(article, config);
  const focusMatches = config
    ? configuredTopics.map((topic) => ({
        tag: topic.name,
        score: (points[topic.id] ?? 34) * topic.weight,
      }))
    : FOCUS_PATTERNS.filter(({ pattern }) => pattern.test(text));
  const focusTags = focusMatches.map(({ tag }) => tag);
  let score = focusMatches.reduce((total, match) => total + match.score, 0);
  if (focusMatches.length > 1) score += 8;

  const excerpt = (article.excerpt ?? "").trim();
  if (excerpt.length >= 180) score += 6;
  else if (excerpt.length >= 80) score += 3;
  else if (excerpt.length === 0) score -= 24;

  if (
    /\b(?:we (?:introduce|propose|present|develop)|novel|new framework)\b|新方法|提出|发布/i.test(
      text,
    )
  )
    score += 5;
  if (
    /benchmark|evaluation|experiment|ablation|outperform|state[- ]of[- ]the[- ]art|real[- ]world|评测|实验|消融|真实环境/i.test(
      text,
    )
  )
    score += 8;
  if (
    /open[- ]source|github|code (?:is|will be)|dataset|数据集|开源|代码/i.test(
      text,
    )
  )
    score += 7;
  if (
    /\b\d+(?:\.\d+)?%|\b\d+(?:\.\d+)?[×x]\b|accuracy|success rate|准确率|成功率/i.test(
      text,
    )
  )
    score += 6;

  if (article.sourceId === "huggingface-papers") {
    const upvotes = Number.parseInt(article.meta?.match(/\d+/)?.[0] ?? "0", 10);
    score += Math.min(18, Math.round(Math.log2(upvotes + 1) * 3));
  } else if (source?.type === "academic-author") {
    score += 8;
  } else if (article.sourceId === "openreview") {
    score += /accepted|oral|spotlight|poster/i.test(text) ? 10 : 2;
  } else if (article.sourceId.startsWith("arxiv-")) {
    score += 4;
  }

  const ageDays = articleTime(article)
    ? Math.max(0, (Date.now() - articleTime(article)) / 86_400_000)
    : 30;
  score += Math.max(0, 7 - Math.floor(ageDays));
  if (ageDays > 30) score -= 20;

  if (
    /\b(?:survey|position paper|perspective|overview)\b|综述|观点论文/i.test(
      article.title,
    )
  )
    score -= 10;
  if (/\btowards?\b/i.test(article.title)) score -= 4;
  if (
    focusTags.length === 1 &&
    (config ? configuredTopics[0]?.id === "agent" : focusTags[0] === "Agent") &&
    /clinical|medical|health|eye clinic|air combat|reaction database|chemistry|drug discovery|finance|trading|临床|医疗|化学|空战|金融/i.test(
      article.title,
    )
  ) {
    score -= 24;
  }
  if (
    /introduces multi-factor|supporting openreview|view all|newsletter|conference|symposium|meeting|edition/i.test(
      article.title,
    )
  )
    score -= 60;

  return { score, focusTags };
}

export function assessPaperForSelection(
  article: ArticleInput,
  source: SourceDef | undefined,
  semantic?: SemanticPaperAssessment,
): PaperSelectionAssessment {
  const deterministic = assessPaper(article, source);
  if (!semantic) {
    return {
      ...deterministic,
      deterministicScore: deterministic.score,
    };
  }
  const focusTags = [
    ...new Set([...deterministic.focusTags, ...semantic.topics]),
  ];
  const score =
    deterministic.score * 0.4 +
    semantic.relevance * 0.35 +
    semantic.quality * 0.25;
  return {
    score,
    focusTags,
    deterministicScore: deterministic.score,
    semantic,
  };
}

function sourceBucket(
  article: ArticleInput,
  source: SourceDef | undefined,
): string {
  if (article.sourceId.startsWith("arxiv-")) return "arxiv";
  if (article.sourceId === "huggingface-papers") return "huggingface";
  if (article.sourceId === "openreview") return "openreview";
  if (source?.type === "academic-author") return "academic-author";
  return article.sourceId;
}

const SOURCE_CAPS: Record<string, number> = {
  arxiv: 6,
  huggingface: 10,
  openreview: 4,
  "academic-author": 4,
};

export function selectCuratedPapers(
  articles: ArticleInput[],
  registry: SourceDef[],
  options: {
    maxItems?: number;
    excludedKeys?: Set<string>;
    semanticAssessments?: Map<string, SemanticPaperAssessment>;
  } = {},
): ArticleInput[] {
  const sourceById = new Map(registry.map((source) => [source.id, source]));
  const excludedKeys = options.excludedKeys ?? new Set<string>();
  const config = getEditorialConfig();
  const bestByKey = new Map<string, { article: ArticleInput; score: number }>();

  for (const article of articles) {
    const source = sourceById.get(article.sourceId);
    if (!isResearchPaper(article, source)) continue;
    const key = paperCanonicalKey(article);
    if (excludedKeys.has(key)) continue;
    const assessment = assessPaperForSelection(
      article,
      source,
      options.semanticAssessments?.get(article.url),
    );
    if (config?.papers.requireAbstract && !article.excerpt?.trim()) continue;
    if (
      assessment.focusTags.length === 0 ||
      assessment.score < (config?.papers.minimumScore ?? MIN_PAPER_SCORE)
    )
      continue;
    const previous = bestByKey.get(key);
    if (!previous || assessment.score > previous.score) {
      bestByKey.set(key, { article, score: assessment.score });
    }
  }

  const ranked = [...bestByKey.values()].sort(
    (a, b) =>
      b.score - a.score || articleTime(b.article) - articleTime(a.article),
  );
  const counts = new Map<string, number>();
  const selected: ArticleInput[] = [];
  for (const entry of ranked) {
    const source = sourceById.get(entry.article.sourceId);
    const bucket = sourceBucket(entry.article, source);
    const count = counts.get(bucket) ?? 0;
    const cap =
      bucket === "arxiv"
        ? (config?.papers.arxivMaximum ?? SOURCE_CAPS.arxiv)
        : (SOURCE_CAPS[bucket] ?? PAPER_DISPLAY_LIMIT);
    if (count >= cap) continue;
    selected.push(entry.article);
    counts.set(bucket, count + 1);
    if (
      selected.length >=
      (options.maxItems ?? config?.papers.dailyMaximum ?? PAPER_DISPLAY_LIMIT)
    )
      break;
  }
  return selected;
}

/** Reconstruct the old date-first paper list for sidecars written before curation metadata existed. */
export function deriveLegacyDisplayedPaperKeys(
  articles: ArticleInput[],
  registry: SourceDef[],
): string[] {
  const sourceById = new Map(registry.map((source) => [source.id, source]));
  return articles
    .filter((article) =>
      isResearchPaper(article, sourceById.get(article.sourceId)),
    )
    .sort((a, b) => articleTime(b) - articleTime(a))
    .slice(0, PAPER_DISPLAY_LIMIT)
    .map(paperCanonicalKey);
}
