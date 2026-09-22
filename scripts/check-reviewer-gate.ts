import assert from "node:assert/strict";
import {
  normalizeQualityReview,
  reviewDailyReportWithFailover,
  stabilizeRevisedReport,
  validateEvidenceBoundReport,
} from "../lib/ai/reviewer";
import {
  runReviewLoop,
  validateDailyReport,
  type ArticleInput,
  type DailyReport,
} from "../lib/ai/pipeline";

const passed = normalizeQualityReview(
  {
    score: 88,
    passed: true,
    blocking_issues: [],
    suggestions: ["压缩总览第二句"],
    summary: "事实与结构完整",
  },
  80,
  1,
  "deepseek-deepseek-v4-pro",
);
assert.equal(passed.status, "passed");
assert.equal(passed.score, 88);

const blocked = normalizeQualityReview(
  {
    score: 95,
    passed: true,
    blocking_issues: [" 一条 URL 与候选证据不匹配  "],
    suggestions: [],
    summary: "存在事实问题",
  },
  80,
  1,
  "deepseek-deepseek-v4-pro",
);
assert.equal(blocked.status, "failed");
assert.deepEqual(blocked.blockingIssues, ["一条 URL 与候选证据不匹配"]);

const belowThreshold = normalizeQualityReview(
  {
    score: 79,
    passed: true,
    blocking_issues: [],
    suggestions: [],
    summary: "分数不足",
  },
  80,
  2,
  "deepseek-deepseek-v4-pro",
);
assert.equal(belowThreshold.status, "failed");
assert.equal(belowThreshold.attempt, 2);

const counts = { tech: 5, finance: 5, politics: 3 } as const;
const articles = (Object.keys(counts) as ArticleInput["category"][]).flatMap(
  (category) =>
    Array.from({ length: counts[category] }, (_, index): ArticleInput => ({
      sourceId: `${category}-${index}`,
      source: `${category} source ${index}`,
      title: `${category} title ${index}`,
      url: `https://example.com/${category}/${index}`,
      excerpt: `${category} evidence ${index}`,
      summary: `${category} 中文事实摘要 ${index}`,
      publishedAt: new Date(),
      category,
    })),
);

function makeReport(): DailyReport {
  const section = (category: ArticleInput["category"]) =>
    articles
      .filter((article) => article.category === category)
      .map((article) => ({
        title: article.title,
        url: article.url,
        source: article.source,
        summary: article.summary!,
        importance: 7,
      }));
  return {
    hero_headline: "测试头条",
    daily_overview: "这是一段覆盖技术、财经与时政的完整测试总览。",
    tech_briefs: section("tech"),
    finance_briefs: section("finance"),
    politics_briefs: section("politics"),
    editor_note: "测试编辑短评",
    keywords: ["VLA", "Agent", "World Model", "市场", "政策"],
  };
}

const baseline = makeReport();
const stabilized = stabilizeRevisedReport(
  baseline,
  {
    hero_headline: "返修后的头条",
    tech_briefs: [
      {
        ...baseline.tech_briefs[0],
        summary: "返修后的科技摘要",
      },
    ],
    finance_briefs: [],
    politics_briefs: [],
    editor_note: "",
    keywords: [],
  },
  articles,
);
assert.deepEqual(validateDailyReport(stabilized), []);
assert.deepEqual(validateEvidenceBoundReport(stabilized, articles), []);
assert.equal(stabilized.tech_briefs.length, 5);
assert.equal(stabilized.finance_briefs.length, 5);
assert.equal(stabilized.politics_briefs.length, 3);
assert.equal(stabilized.editor_note, baseline.editor_note);

