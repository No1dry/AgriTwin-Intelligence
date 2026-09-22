import assert from "node:assert/strict";
import {
  createHistoryIndex,
  filterFreshArticles,
  stripTransientContent,
} from "../lib/sources/freshness";
import { fetchGithubEntity } from "../lib/sources/github-entity";
import { enrichBilibiliItem } from "../lib/sources/platform-rss";
import type { ArticleInput } from "../lib/ai/pipeline";
import type { SourceDef } from "../lib/sources/types";

const sources: SourceDef[] = [
  {
    id: "github-trending",
    name: "Trending",
    type: "scrape",
    url: "https://github.com/trending",
    category: "tech",
    enabled: true,
  },
  {
    id: "person-github",
    name: "Person GitHub",
    type: "github-entity",
    url: "https://github.com/alice",
    category: "tech",
    enabled: true,
    entityType: "person",
  },
  {
    id: "person-video",
    name: "Person Bilibili",
    type: "bilibili-user",
    url: "https://space.bilibili.com/1",
    category: "tech",
    enabled: true,
    entityType: "person",
  },
  {
    id: "company-blog",
    name: "Company",
    type: "rss",
    url: "https://example.com/feed",
    category: "tech",
    enabled: true,
    entityType: "company",
  },
];
const article = (
  values: Partial<ArticleInput> &
    Pick<ArticleInput, "sourceId" | "title" | "url">,
): ArticleInput => ({ source: values.sourceId, category: "tech", ...values });
const history = createHistoryIndex([
  {
    date: "2026-09-18",
    sourceId: "github-trending",
    title: "acme/steady",
    url: "https://github.com/acme/steady",
    meta: "★ 1,000 · 📈 100 stars today",
  },
  {
    date: "2026-09-18",
    sourceId: "github-trending",
    title: "acme/surging",
    url: "https://github.com/acme/surging",
    meta: "★ 1,000 · 📈 100 stars today",
  },
  {
    date: "2026-09-18",
    sourceId: "person-github",
    title: "alice/tool",
    url: "https://github.com/alice/tool",
    excerpt: "Stars: 100",
  },
  {
    date: "2026-09-18",
    sourceId: "company-blog",
    title: "Product update",
    url: "https://example.com/update",
  },
]);
const result = filterFreshArticles(
  [
    article({
      sourceId: "github-trending",
      title: "acme/new-low",
      url: "https://github.com/acme/new-low",
      meta: "★ 50 · 📈 200 stars today",
      metrics: { starsTotal: 50, starsToday: 200 },
    }),
    article({
      sourceId: "github-trending",
      title: "acme/new-high",
      url: "https://github.com/acme/new-high",
      meta: "★ 80 · 📈 500 stars today",
      metrics: { starsTotal: 80, starsToday: 500 },
    }),
    article({
      sourceId: "github-trending",
      title: "acme/steady",
      url: "https://github.com/acme/steady",
      meta: "★ 1,020 · 📈 120 stars today",
      metrics: { starsTotal: 1020, starsToday: 120 },
    }),
    article({
      sourceId: "github-trending",
      title: "acme/surging",
      url: "https://github.com/acme/surging",
      meta: "★ 1,070 · 📈 160 stars today",
      metrics: { starsTotal: 1070, starsToday: 160 },
    }),
    article({
      sourceId: "person-github",
      title: "alice/tool",
      url: "https://github.com/alice/tool",
      excerpt: "Stars: 119",
      metrics: { starsTotal: 119 },
      publishedAt: new Date("2026-09-19T06:00:00Z"),
    }),
    article({
      sourceId: "person-github",
      title: "alice/tool",
      url: "https://github.com/alice/tool",
      excerpt: "Stars: 130",
      metrics: { starsTotal: 130 },
      publishedAt: new Date("2026-08-30T07:00:00Z"),
    }),
    article({
      sourceId: "company-blog",
      title: "Product update",
      url: "https://example.com/changed-url",
      publishedAt: new Date("2026-09-19T07:00:00Z"),
    }),
    article({
      sourceId: "company-blog",
      title: "New release",
      url: "https://example.com/new",
      publishedAt: new Date("2026-09-19T07:00:00Z"),
    }),
    article({
      sourceId: "person-video",
      title: "Old video",
      url: "https://www.bilibili.com/video/BV1234567890",
      publishedAt: new Date("2026-09-01T00:00:00Z"),
      contentText: "真实字幕内容足够长，描述视频的实际内容和方法。",
    }),
    article({
      sourceId: "person-video",
      title: "Empty video",
      url: "https://www.bilibili.com/video/BV1234567891",
      publishedAt: new Date("2026-09-19T05:00:00Z"),
      contentText: "",
    }),
    article({
      sourceId: "person-video",
      title: "New video",
      url: "https://www.bilibili.com/video/BV1234567892",
      publishedAt: new Date("2026-09-19T05:00:00Z"),
      contentText:
        "这是来自字幕的完整内容，足以让模型概括视频讨论的方法和结论。",
    }),
  ],
  sources,
  "2026-09-19",
  history,
);
assert.deepEqual(
  result.articles
    .filter((item) => item.sourceId === "github-trending")
    .map((item) => item.title),
  ["acme/new-high", "acme/new-low", "acme/surging"],
);
assert.equal(
  result.articles.filter((item) => item.url === "https://github.com/alice/tool")
    .length,
  1,
);
assert.equal(
  result.articles.find((item) => item.url === "https://github.com/alice/tool")
    ?.metrics?.starsTotal,
  130,
);
assert.ok(!result.articles.some((item) => item.title === "Product update"));
assert.ok(result.articles.some((item) => item.title === "New release"));
assert.deepEqual(
  result.articles
    .filter((item) => item.sourceId === "person-video")
    .map((item) => item.title),
  ["New video"],
);
assert.equal(result.stats.githubWithoutGrowth, 2);
assert.ok(
  !(
    "contentText" in
    stripTransientContent([
      article({
        sourceId: "person-video",
        title: "Video",
        url: "https://example.com/video",
        contentText: "temporary transcript",
      }),
    ])[0]
  ),
);

