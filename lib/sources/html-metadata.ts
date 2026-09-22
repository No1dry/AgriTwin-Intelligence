import * as cheerio from "cheerio";
import { fetchText } from "./fetch-utils";

function firstJsonLdValue(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstJsonLdValue(item, key);
      if (found) return found;
    }
    return undefined;
  }

  const obj = value as Record<string, unknown>;
  const direct = obj[key];
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  for (const child of Object.values(obj)) {
    const found = firstJsonLdValue(child, key);
    if (found) return found;
  }
  return undefined;
}

function parseJsonLd($: cheerio.CheerioAPI, key: string): string | undefined {
  let found: string | undefined;
  $("script[type='application/ld+json']").each((_, el) => {
    if (found) return;
    const raw = $(el).text().trim();
    if (!raw) return;
    try {
      found = firstJsonLdValue(JSON.parse(raw), key);
    } catch {
      const match = raw.match(new RegExp(`"${key}"\\s*:\\s*"([^"]+)"`));
      if (match) found = match[1];
    }
  });
  return found;
}

function parseDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export async function fetchArticleMetadata(url: string): Promise<{
  title?: string;
  description?: string;
  publishedAt?: Date;
}> {
  try {
    const { status, text } = await fetchText(url, { timeoutMs: 12000 });
    if (status < 200 || status >= 300) return {};
    const $ = cheerio.load(text);
    const title =
      $("meta[property='og:title']").attr("content")?.trim() ||
      parseJsonLd($, "headline");
    const description =
      $("meta[property='og:description']").attr("content")?.trim() ||
      $("meta[name='description']").attr("content")?.trim() ||
      parseJsonLd($, "description");
    const date =
      $("meta[property='article:published_time']").attr("content")?.trim() ||
      $("time[datetime]").first().attr("datetime")?.trim() ||
      parseJsonLd($, "datePublished");
    return { title, description, publishedAt: parseDate(date) };
  } catch {
    return {};
  }
}
