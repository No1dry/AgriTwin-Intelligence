import * as cheerio from "cheerio";
import { fetchText } from "./fetch-utils";
import { fetchArticleMetadata } from "./html-metadata";
import { matchesSourceKeywords, stripHtml } from "./keywords";
import type { RawArticle, SourceDef } from "./types";

function clean(s: string | undefined): string {
  return stripHtml(s ?? "").replace(/\s+/g, " ").trim();
}

function absoluteUrl(href: string | undefined, base: string): string | undefined {
  if (!href) return undefined;
  try {
    return new URL(href, base).toString();
  } catch {
    return undefined;
  }
}

function dateFromUploadPath(text: string): Date | undefined {
  const match = text.match(/\/(20\d{2})\/(0[1-9]|1[0-2])\//);
  if (!match) return undefined;
  return new Date(`${match[1]}-${match[2]}-01T00:00:00Z`);
}

async function hydrateMetadata(
  articles: RawArticle[],
  limit: number,
): Promise<RawArticle[]> {
  const selected = articles.slice(0, limit);
  for (const article of selected) {
    const meta = await fetchArticleMetadata(article.url);
    if (meta.publishedAt) article.publishedAt = meta.publishedAt;
    if (meta.description) {
      article.excerpt = clean(`${article.excerpt ?? ""} ${meta.description}`).slice(
        0,
        300,
      );
    }
  }
  return selected;
}

export async function fetchA16z(source: SourceDef): Promise<RawArticle[]> {
  const { status, text } = await fetchText(source.url, { timeoutMs: 15000 });
  if (status < 200 || status >= 300) return [];

  const $ = cheerio.load(text);
  const seen = new Set<string>();
  const articles: RawArticle[] = [];
  $("[data-feed-item]").each((_, el) => {
    const title = clean($(el).find("h4 a").first().text());
    const url = absoluteUrl($(el).find("h4 a").first().attr("href"), source.url);
    if (!title || !url || seen.has(url)) return;

    const category = clean($(el).find("span").first().text());
    const author = clean($(el).find(".flex span").last().text());
    const excerpt = [category, author].filter(Boolean).join(" · ");
    const item: RawArticle = {
      sourceId: source.id,
      title,
      url,
      excerpt,
      category: source.category,
      meta: excerpt || undefined,
    };
    if (!matchesSourceKeywords(source, item)) return;
    seen.add(url);
    articles.push(item);
  });

  return hydrateMetadata(articles, source.limit ?? 12);
}

export async function fetchSequoia(source: SourceDef): Promise<RawArticle[]> {
  const { status, text } = await fetchText(source.url, { timeoutMs: 15000 });
  if (status < 200 || status >= 300) return [];

  const $ = cheerio.load(text);
  const seen = new Set<string>();
  const articles: RawArticle[] = [];
  $("a.ink[href*='/article/']").each((_, el) => {
    const link = $(el);
    const title = clean(link.find(".ink__title").first().text());
    const url = absoluteUrl(link.attr("href"), source.url);
    if (!title || !url || seen.has(url)) return;

    const category = clean(link.find(".ink__category").first().text());
    const author = clean(link.find(".ink__detail").first().text());
    const excerpt = [category, author].filter(Boolean).join(" · ");
    const item: RawArticle = {
      sourceId: source.id,
      title,
      url,
      excerpt,
      publishedAt: dateFromUploadPath(link.html() ?? ""),
      category: source.category,
      meta: excerpt || undefined,
    };
    if (!matchesSourceKeywords(source, item)) return;
    seen.add(url);
    articles.push(item);
  });

  return hydrateMetadata(articles, source.limit ?? 12);
}

export async function fetchCbInsights(source: SourceDef): Promise<RawArticle[]> {
  let text: string;
  try {
    const res = await fetchText(source.url, { timeoutMs: 15000 });
    if (res.status < 200 || res.status >= 300) return [];
    text = res.text;
  } catch {
    return [];
  }

  const $ = cheerio.load(text);
  const seen = new Set<string>();
  const articles: RawArticle[] = [];
  $("a[href*='/research/']").each((_, el) => {
    const title = clean($(el).text());
    const url = absoluteUrl($(el).attr("href"), source.url);
    if (!url || seen.has(url)) return;
    if (title.length < 12 || title.length > 180) return;
    if (/newsletter|subscribe|login|demo|webinar/i.test(title)) return;

    const item: RawArticle = {
      sourceId: source.id,
      title,
      url,
      category: source.category,
    };
    if (!matchesSourceKeywords(source, item)) return;
    seen.add(url);
    articles.push(item);
  });
  return articles.slice(0, source.limit ?? 10);
}

export async function fetchJiqizhixin(source: SourceDef): Promise<RawArticle[]> {
  const { status, text } = await fetchText(source.url, { timeoutMs: 15000 });
  if (status < 200 || status >= 300) return [];

  const $ = cheerio.load(text);
  const seen = new Set<string>();
  const articles: RawArticle[] = [];
  $("a[href*='/articles/']").each((_, el) => {
    const title = clean($(el).text());
    const url = absoluteUrl($(el).attr("href"), source.url);
    if (!title || !url || seen.has(url)) return;
    const item: RawArticle = {
      sourceId: source.id,
      title,
      url,
      category: source.category,
    };
    if (!matchesSourceKeywords(source, item)) return;
    seen.add(url);
    articles.push(item);
  });
  return articles.slice(0, source.limit ?? 10);
}