async function checkNetworkAdapters(): Promise<void> {
  const originalFetch = globalThis.fetch;
  try {
    const json = (data: unknown) =>
      Promise.resolve(new Response(JSON.stringify(data), { status: 200 }));
    globalThis.fetch = ((input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/x/web-interface/view?"))
        return json({
          code: 0,
          data: {
            bvid: "BV1234567890",
            aid: 1,
            cid: 2,
            title: "New video",
            desc: "投稿介绍说明实验背景和结论。",
            dynamic: "",
            pubdate: Date.parse("2026-09-19T05:00:00Z") / 1000,
            duration: 600,
            owner: { name: "UP主" },
            stat: { view: 1000, like: 50 },
          },
        });
      if (url.includes("/x/player/v2?"))
        return json({
          code: 0,
          data: {
            subtitle: {
              subtitles: [{ subtitle_url: "//example.com/subtitle.json" }],
            },
          },
        });
      if (url.includes("subtitle.json"))
        return json({
          body: [
            { content: "第一段字幕介绍问题。" },
            { content: "第二段字幕说明方法与实验结果。" },
          ],
        });
      if (url.includes("/users/alice/events"))
        return json([
          {
            type: "CreateEvent",
            created_at: "2026-09-19T05:00:00Z",
            repo: { name: "alice/new-tool" },
            payload: { ref_type: "repository" },
          },
        ]);
      if (url.includes("/users/alice/repos"))
        return json([
          {
            full_name: "alice/new-tool",
            html_url: "https://github.com/alice/new-tool",
            description: "New tool",
            created_at: "2026-09-19T05:00:00Z",
            pushed_at: "2026-09-19T06:00:00Z",
            stargazers_count: 42,
            fork: false,
            archived: false,
          },
          {
            full_name: "alice/old-tool",
            html_url: "https://github.com/alice/old-tool",
            description: "Old",
            created_at: "2025-01-01T00:00:00Z",
            pushed_at: "2026-09-19T06:00:00Z",
            stargazers_count: 5000,
            fork: false,
            archived: false,
          },
        ]);
      throw new Error(`Unexpected mock URL: ${url}`);
    }) as typeof fetch;
    const video = await enrichBilibiliItem(
      article({
        sourceId: "person-video",
        title: "RSS title",
        url: "https://www.bilibili.com/video/BV1234567890",
      }),
    );
    assert.ok(video?.contentText?.includes("第二段字幕说明方法与实验结果"));
    assert.ok(video?.meta?.includes("字幕已读取"));
    const github = await fetchGithubEntity({
      id: "person-github",
      name: "Alice",
      type: "github-entity",
      url: "https://github.com/alice",
      category: "tech",
      githubHandle: "alice",
      dailyLimit: 5,
    });
    assert.deepEqual(
      github.map((item) => item.title),
      ["alice/new-tool"],
    );
    assert.equal(github[0].metrics?.starsTotal, 42);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

checkNetworkAdapters().then(() =>
  console.log(
    "✓ freshness: 14-day URL/title dedupe, star-growth exceptions, Trending growth ranking, recent GitHub events, and Bilibili transcript grounding OK",
  ),
);
