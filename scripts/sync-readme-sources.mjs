#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const checkOnly = args.includes("--check");
const paths = args.filter((value) => value !== "--check");
const repoRoot = path.resolve(paths[0] || path.join(here, ".."));
const readmePath = path.resolve(paths[1] || path.join(repoRoot, "README.md"));
const begin = "<!-- SOURCE_LIST:START -->";
const end = "<!-- SOURCE_LIST:END -->";

const readJson = (name) =>
  JSON.parse(fs.readFileSync(path.join(repoRoot, name), "utf8"));
const sources = [
  ...readJson("sources.config.json"),
  ...readJson("sources.candidates.json"),
];
const categoryOrder = { tech: 0, finance: 1, politics: 2 };
const tierOrder = { T0: 0, T1: 1, T2: 2, T3: 3 };
const categories = { tech: "科技 / AI", finance: "财经", politics: "国际时政" };
const subcategories = {
  "github-trending": "GitHub Trending",
  "trending-papers": "热门论文",
  "ai-news": "AI 新闻",
  "ai-applications": "AI 应用",
  "cn-community": "中文社区",
  "overseas-community": "海外社区",
  "x-viral": "X 热点",
  "blog-weekly": "博客周刊",
  "tech-people": "技术人物",
  "research-orgs": "研究机构与公司",
  "research-papers": "论文与作者",
  "overseas-analysis": "海外分析媒体",
  "engineering-blogs": "工程与开源",
  "cn-tech-media": "国内技术媒体",
  "policy-standards": "政策与标准",
  community: "社区",
  overseas: "海外来源",
  "overseas-news": "海外新闻",
  news: "财经新闻",
  world: "国际新闻",
};
const types = {
  rss: "RSS",
  api: "API",
  scrape: "网页抓取",
  "web-list": "网页列表",
  "github-entity": "GitHub API",
  "x-user": "X API",
  rsshub: "RSSHub",
  "bilibili-user": "B站 / RSSHub",
  "youtube-channel": "YouTube Atom",
  "academic-author": "OpenAlex",
  "policy-list": "政策网页",
};
const escapeCell = (value) =>
  String(value ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, " ");
const status = (source) =>
  source.enabled === false ? "停用" : source.shadowMode ? "影子" : "启用";
const rows = [...sources].sort(
  (a, b) =>
    (categoryOrder[a.category] ?? 99) - (categoryOrder[b.category] ?? 99) ||
    (a.subcategory ?? "").localeCompare(b.subcategory ?? "") ||
    (tierOrder[a.tier] ?? 9) - (tierOrder[b.tier] ?? 9) ||
    a.name.localeCompare(b.name, "zh-CN"),
);
const lines = [
  begin,
  "",
  `当前登记 **${sources.length}** 个信源，其中 **${sources.filter((source) => source.enabled !== false).length}** 个全局启用；中文模式启用 **${sources.filter((source) => source.enabled !== false && (source.locales ?? ["zh", "en"]).includes("zh")).length}** 个。此表由 \`npm run readme:sources\` 从两份信源配置自动生成。`,
  "",
];
let currentCategory;
for (const source of rows) {
  if (source.category !== currentCategory) {
    if (currentCategory) lines.push("");
    currentCategory = source.category;
    lines.push(
      `### ${categories[currentCategory] ?? currentCategory}`,
      "",
      "| 分类 | 信源 | ID | 接入方式 | 状态 | 优先级 |",
      "|---|---|---|---|---|---|",
    );
  }
  const name = source.url
    ? `[${escapeCell(source.name)}](${source.url})`
    : escapeCell(source.name);
  lines.push(
    `| ${escapeCell(subcategories[source.subcategory] ?? source.subcategory ?? "未分类")} | ${name} | \`${escapeCell(source.id)}\` | ${escapeCell(types[source.type] ?? source.type)} | ${status(source)} | ${escapeCell(source.tier ?? "—")} |`,
  );
}
lines.push("", end);

const readme = fs.readFileSync(readmePath, "utf8");
const pattern = new RegExp(`${begin}[\\s\\S]*?${end}`);
if (!pattern.test(readme))
  throw new Error(`README markers missing: ${begin} / ${end}`);
const updated = readme.replace(pattern, lines.join("\n"));
if (checkOnly) {
  if (updated !== readme)
    throw new Error(
      "README source list is out of date; run npm run readme:sources",
    );
  console.log(`README source list is current: ${sources.length} sources`);
} else {
  fs.writeFileSync(readmePath, updated, "utf8");
  console.log(
    `README source list updated: ${sources.length} sources -> ${readmePath}`,
  );
}
