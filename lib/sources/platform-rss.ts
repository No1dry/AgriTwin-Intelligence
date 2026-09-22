import { fetchRss } from "./rss";
import { fetchText } from "./fetch-utils";
import type { RawArticle, SourceDef } from "./types";

type BilibiliView = {
  code: number;
  data?: {
    bvid: string;
    aid: number;
    cid: number;
    title: string;
    desc?: string;
    dynamic?: string;
    pubdate: number;
    duration: number;
    owner?: { name?: string };
    stat?: { view?: number; like?: number };
  };
};
type BilibiliPlayer = {
  code: number;
  data?: { subtitle?: { subtitles?: Array<{ subtitle_url?: string }> } };
};
type BilibiliSubtitle = { body?: Array<{ content?: string }> };

function bilibiliHeaders(): Record<string, string> {
  const cookie =
    process.env.BILIBILI_COOKIE_0?.trim() ||
    process.env.BILIBILI_COOKIE?.trim();
  return {
    Referer: "https://www.bilibili.com/",
    Origin: "https://www.bilibili.com",
    ...(cookie ? { Cookie: cookie } : {}),
  };
}
async function fetchBilibiliJson<T>(url: string): Promise<T> {
  const { status, text } = await fetchText(url, {
    headers: bilibiliHeaders(),
    timeoutMs: 20000,
  });
  if (status < 200 || status >= 300)
    throw new Error(`${url} -> HTTP ${status}`);
  return JSON.parse(text) as T;
}
export async function enrichBilibiliItem(
  article: RawArticle,
): Promise<RawArticle | null> {
  const bvid = article.url.match(/\b(BV[0-9A-Za-z]{10})\b/)?.[1];
  if (!bvid) return null;
  try {
    const view = await fetchBilibiliJson<BilibiliView>(
      `https://api.bilibili.com/x/web-interface/view?bvid=${encodeURIComponent(bvid)}`,
    );
    if (view.code !== 0 || !view.data) return null;
    const data = view.data;
    let transcript = "";
    try {
      const player = await fetchBilibiliJson<BilibiliPlayer>(
        `https://api.bilibili.com/x/player/v2?bvid=${encodeURIComponent(bvid)}&cid=${data.cid}`,
      );
      const track = player.data?.subtitle?.subtitles?.find(
        (item) => item.subtitle_url,
      )?.subtitle_url;
      if (track) {
        const url = track.startsWith("//") ? `https:${track}` : track;
        const subtitle = await fetchBilibiliJson<BilibiliSubtitle>(url);
        transcript = (subtitle.body ?? [])
          .map((item) => item.content?.trim())
          .filter(Boolean)
          .join(" ")
          .replace(/\s+/g, " ")
          .slice(0, 12_000);
      }
    } catch {
      // Subtitle tracks are optional. Rich creator descriptions remain usable.
    }
    const description = [data.desc, data.dynamic]
      .map((value) => value?.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .filter((value, index, all) => all.indexOf(value) === index)
      .join(" ");
    const grounded = transcript || description;
    if (grounded.length < 24) return null;
    return {
      ...article,
      title: data.title || article.title,
      excerpt: description.slice(0, 1200),
      contentText: grounded,
      publishedAt: new Date(data.pubdate * 1000),
      meta: `${data.owner?.name ?? "B站"} · ${Math.max(1, Math.round(data.duration / 60))} 分钟${transcript ? " · 字幕已读取" : " · 投稿简介"}${data.stat?.view != null ? ` · ${data.stat.view.toLocaleString("zh-CN")} 播放` : ""}`,
      metrics: { views: data.stat?.view, likes: data.stat?.like },
    };
  } catch (error) {
    console.warn(
      `[bilibili] ${bvid} metadata/transcript unavailable: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

export async function fetchRssHub(source: SourceDef): Promise<RawArticle[]> {
  if (!source.rsshubPath) return [];
  const base = (
    process.env.RSSHUB_BASE_URL?.trim() || "https://rsshub.app"
  ).replace(/\/+$/, "");
  const feedUrl = new URL(`${base}/${source.rsshubPath.replace(/^\/+/, "")}`);
  const accessKey = process.env.RSSHUB_ACCESS_KEY?.trim();
  if (accessKey) feedUrl.searchParams.set("key", accessKey);
  const items = await fetchRss(source.id, feedUrl.toString(), source.category, {
    limit: source.dailyLimit ?? source.limit,
    keywords: source.keywords,
    keywordFields: source.keywordFields,
    // rss-parser's request timeout can leave the socket open when an
    // RSSHub route is still running Playwright. curl's hard timeout closes
    // the connection so one stalled platform route cannot hold the process.
    useCurl: true,
  });
  if (source.type !== "bilibili-user") return items;
  const enriched = await Promise.all(items.map(enrichBilibiliItem));
  return enriched.filter((item): item is RawArticle => item !== null);
}

export async function fetchYoutubeChannel(
  source: SourceDef,
): Promise<RawArticle[]> {
  if (!source.youtubeChannelId) return [];
  try {
    return await fetchRss(
      source.id,
      `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(source.youtubeChannelId)}`,
      source.category,
      { limit: source.dailyLimit ?? source.limit, keywords: source.keywords },
    );
  } catch {
    const { status, text } = await fetchText(source.url, { timeoutMs: 20000 });
    if (status < 200 || status >= 300) return [];
    const items: RawArticle[] = [];
    const seen = new Set<string>();
    const pattern =
      /"videoId":"([^"]+)"[\s\S]{0,1200}?"title":\{"runs":\[\{"text":"([^"]+)"/g;
    for (const match of text.matchAll(pattern)) {
      if (items.length >= (source.dailyLimit ?? source.limit ?? 5)) break;
      const [, videoId, rawTitle] = match;
      if (seen.has(videoId)) continue;
      let title = rawTitle;
      try {
        title = JSON.parse(`"${rawTitle.replace(/"/g, '\\"')}"`) as string;
      } catch {
        // Keep the raw JSON text if decoding fails.
      }
      seen.add(videoId);
      items.push({
        sourceId: source.id,
        title,
        url: `https://www.youtube.com/watch?v=${videoId}`,
        category: source.category,
      });
    }
    return items;
  }
}
