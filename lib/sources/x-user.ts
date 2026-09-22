import { fetchJson } from "./fetch-utils";
import type { RawArticle, SourceDef } from "./types";

type XUser = { data?: { id: string } };
type XTimeline = { data?: Array<{ id: string; text: string; created_at?: string }> };

export async function fetchXUser(source: SourceDef): Promise<RawArticle[]> {
  const bearer = process.env.X_BEARER_TOKEN?.trim();
  if (!bearer || !source.xHandle) return [];
  const headers = { Authorization: `Bearer ${bearer}` };
  const user = await fetchJson<XUser>(
    `https://api.x.com/2/users/by/username/${encodeURIComponent(source.xHandle)}`,
    { headers, timeoutMs: 12000 },
  );
  if (!user.data?.id) return [];
  const limit = Math.max(5, Math.min(100, source.dailyLimit ?? source.limit ?? 10));
  const timeline = await fetchJson<XTimeline>(
    `https://api.x.com/2/users/${user.data.id}/tweets?exclude=replies,retweets&max_results=${limit}&tweet.fields=created_at`,
    { headers, timeoutMs: 15000 },
  );
  return (timeline.data ?? []).slice(0, source.dailyLimit ?? 1).map((post) => ({
    sourceId: source.id,
    title: post.text.replace(/\s+/g, " ").slice(0, 120),
    url: `https://x.com/${source.xHandle}/status/${post.id}`,
    excerpt: post.text.replace(/\s+/g, " ").slice(0, 300),
    publishedAt: post.created_at ? new Date(post.created_at) : undefined,
    category: source.category,
  }));
}
