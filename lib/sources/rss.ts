import Parser from "rss-parser";
import { curlFetch } from "./curl-fetch";
import { matchesSourceKeywords, stripHtml } from "./keywords";
import type { Category, RawArticle } from "./types";

const parser = new Parser({
  timeout: 15000,
  headers: {
    "User-Agent":
      "Mozilla/5.0 (compatible; DailyBriefBot/1.0; +https://github.com/)",
  },
});

const CURL_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/atom+xml, application/rss+xml, application/xml, text/xml, */*",
  "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
};

let googleNewsQueue: Promise<void> = Promise.resolve();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runGoogleNewsRequest<T>(request: () => Promise<T>): Promise<T> {
  const previous = googleNewsQueue;
  let release!: () => void;
  googleNewsQueue = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    const delays = [0, 1500, 4000];
    let lastError: unknown;
    for (const delay of delays) {
      if (delay) await sleep(delay);
      try {
        return await request();
      } catch (error) {
        lastError = error;
        const message = error instanceof Error ? error.message : String(error);
        if (!/(?:status code|http)\s*(?:429|5\d\d)/i.test(message)) throw error;
      }
    }
    throw lastError;
  } finally {
    await sleep(750);
    release();
  }
}

function repairBareXmlEntities(xml: string): string {
  return xml.replace(
    /&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-f]+;)/gi,
    "&amp;",
  );
}

export async function fetchRss(
  sourceId: string,
  url: string,
  category: Category,
  options: {
    limit?: number;
    useCurl?: boolean;
    keywords?: string[];
    keywordFields?: "title" | "title-excerpt";
  } = {},
): Promise<RawArticle[]> {
  const limit = options.limit ?? 30;

  const requestFeed = async () => {
    if (options.useCurl) {
      const xml = await curlFetch(url, CURL_HEADERS);
      return parser.parseString(repairBareXmlEntities(xml));
    }
    return parser.parseURL(url);
  };
  const feed = new URL(url).hostname === "news.google.com"
    ? await runGoogleNewsRequest(requestFeed)
    : await requestFeed();

  return (feed.items ?? [])
    .map((item) => ({
      sourceId,
      title: (item.title ?? "").trim(),
      url: (item.link ?? "").trim(),
      excerpt: stripHtml(item.contentSnippet ?? item.content ?? "").slice(
        0,
        300,
      ),
      publishedAt: item.isoDate ? new Date(item.isoDate) : undefined,
      category,
    }))
    .filter((a) => a.title && a.url)
    .filter((a) => matchesSourceKeywords(options, a))
    .slice(0, limit);
}