async function checkReviewLoop(): Promise<void> {
const reviewerRoles: string[] = [];
const failoverReview = await reviewDailyReportWithFailover(
  baseline,
  articles,
  80,
  1,
  async (_report, _articles, threshold, attempt, role) => {
    if (!role) throw new Error("review role missing");
    reviewerRoles.push(role);
    if (role === "reviewer") throw new Error("empty reviewer response");
    return normalizeQualityReview(
      {
        score: 84,
        passed: true,
        blocking_issues: [],
        suggestions: [],
        summary: "备用审稿通过",
      },
      threshold,
      attempt,
      "deepseek-deepseek-flash",
    );
  },
);
assert.deepEqual(reviewerRoles, ["reviewer", "reviewer", "worker"]);
assert.equal(failoverReview.status, "passed");
assert.equal(failoverReview.reviewer, "deepseek-deepseek-flash");

let reviewCalls = 0;
let revisionCalls = 0;
const loopPassed = await runReviewLoop(baseline, articles, 80, {
  maxAttempts: 4,
  revisionRetries: 1,
  review: async (_report, _articles, threshold, attempt) => {
    reviewCalls += 1;
    const score = [62, 74, 86][attempt - 1] ?? 86;
    return normalizeQualityReview(
      {
        score,
        passed: attempt >= 3,
        blocking_issues: attempt >= 3 ? [] : [`第 ${attempt} 轮仍需返修`],
        suggestions: attempt >= 3 ? [] : ["根据证据补充并去重"],
        summary: attempt >= 3 ? "质量达标" : "继续返修",
      },
      threshold,
      attempt,
      "deepseek-deepseek-v4-pro",
    );
  },
  revise: async (report, evidence, _review, options) => {
    revisionCalls += 1;
    return stabilizeRevisedReport(
      report,
      { hero_headline: `第 ${options.nextAttempt} 轮返修头条` },
      evidence,
    );
  },
});
assert.equal(loopPassed.review.status, "passed");
assert.equal(loopPassed.review.attempt, 3);
assert.equal(loopPassed.review.exhausted, false);
assert.equal(loopPassed.review.history?.length, 3);
assert.equal(reviewCalls, 3);
assert.equal(revisionCalls, 2);

const fallbackRoles: string[] = [];
const workerFallback = await runReviewLoop(baseline, articles, 80, {
  maxAttempts: 2,
  revisionRetries: 2,
  review: async (_report, _articles, threshold, attempt) =>
    normalizeQualityReview(
      {
        score: attempt === 1 ? 74 : 85,
        passed: attempt === 2,
        blocking_issues: attempt === 1 ? ["覆盖不足"] : [],
        suggestions: attempt === 1 ? ["补充关键事件"] : [],
        summary: attempt === 1 ? "需要返修" : "返修通过",
      },
      threshold,
      attempt,
      "deepseek-deepseek-v4-pro",
    ),
  revise: async (report, evidence, _review, options) => {
    fallbackRoles.push(options.revisionRole);
    if (options.revisionRole === "editor")
      throw new Error("Unexpected end of json string at position 0");
    return stabilizeRevisedReport(
      report,
      { hero_headline: "DeepSeek Worker 接管返修" },
      evidence,
    );
  },
});
assert.deepEqual(fallbackRoles, ["editor", "worker"]);
assert.equal(workerFallback.review.status, "passed");
assert.equal(workerFallback.review.attempt, 2);

reviewCalls = 0;
revisionCalls = 0;
const loopExhausted = await runReviewLoop(baseline, articles, 80, {
  maxAttempts: 4,
  revisionRetries: 1,
  review: async (_report, _articles, threshold, attempt) => {
    reviewCalls += 1;
    return normalizeQualityReview(
      {
        score: 60 + attempt * 4,
        passed: false,
        blocking_issues: ["仍有未解决问题"],
        suggestions: ["继续修订"],
        summary: "尚未达标",
      },
      threshold,
      attempt,
      "deepseek-deepseek-v4-pro",
    );
  },
  revise: async (report, evidence, _review, options) => {
    revisionCalls += 1;
    return stabilizeRevisedReport(
      report,
      { hero_headline: `有限循环第 ${options.nextAttempt} 轮` },
      evidence,
    );
  },
});
assert.equal(loopExhausted.review.status, "failed");
assert.equal(loopExhausted.review.exhausted, true);
assert.equal(loopExhausted.review.history?.length, 4);
assert.equal(reviewCalls, 4);
assert.equal(revisionCalls, 3);
}

checkReviewLoop()
  .then(() => {
    console.log(
      "✓ reviewer loop: bounded multi-round revision, evidence stabilization, audit history, and exhaustion gate OK",
    );
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
