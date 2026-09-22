import "./_env";

import fs from "node:fs";
import path from "node:path";

import { sources, REPORT_LOCALE } from "../lib/sources/registry";
import { fetchSource } from "../lib/sources/dispatch";
import { generateDailyReport, type ArticleInput } from "../lib/ai/pipeline";
import {
  getModelTag,
  hasDedicatedRole,
  isRoleEnabled,
  validateBackendCredentials,
} from "../lib/ai/llm";
import {
  enrichFinanceNewsSummaries,
  enrichGithubTrendingSummaries,
  enrichTechArticleSummaries,
  enrichTrendingPapersSummaries,
  enrichXViralSummaries,
} from "../lib/ai/enrich";
import {
  groupRaw,
  getDisplayedTechArticles,
  isSportsArticle,
  MERGED_SUBGROUP_LIMITS,
  renderHtml,
  renderMarkdown,
} from "../lib/output/render";
import { analyzeWatchlist } from "../lib/trading/runner";
import { fetchCryptoFearGreed } from "../lib/trading/fear-greed";
import { fetchCryptoGlobal } from "../lib/trading/coingecko";
import { generateTradingCommentary } from "../lib/ai/trading-commentary";
import { reviewPaperCandidates } from "../lib/ai/paper-semantic-review";
import type { TradingSection } from "../lib/ai/pipeline";
import { todayKey } from "../lib/utils";
import {
  getEditorialConfig,
  editorialPolicyHash,
} from "../lib/editorial/runtime.mjs";
import {
  filterFreshArticles,
  loadArticleHistory,
  stripTransientContent,
} from "../lib/sources/freshness";
import {
  assessPaperForSelection,
  deriveLegacyDisplayedPaperKeys,
  isResearchPaper,
  PAPER_HISTORY_DAYS,
  paperCanonicalKey,
  selectCuratedPapers,
} from "../lib/papers/curation";

const OUTPUT_DIR = "daily_reports";

