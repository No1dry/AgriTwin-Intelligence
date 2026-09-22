import assert from "node:assert/strict";
import {
  buildDeterministicFallback,
  validateDailyReport,
  type ArticleInput,
  type DailyReport,
} from "../lib/ai/pipeline";

const incomplete: DailyReport = {
  hero_headline: "测试头条",
  daily_overview: "测试总览",
  tech_briefs: [
    { title: "一条科技", url: "https://example.com/tech", source: "test", summary: "简介", importance: 5 },
  ],
  finance_briefs: [],
  politics_briefs: [],
  editor_note: "",
  keywords: [],
};
assert.ok(validateDailyReport(incomplete).length >= 4);

const categories: ArticleInput["category"][] = ["tech", "finance", "politics"];
const counts = { tech: 5, finance: 5, politics: 3 } as const;
const articles = categories.flatMap((category) =>
  Array.from({ length: counts[category] }, (_, index): ArticleInput => ({
    sourceId: `${category}-${index}`,
    source: `${category} source ${index}`,
    title: `${category} title ${index}`,
    url: `https://example.com/${category}/${index}`,
    excerpt: `${category} factual summary ${index}`,
    summary: `${category} 中文事实摘要 ${index}`,
    publishedAt: new Date(),
    category,
  })),
);
const fallback = buildDeterministicFallback(articles);
assert.deepEqual(validateDailyReport(fallback), []);
assert.equal(fallback.tech_briefs.length, 5);
assert.equal(fallback.finance_briefs.length, 5);
assert.equal(fallback.politics_briefs.length, 3);

console.log("✓ digest validation rejects incomplete cards and accepts the 5+5+3 fallback");
