import { fetchJson } from "./fetch-utils";
import { matchesSourceKeywords } from "./keywords";
import type { RawArticle, SourceDef } from "./types";

interface YcCompany {
  id?: number;
  name?: string;
  oneLiner?: string;
  longDescription?: string;
  url?: string;
  website?: string;
  batch?: string;
  status?: string;
  tags?: string[];
  industries?: string[];
  locations?: string[];
}

interface YcResponse {
  companies?: YcCompany[];
  nextPage?: number | null;
  totalPages?: number;
}

function tagsFor(source: SourceDef, base: URL): string[] {
  if (source.tags?.length) return source.tags;
  const tag = base.searchParams.get("tags");
  return tag ? [tag] : [""];
}

function articleFor(source: SourceDef, c: YcCompany): RawArticle | undefined {
  const name = c.name?.trim();
  const url = c.url?.trim();
  if (!name || !url) return undefined;

  const title = c.oneLiner?.trim() ? `${name}: ${c.oneLiner.trim()}` : name;
  const meta = [
    c.batch,
    c.status,
    c.locations?.[0],
    c.tags?.slice(0, 5).join(", "),
  ]
    .filter(Boolean)
    .join(" · ");
  const excerpt = [
    c.longDescription,
    c.industries?.join(", "),
    c.website ? `Website: ${c.website}` : undefined,
  ]
    .filter(Boolean)
    .join(" ");
  return {
    sourceId: source.id,
    title,
    url,
    excerpt: excerpt.slice(0, 300),
    category: source.category,
    meta: meta || undefined,
  };
}

export async function fetchYCombinator(source: SourceDef): Promise<RawArticle[]> {
  const base = new URL(source.url);
  const seen = new Set<string>();
  const articles: RawArticle[] = [];
  const maxPages = source.maxPages ?? 1;

  for (const tag of tagsFor(source, base)) {
    for (let page = 1; page <= maxPages; page++) {
      const url = new URL(source.url);
      if (tag) url.searchParams.set("tags", tag);
      if (page > 1 || maxPages > 1) url.searchParams.set("page", String(page));

      const data = await fetchJson<YcResponse>(url.toString(), { timeoutMs: 15000 });
      for (const company of data.companies ?? []) {
        const article = articleFor(source, company);
        if (!article || seen.has(article.url)) continue;
        if (!matchesSourceKeywords(source, article)) continue;
        seen.add(article.url);
        articles.push(article);
      }
      if (!data.nextPage || data.nextPage <= page) break;
    }
  }

  return articles.slice(0, source.limit ?? 20);
}
