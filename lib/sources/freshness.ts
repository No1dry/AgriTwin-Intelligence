import fs from "node:fs";
import path from "node:path";
import type { ArticleInput } from "../ai/pipeline";
import type { SourceDef } from "./types";

export const HISTORY_DAYS = 14;
const ENTITY_FRESH_HOURS = 72;
const VIDEO_FRESH_HOURS = 48;

export interface HistoricalArticle {
  date: string;
  sourceId: string;
  title: string;
  url: string;
  publishedAt?: string | Date;
  meta?: string;
  excerpt?: string;
  metrics?: ArticleInput["metrics"];
}
export interface HistoryIndex {
  byUrl: Map<string, HistoricalArticle[]>;
  byTitle: Map<string, HistoricalArticle[]>;
}
export interface FreshnessStats {
  kept: number;
  repeated: number;
  stale: number;
  insufficient: number;
  githubWithoutGrowth: number;
}

function normalizeTitle(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9\u3400-\u9fff]+/g, "")
    .slice(0, 220);
}
export function canonicalArticleUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(?:utm_|spm|from|share_|vd_source|timestamp)/i.test(key))
        url.searchParams.delete(key);
    }
    // A content file is the identity; the commit SHA is only a version pointer.
    if (url.hostname === "github.com")
      url.pathname = url.pathname.replace(
        /\/blob\/[a-f0-9]{7,40}\//i,
        "/blob/main/",
      );
    url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString();
  } catch {
    return value.trim();
  }
}
function metricNumber(value: string | undefined): number | undefined {
  if (!value) return;
  const normalized = value.replace(/,/g, "").trim();
  const match = normalized.match(/([\d.]+)\s*([km])?/i);
  if (!match) return;
  const multiplier =
    match[2]?.toLowerCase() === "k"
      ? 1_000
      : match[2]?.toLowerCase() === "m"
        ? 1_000_000
        : 1;
  const number = Number.parseFloat(match[1]) * multiplier;
  return Number.isFinite(number) ? Math.round(number) : undefined;
}
export function githubMetrics(
  article: Pick<HistoricalArticle, "meta" | "excerpt" | "metrics">,
): { starsTotal?: number; starsToday?: number } {
  const meta = article.meta ?? "";
  return {
    starsTotal:
      article.metrics?.starsTotal ??
      metricNumber(
        meta.match(/★\s*([\d,.]+\s*[km]?)/i)?.[1] ??
          article.excerpt?.match(/Stars:\s*([\d,.]+\s*[km]?)/i)?.[1],
      ),
    starsToday:
      article.metrics?.starsToday ??
      metricNumber(meta.match(/📈\s*([\d,.]+\s*[km]?)\s+stars?\s+today/i)?.[1]),
  };
}
export function createHistoryIndex(records: HistoricalArticle[]): HistoryIndex {
  const index: HistoryIndex = { byUrl: new Map(), byTitle: new Map() };
  for (const record of records) {
    const url = canonicalArticleUrl(record.url);
    const title = `${record.sourceId}:${normalizeTitle(record.title)}`;
    index.byUrl.set(url, [...(index.byUrl.get(url) ?? []), record]);
    index.byTitle.set(title, [...(index.byTitle.get(title) ?? []), record]);
  }
  return index;
}
export function loadArticleHistory(
  outputDir: string,
  currentDate: string,
  days = HISTORY_DAYS,
): HistoryIndex {
  if (!fs.existsSync(outputDir)) return createHistoryIndex([]);
  const records: HistoricalArticle[] = [];
  const cutoff = Date.parse(`${currentDate}T00:00:00Z`) - days * 86_400_000;
  for (const date of fs
    .readdirSync(outputDir)
    .filter(
      (name) =>
        /^\d{4}-\d{2}-\d{2}$/.test(name) &&
        name < currentDate &&
        Date.parse(`${name}T00:00:00Z`) >= cutoff,
    )) {
    const file = path.join(outputDir, date, `${date}-articles.json`);
    if (!fs.existsSync(file)) continue;
    try {
      const sidecar = JSON.parse(fs.readFileSync(file, "utf8")) as {
        articles?: Array<Omit<HistoricalArticle, "date">>;
      };
      for (const article of sidecar.articles ?? [])
        records.push({ date, ...article });
    } catch (error) {
      console.warn(
        `[freshness] could not read ${file}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return createHistoryIndex(records);
}
function previousItems(
  article: ArticleInput,
  history: HistoryIndex,
): HistoricalArticle[] {
  const urlMatches = history.byUrl.get(canonicalArticleUrl(article.url)) ?? [];
  const titleMatches =
    history.byTitle.get(
      `${article.sourceId}:${normalizeTitle(article.title)}`,
    ) ?? [];
  return [
    ...new Map(
      [...urlMatches, ...titleMatches].map((item) => [
        `${item.date}:${item.url}`,
        item,
      ]),
    ).values(),
  ];
}
function meaningfulTotalStarGain(
  current: number | undefined,
  previous: number | undefined,
): boolean {
  if (current === undefined || previous === undefined || current <= previous)
    return false;
  const required = Math.min(100, Math.max(20, Math.ceil(previous * 0.01)));
  return current - previous >= required;
}
function meaningfulTrendingAcceleration(
  current: number | undefined,
  previous: number | undefined,
): boolean {
  if (current === undefined || previous === undefined || current <= previous)
    return false;
  return current - previous >= Math.max(25, Math.ceil(previous * 0.2));
}
function sourceNeedsRecentPublication(source: SourceDef | undefined): boolean {
  if (!source || source.type === "academic-author") return false;
  return (
    source.type === "github-entity" ||
    source.type === "bilibili-user" ||
    source.type === "youtube-channel" ||
    source.entityType === "person" ||
    source.entityType === "company" ||
    source.entityType === "institution"
  );
}
export function filterFreshArticles(
  articles: ArticleInput[],
  registry: SourceDef[],
  currentDate: string,
  history: HistoryIndex,
): { articles: ArticleInput[]; stats: FreshnessStats } {
  const sourceById = new Map(registry.map((source) => [source.id, source]));
  const endOfDay = Date.parse(`${currentDate}T23:59:59Z`);
  const stats: FreshnessStats = {
    kept: 0,
    repeated: 0,
    stale: 0,
    insufficient: 0,
    githubWithoutGrowth: 0,
  };
  const currentUrls = new Set<string>(),
    currentTitles = new Set<string>();
  const ranked = [...articles].sort((a, b) => {
    if (a.sourceId !== "github-trending" || b.sourceId !== "github-trending")
      return 0;
    return (
      (githubMetrics(b).starsToday ?? 0) - (githubMetrics(a).starsToday ?? 0)
    );
  });
  const kept = ranked.filter((article) => {
    const source = sourceById.get(article.sourceId);
    const urlKey = canonicalArticleUrl(article.url),
      titleKey = `${article.sourceId}:${normalizeTitle(article.title)}`;
    if (currentUrls.has(urlKey) || currentTitles.has(titleKey)) {
      stats.repeated++;
      return false;
    }
    const previous = previousItems(article, history);
    const isGithubRepository =
      /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/?$/i.test(article.url);
    const currentStars = githubMetrics(article).starsTotal;
    const previousStars = previous.length
      ? Math.max(...previous.map((item) => githubMetrics(item).starsTotal ?? 0))
      : undefined;
    const starRevival =
      isGithubRepository &&
      previous.length > 0 &&
      meaningfulTotalStarGain(currentStars, previousStars);
    const published = article.publishedAt?.getTime();
    if (published && sourceNeedsRecentPublication(source)) {
      const maxHours =
        source?.type === "bilibili-user" || source?.type === "youtube-channel"
          ? VIDEO_FRESH_HOURS
          : ENTITY_FRESH_HOURS;
      if (endOfDay - published > maxHours * 3_600_000 && !starRevival) {
        stats.stale++;
        return false;
      }
    }
    if (
      source?.type === "bilibili-user" &&
      (article.contentText ?? article.excerpt ?? "").replace(/\s+/g, " ").trim()
        .length < 24
    ) {
      stats.insufficient++;
      return false;
    }
    if (article.sourceId === "github-trending") {
      const current = githubMetrics(article);
      if (current.starsToday === undefined) {
        stats.insufficient++;
        return false;
      }
      if (previous.length) {
        const previousDaily = Math.max(
          ...previous.map((item) => githubMetrics(item).starsToday ?? 0),
        );
        if (
          !meaningfulTrendingAcceleration(current.starsToday, previousDaily)
        ) {
          stats.githubWithoutGrowth++;
          return false;
        }
      }
    } else if (previous.length) {
      if (isGithubRepository) {
        if (!starRevival) {
          stats.githubWithoutGrowth++;
          return false;
        }
      } else {
        stats.repeated++;
        return false;
      }
    }
    currentUrls.add(urlKey);
    currentTitles.add(titleKey);
    stats.kept++;
    return true;
  });
  return { articles: kept, stats };
}

export function stripTransientContent(
  articles: ArticleInput[],
): Array<Omit<ArticleInput, "contentText">> {
  return articles.map(({ contentText: _contentText, ...article }) => article);
}
