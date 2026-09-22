import * as cheerio from "cheerio";
import { curlFetch } from "./curl-fetch";
import { BROWSER_HEADERS, fetchText } from "./fetch-utils";
import { matchesSourceKeywords, stripHtml } from "./keywords";
import type { RawArticle, SourceDef } from "./types";

function matchesPath(source: SourceDef, url: URL): boolean {
  if (source.includePaths?.length && !source.includePaths.some((p) => url.pathname.includes(p))) {
    return false;
  }
  return !(source.excludePaths ?? []).some((p) => url.pathname.includes(p));
}

export async function fetchWebList(source: SourceDef): Promise<RawArticle[]> {
  let text: string;
  let finalUrl = source.url;
  if (source.useCurl) {
    text = await curlFetch(source.url, BROWSER_HEADERS, 25);
  } else {
    const response = await fetchText(source.url, { timeoutMs: 20000 });
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`${source.url} -> HTTP ${response.status}`);
    }
    text = response.text;
    finalUrl = response.url;
  }
  const $ = cheerio.load(text);
  const base = new URL(finalUrl);
  const itemSelector = source.itemSelector ?? "article, main li, main a[href]";
  const linkSelector = source.linkSelector ?? "a[href]";
  const seen = new Set<string>();
  const items: RawArticle[] = [];

  const collect = (selector: string) => $(selector).each((_, element) => {
    if (items.length >= (source.dailyLimit ?? source.limit ?? 20)) return;
    const root = $(element);
    const link = root.is("a[href]") ? root : root.find(linkSelector).first();
    const href = link.attr("href")?.trim();
    if (!href || href.startsWith("#") || href.startsWith("javascript:")) return;
    let target: URL;
    try {
      target = new URL(href, base);
    } catch {
      return;
    }
    if (target.hostname !== base.hostname || !matchesPath(source, target)) return;
    target.hash = "";
    const normalized = target.toString();
    if (seen.has(normalized)) return;
    const title = (
      source.titleSelector ? root.find(source.titleSelector).first().text() : link.text()
    ).replace(/\s+/g, " ").trim();
    if (title.length < 8) return;
    const excerpt = stripHtml(
      source.excerptSelector ? root.find(source.excerptSelector).first().text() : root.text(),
    ).slice(0, 300);
    const dateValue = source.dateSelector
      ? root.find(source.dateSelector).first().attr("datetime") ?? root.find(source.dateSelector).first().text()
      : root.find("time").first().attr("datetime") ?? root.find("time").first().text();
    const publishedAt = dateValue && !Number.isNaN(new Date(dateValue).getTime())
      ? new Date(dateValue)
      : undefined;
    const article: RawArticle = {
      sourceId: source.id,
      title,
      url: normalized,
      excerpt,
      publishedAt,
      category: source.category,
    };
    if (!matchesSourceKeywords(source, article)) return;
    seen.add(normalized);
    items.push(article);
  });
  collect(itemSelector);
  if (items.length === 0 && itemSelector === "article, main li, main a[href]") {
    collect("body a[href]");
  }
  return items;
}