function loadRecentDisplayedPaperKeys(currentDate: string): Set<string> {
  if (!fs.existsSync(OUTPUT_DIR)) return new Set();
  const dates = fs
    .readdirSync(OUTPUT_DIR)
    .filter(
      (entry) =>
        /^\d{4}-\d{2}-\d{2}$/.test(entry) &&
        entry < currentDate &&
        (!getEditorialConfig() ||
          (Date.parse(currentDate) - Date.parse(entry)) / 86400000 <=
            getEditorialConfig()!.papers.historyDays),
    )
    .sort()
    .reverse()
    .slice(0, getEditorialConfig()?.papers.historyDays ?? PAPER_HISTORY_DAYS);
  const keys = new Set<string>();
  for (const date of dates) {
    const file = path.join(OUTPUT_DIR, date, `${date}-articles.json`);
    if (!fs.existsSync(file)) continue;
    try {
      const sidecar = JSON.parse(fs.readFileSync(file, "utf8")) as {
        articles?: Array<ArticleInput & { publishedAt?: string | Date }>;
        displayedPaperKeys?: string[];
      };
      if (Array.isArray(sidecar.displayedPaperKeys)) {
        for (const key of sidecar.displayedPaperKeys) keys.add(key);
        continue;
      }
      const revived = (sidecar.articles ?? []).map((article) => ({
        ...article,
        publishedAt: article.publishedAt
          ? new Date(article.publishedAt)
          : undefined,
      }));
      for (const key of deriveLegacyDisplayedPaperKeys(revived, sources))
        keys.add(key);
    } catch (error) {
      console.warn(
        `[daily] could not read paper history ${file}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return keys;
}

async function curatePaperPool(
  articles: ArticleInput[],
  currentDate: string,
): Promise<{
  selectedKeys: string[];
  candidateCount: number;
  repeatedCount: number;
  diagnostics: Array<{
    title: string;
    url: string;
    sourceId: string;
    score: number;
    focusTags: string[];
    deterministicScore: number;
    semanticScore?: number;
    semanticReason?: string;
    decision: "selected" | "history" | "no-focus" | "below-threshold" | "limit";
  }>;
}> {
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const candidates = articles.filter((article) =>
    isResearchPaper(article, sourceById.get(article.sourceId)),
  );
  const history = loadRecentDisplayedPaperKeys(currentDate);
  const repeatedCount = candidates.filter((article) =>
    history.has(paperCanonicalKey(article)),
  ).length;
  const semanticAssessments = await reviewPaperCandidates(candidates);
  const selected = selectCuratedPapers(candidates, sources, {
    excludedKeys: history,
    semanticAssessments,
  });
  const selectedKeys = new Set(selected.map(paperCanonicalKey));
  const threshold = getEditorialConfig()?.papers.minimumScore ?? 52;
  const diagnostics = candidates.map((article) => {
    const key = paperCanonicalKey(article);
    const assessment = assessPaperForSelection(
      article,
      sourceById.get(article.sourceId),
      semanticAssessments.get(article.url),
    );
    let decision:
      "selected" | "history" | "no-focus" | "below-threshold" | "limit";
    if (selectedKeys.has(key)) decision = "selected";
    else if (history.has(key)) decision = "history";
    else if (assessment.focusTags.length === 0) decision = "no-focus";
    else if (assessment.score < threshold) decision = "below-threshold";
    else decision = "limit";
    return {
      title: article.title,
      url: article.url,
      sourceId: article.sourceId,
      score: Math.round(assessment.score * 10) / 10,
      focusTags: assessment.focusTags,
      deterministicScore: Math.round(assessment.deterministicScore * 10) / 10,
      semanticScore: assessment.semantic
        ? Math.round(
            (assessment.semantic.relevance * 0.6 +
              assessment.semantic.quality * 0.4) *
              10,
          ) / 10
        : undefined,
      semanticReason: assessment.semantic?.reason,
      decision,
    };
  });
  for (const article of selected) {
    const assessment = assessPaperForSelection(
      article,
      sourceById.get(article.sourceId),
      semanticAssessments.get(article.url),
    );
    const focusMeta = `研究重点：${assessment.focusTags.join(" / ")}`;
    article.meta = article.meta ? `${article.meta} · ${focusMeta}` : focusMeta;
  }
  const selectedObjects = new Set(selected);
  const kept = articles.filter((article) => {
    if (!isResearchPaper(article, sourceById.get(article.sourceId)))
      return true;
    return selectedObjects.has(article);
  });
  articles.splice(0, articles.length, ...kept);
  return {
    selectedKeys: [...selectedKeys],
    candidateCount: candidates.length,
    repeatedCount,
    diagnostics,
  };
}

async function fetchAll(): Promise<{
  articles: ArticleInput[];
  shadowArticles: ArticleInput[];
}> {
  const articles: ArticleInput[] = [];
  const shadowArticles: ArticleInput[] = [];
  const enabled = sources.filter((s) => s.enabled !== false);
  const configuredConcurrency = Number.parseInt(
    process.env.SOURCE_FETCH_CONCURRENCY ?? "6",
    10,
  );
  const concurrency =
    Number.isFinite(configuredConcurrency) && configuredConcurrency > 0
      ? Math.min(configuredConcurrency, 12)
      : 6;
  const fetched = new Array<Awaited<ReturnType<typeof fetchSource>> | null>(
    enabled.length,
  ).fill(null);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, enabled.length) }, async () => {
      while (cursor < enabled.length) {
        const index = cursor++;
        const source = enabled[index];
        try {
          const items = await fetchSource(source);
          fetched[index] = items;
          console.log(
            `  ${source.id.padEnd(20)} ${items.length}${source.shadowMode ? " [shadow]" : ""}`,
          );
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error(`  ${source.id.padEnd(20)} FAILED — ${msg}`);
        }
      }
    }),
  );
  for (let index = 0; index < enabled.length; index++) {
    const source = enabled[index];
    const target = source.shadowMode ? shadowArticles : articles;
    target.push(
      ...(fetched[index] ?? []).map((item) => ({
        ...item,
        source: source.name,
      })),
    );
  }
  return { articles, shadowArticles };
}

async function enrichGhTrending(articles: ArticleInput[]): Promise<void> {
  const gh = articles.filter((a) => a.sourceId === "github-trending");
  if (gh.length === 0) return;
  console.log(
    `[daily] enriching ${gh.length} GitHub Trending repos with ${REPORT_LOCALE} summaries…`,
  );
  const t0 = Date.now();
  const summaries = await enrichGithubTrendingSummaries(gh);
  for (const a of gh) {
    const s = summaries.get(a.url);
    if (s) a.summary = s;
  }
  console.log(
    `[daily] enrichment done in ${((Date.now() - t0) / 1000).toFixed(1)}s, matched ${summaries.size}/${gh.length}`,
  );
}

/**
 * finance:news is rendered as a merged time-sorted list (see
 * MERGED_SUBGROUP_LIMITS in render.ts). Enrich exactly the items that
 * will be displayed: take all enabled finance:news articles, sort by
 * publishedAt desc, slice to the merge limit, ask Sonnet for Chinese
 * factual summaries.
 */
async function enrichFinanceNews(articles: ArticleInput[]): Promise<void> {
  await enrichMergedSubgroup(articles, "finance", "news");
}

async function enrichPolitics(articles: ArticleInput[]): Promise<void> {
  await enrichMergedSubgroup(articles, "politics", "world");
}

async function enrichAiNews(articles: ArticleInput[]): Promise<void> {
  await enrichMergedSubgroup(articles, "tech", "ai-news");
}

async function enrichAiApplications(articles: ArticleInput[]): Promise<void> {
  await enrichMergedSubgroup(articles, "tech", "ai-applications");
}

/**
 * X 热帖 enrichment is different from merged subgroups — we preserve the
 * AttentionVC API's heat-rank order (do NOT sort by date) and cap to the
 * displayed limit (matches SOURCE_DISPLAY_LIMITS["tech:x-viral"]).
 *
 * The Sonnet prompt also differs (XVIRAL_SYSTEM_PROMPT in enrich.ts) — X
 * tweet titles are clickbait, the previewText holds the actual claim.
 */
async function enrichXViral(articles: ArticleInput[]): Promise<void> {
  const xPosts = articles
    .filter((a) => a.sourceId === "attentionvc-ai")
    .slice(0, 20);
  if (xPosts.length === 0) return;
  console.log(
    `[daily] enriching ${xPosts.length} X posts with ${REPORT_LOCALE} summaries…`,
  );
  const t0 = Date.now();
  // Author handle is encoded in the URL (https://x.com/{handle}/status/{id})
  // — extract it to help the model identify whose claim it is.
  const summaries = await enrichXViralSummaries(
    xPosts.map((a) => ({
      url: a.url,
      title: a.title,
      excerpt: a.excerpt,
      author: a.url.match(/x\.com\/([^/]+)\//)?.[1] ?? "",
    })),
  );
  for (const a of xPosts) {
    const s = summaries.get(a.url);
    if (s) a.summary = s;
  }
  console.log(
    `[daily] enrichment done in ${((Date.now() - t0) / 1000).toFixed(1)}s, matched ${summaries.size}/${xPosts.length}`,
  );
}

/** Generate research-style summaries for the already curated paper set. */
async function enrichTrendingPapers(articles: ArticleInput[]): Promise<void> {
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const papers = articles
    .filter((article) =>
      isResearchPaper(article, sourceById.get(article.sourceId)),
    )
    .slice(0, 20);
  if (papers.length === 0) return;
  console.log(
    `[daily] enriching ${papers.length} curated papers with ${REPORT_LOCALE} summaries…`,
  );
  const t0 = Date.now();
  const summaries = await enrichTrendingPapersSummaries(
    papers.map((a) => ({ url: a.url, title: a.title, excerpt: a.excerpt })),
  );
  for (const a of papers) {
    const s = summaries.get(a.url);
    if (s) a.summary = s;
  }
  console.log(
    `[daily] enrichment done in ${((Date.now() - t0) / 1000).toFixed(1)}s, matched ${summaries.size}/${papers.length}`,
  );
}

function fallbackTechIntroduction(article: ArticleInput): string {
  const excerpt = (article.excerpt ?? "").replace(/\s+/g, " ").trim();
  if (REPORT_LOCALE === "en") {
    return (
      excerpt.slice(0, 180) ||
      `Technical update from ${article.source || "the original source"}; open the source for full details.`
    );
  }
  if (/[\u3400-\u9fff]/.test(excerpt)) {
    return excerpt.length > 120 ? `${excerpt.slice(0, 119)}…` : excerpt;
  }
  return `来自${article.source || "原始信源"}的技术动态，主题为「${article.title}」。当前可用信息有限，请查看原文了解具体方法、结果与应用。`;
}

async function enrichDisplayedTech(articles: ArticleInput[]): Promise<void> {
  const displayed = getDisplayedTechArticles(articles, sources);
  const missing = displayed.filter((article) => !article.summary?.trim());
  if (missing.length === 0) return;
  console.log(
    `[daily] enriching ${missing.length}/${displayed.length} displayed technical items…`,
  );

  const chunks: ArticleInput[][] = [];
  for (let index = 0; index < missing.length; index += 16) {
    chunks.push(missing.slice(index, index + 16));
  }
  let cursor = 0;
  await Promise.all(
    Array.from(
      {
        length: Math.min(
          getEditorialConfig()?.models.workerConcurrency ?? 2,
          chunks.length,
        ),
      },
      async () => {
        while (cursor < chunks.length) {
          const chunk = chunks[cursor++];
          const summaries = await enrichTechArticleSummaries(chunk);
          for (const article of chunk) {
            const summary = summaries.get(article.url);
            if (summary) article.summary = summary;
          }
        }
      },
    ),
  );

  for (const article of displayed) {
    if (!article.summary?.trim())
      article.summary = fallbackTechIntroduction(article);
  }
  const completed = displayed.filter((article) =>
    article.summary?.trim(),
  ).length;
  console.log(
    `[daily] technical introductions ready: ${completed}/${displayed.length}`,
  );
}

/**
 * Shared implementation for "merged subgroup" enrichment: collect all
 * enabled articles in (category, subcategory), sort by date desc, take
 * the display cap (from MERGED_SUBGROUP_LIMITS), and ask the LLM to
 * summarize them into REPORT_LOCALE in a single batch. Symmetric to the
 * merge logic in render.ts groupRaw, so display and enrichment stay aligned.
 *
 * Sources whose `lang` already matches REPORT_LOCALE are skipped — no
 * point translating English to English (en mode) or Chinese to Chinese
 * (zh mode).
 */
async function enrichMergedSubgroup(
  articles: ArticleInput[],
  category: "tech" | "finance" | "politics",
  subcategory: string,
): Promise<void> {
  const subSources = sources.filter(
    (s) =>
      s.category === category &&
      s.subcategory === subcategory &&
      s.enabled !== false &&
      !s.shadowMode,
  );
  const enabledIds = new Set(subSources.map((s) => s.id));
  const sameLocaleIds = new Set(
    subSources
      .filter((s) => (s.lang ?? "en") === REPORT_LOCALE)
      .map((s) => s.id),
  );
  const limit = MERGED_SUBGROUP_LIMITS[`${category}:${subcategory}`] ?? 12;
  // Top-N respects all enabled sources (so we don't reshape the merged
  // timeline). Enrichment only targets items NOT already in the target
  // language within that slice.
  const top = articles
    .filter((a) => enabledIds.has(a.sourceId))
    .filter((a) => category !== "politics" || !isSportsArticle(a.title))
    .sort(
      (a, b) =>
        (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0),
    )
    .slice(0, limit);
  const toEnrich = top.filter((a) => !sameLocaleIds.has(a.sourceId));
  if (toEnrich.length === 0) return;
  console.log(
    `[daily] enriching ${toEnrich.length}/${top.length} ${category}:${subcategory} items with ${REPORT_LOCALE} summaries…`,
  );
  const t0 = Date.now();
  const summaries = await enrichFinanceNewsSummaries(toEnrich);
  for (const a of toEnrich) {
    const s = summaries.get(a.url);
    if (s) a.summary = s;
  }
  console.log(
    `[daily] enrichment done in ${((Date.now() - t0) / 1000).toFixed(1)}s, matched ${summaries.size}/${toEnrich.length}`,
  );
}

/**
 * Pull daily OHLCV from Yahoo for every ticker in the watchlist, compute
 * indicators + signals, then ask Sonnet for a market overview + a
 * picks-to-watch list. Returns null if no ticker came back.
 */
async function runTrading(): Promise<TradingSection | null> {
  console.log(
    `[daily] analyzing watchlist + crypto context (Yahoo / alt.me / CoinGecko)…`,
  );
  const t0 = Date.now();
  const [tickers, cryptoFearGreed, cryptoGlobal] = await Promise.all([
    analyzeWatchlist(),
    fetchCryptoFearGreed(),
    fetchCryptoGlobal(),
  ]);
  console.log(
    `[daily] indicators ready in ${((Date.now() - t0) / 1000).toFixed(1)}s — ${tickers.length} tickers` +
      (cryptoFearGreed ? `, F&G ${cryptoFearGreed.value}` : ", F&G ✗") +
      (cryptoGlobal
        ? `, BTC dom ${cryptoGlobal.btcDominance.toFixed(1)}%`
        : ", CG ✗"),
  );
  if (tickers.length === 0) return null;
  console.log(`[daily] generating trading commentary with ${getModelTag()}…`);
  const t1 = Date.now();
  const commentary = await generateTradingCommentary({
    tickers,
    cryptoFearGreed: cryptoFearGreed ?? undefined,
    cryptoGlobal: cryptoGlobal ?? undefined,
  });
  console.log(
    `[daily] trading commentary ready in ${((Date.now() - t1) / 1000).toFixed(1)}s`,
  );
  return {
    ...commentary,
    tickers,
    crypto_fear_greed: cryptoFearGreed ?? undefined,
    crypto_global: cryptoGlobal ?? undefined,
    generated_at: new Date().toISOString(),
  };
}

async function main() {
  // Fail fast on misconfigured backend before we spend 30s fetching
  // 500+ articles only to discover the LLM has no credentials.
  validateBackendCredentials();

  const date = todayKey();
  console.log(`[daily] editorial configuration: ${editorialPolicyHash()}`);
  console.log(
    `[daily] model roles: worker=${getModelTag("worker")}${hasDedicatedRole("worker") ? "" : " (editor fallback)"}, editor=${getModelTag("editor")}, reviewer=${isRoleEnabled("reviewer") ? getModelTag("reviewer") : "disabled"}`,
  );
  console.log(`[daily] ${date} — fetching sources…\n`);
  const { articles, shadowArticles } = await fetchAll();
  const freshness = filterFreshArticles(
    articles,
    sources,
    date,
    loadArticleHistory(OUTPUT_DIR, date),
  );
  articles.splice(0, articles.length, ...freshness.articles);
  console.log(
    `[daily] freshness filter: ${freshness.stats.kept} kept, ${freshness.stats.repeated} repeated, ${freshness.stats.stale} stale, ${freshness.stats.githubWithoutGrowth} GitHub without material star growth, ${freshness.stats.insufficient} insufficient-content`,
  );
  const paperCuration = await curatePaperPool(articles, date);
  console.log(
    `[daily] papers curated: ${paperCuration.selectedKeys.length}/${paperCuration.candidateCount}` +
      ` selected, ${paperCuration.repeatedCount} seen in the previous ${getEditorialConfig()?.papers.historyDays ?? PAPER_HISTORY_DAYS} ${getEditorialConfig() ? "days" : "reports"}`,
  );
  const paperDecisionCounts = paperCuration.diagnostics.reduce<
    Record<string, number>
  >((counts, item) => {
    counts[item.decision] = (counts[item.decision] ?? 0) + 1;
    return counts;
  }, {});
  console.log(
    `[daily] paper decisions: ${Object.entries(paperDecisionCounts)
      .map(([decision, count]) => `${decision}=${count}`)
      .join(", ")}`,
  );
  console.log(`\n[daily] total articles: ${articles.length}`);
  console.log(`[daily] shadow articles: ${shadowArticles.length}`);
  if (articles.length === 0) {
    throw new Error("no articles fetched — aborting");
  }

  // Enrich GH Trending, papers, finance news, and politics with summaries.
  await enrichGhTrending(articles);
  await enrichTrendingPapers(articles);
  await enrichFinanceNews(articles);
  await enrichPolitics(articles);
  await enrichAiNews(articles);
  await enrichAiApplications(articles);
  await enrichXViral(articles);
  await enrichDisplayedTech(articles);

  // Trading signals: Yahoo fetch + indicators + commentary. Non-fatal —
  // if it errors, we still ship the news digest.
  let trading: TradingSection | null = null;
  try {
    trading = await runTrading();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[daily] trading section failed: ${msg}`);
  }

  console.log(`[daily] generating digest with ${getModelTag()}…`);
  const t0 = Date.now();
  const { report } = await generateDailyReport(articles);
  if (trading) report.trading = trading;
  console.log(
    `[daily] digest ready in ${((Date.now() - t0) / 1000).toFixed(1)}s`,
  );

  const dateDir = path.join(OUTPUT_DIR, date);
  fs.mkdirSync(dateDir, { recursive: true });
  const base = path.join(dateDir, date);
  fs.writeFileSync(
    `${base}-shadow-articles.json`,
    JSON.stringify({ date, articles: shadowArticles }, null, 2),
    "utf8",
  );
  const raw = groupRaw(articles, sources);
  const sidecarArticles = stripTransientContent(articles);
  fs.writeFileSync(`${base}.json`, JSON.stringify(report, null, 2), "utf8");
  // Sidecar with all fetched articles + LLM-attached summary, so
  // scripts/render.ts can rebuild HTML/MD for UI iteration without
  // re-fetching or re-calling the LLM.
  fs.writeFileSync(
    `${base}-articles.json`,
    JSON.stringify(
      {
        date,
        editorialPolicyHash: editorialPolicyHash(),
        freshness: freshness.stats,
        paperDiagnostics: paperCuration.diagnostics,
        displayedPaperKeys: paperCuration.selectedKeys,
        articles: sidecarArticles,
      },
      null,
      2,
    ),
    "utf8",
  );
  fs.writeFileSync(`${base}.html`, renderHtml(report, raw, date), "utf8");
  if (process.env.OUTPUT_MARKDOWN === "true") {
    fs.writeFileSync(`${base}.md`, renderMarkdown(report, date), "utf8");
    console.log(
      `[daily] wrote ${base}.{json,html,md,articles.json,shadow-articles.json}`,
    );
  } else {
    console.log(
      `[daily] wrote ${base}.{json,html,articles.json,shadow-articles.json}`,
    );
  }

  console.log(`[daily] done.`);
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(`[daily] FAILED:`, e);
    process.exit(1);
  },
);
