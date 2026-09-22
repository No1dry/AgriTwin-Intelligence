import { fetchAttentionVc } from "./attentionvc";
import { fetchCrunchbase } from "./crunchbase";
import { fetchGithubTrending } from "./github-trending";
import { fetchHackerNews } from "./hackernews";
import { fetchHuggingfacePapers } from "./huggingface-papers";
import { fetchLinuxDo } from "./linuxdo";
import { fetchRss } from "./rss";
import { fetchV2ex } from "./v2ex";
import {
  fetchA16z,
  fetchCbInsights,
  fetchJiqizhixin,
  fetchSequoia,
} from "./venture-pages";
import { fetchYCombinator } from "./ycombinator";
import { fetchAcademicAuthor } from "./academic-author";
import { fetchGithubEntity } from "./github-entity";
import { fetchRssHub, fetchYoutubeChannel } from "./platform-rss";
import { fetchWebList } from "./web-list";
import { fetchXUser } from "./x-user";
import type { RawArticle, SourceDef } from "./types";
import { getEditorialConfig } from '../editorial/runtime.mjs';

/**
 * Single dispatcher used by daily.ts, dry-run.ts, and the cron route.
 * Add a new branch here when introducing a non-RSS fetcher.
 */
export async function fetchSource(source: SourceDef): Promise<RawArticle[]> {
  const items = await fetchSourceRaw(source);
  const limit = getEditorialConfig()?.sourceOverrides[source.id]?.dailyLimit;
  return limit === undefined ? items : items.slice(0, limit);
}

async function fetchSourceRaw(source: SourceDef): Promise<RawArticle[]> {
  if (source.type === "web-list" || source.type === "policy-list") return fetchWebList(source);
  if (source.type === "github-entity") return fetchGithubEntity(source);
  if (source.type === "x-user") return fetchXUser(source);
  if (source.type === "bilibili-user" || source.type === "rsshub") return fetchRssHub(source);
  if (source.type === "youtube-channel") return fetchYoutubeChannel(source);
  if (source.type === "academic-author") return fetchAcademicAuthor(source);
  if (source.id === "hackernews") return fetchHackerNews(source.id);
  if (source.id === "github-trending") return fetchGithubTrending(source.id);
  if (source.id === "v2ex-hot") return fetchV2ex(source.id);
  if (source.id === "linuxdo") return fetchLinuxDo(source.id);
  if (source.id === "attentionvc-ai") return fetchAttentionVc(source.id);
  if (source.id === "huggingface-papers") return fetchHuggingfacePapers(source.id, source.keywords);
  if (source.id === "ycombinator-ai") return fetchYCombinator(source);
  if (source.id === "a16z-ai") return fetchA16z(source);
  if (source.id === "sequoia-ai") return fetchSequoia(source);
  if (source.id === "cbinsights-ai") return fetchCbInsights(source);
  if (source.id === "crunchbase-ai") return fetchCrunchbase(source);
  if (source.id === "jiqizhixin-ai") return fetchJiqizhixin(source);
  return fetchRss(source.id, source.url, source.category, {
    limit: source.dailyLimit ?? source.limit,
    useCurl: source.useCurl,
    keywords: source.keywords,
    keywordFields: source.keywordFields,
  });
}
