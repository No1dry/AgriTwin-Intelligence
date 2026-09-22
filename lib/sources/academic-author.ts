import { fetchJson } from "./fetch-utils";
import type { RawArticle, SourceDef } from "./types";

type OpenAlexAuthor = { id: string; display_name: string };
type OpenAlexSearch = { results?: OpenAlexAuthor[] };
type OpenAlexWork = {
  display_name: string;
  doi?: string;
  publication_date?: string;
  primary_location?: { landing_page_url?: string };
  ids?: { openalex?: string };
  authorships?: Array<{ author?: { display_name?: string } }>;
};
type OpenAlexWorks = { results?: OpenAlexWork[] };

export async function fetchAcademicAuthor(source: SourceDef): Promise<RawArticle[]> {
  let authorId = source.openAlexId;
  if (!authorId && source.academicAuthor) {
    const search = await fetchJson<OpenAlexSearch>(
      `https://api.openalex.org/authors?search=${encodeURIComponent(source.academicAuthor)}&per-page=10`,
      { timeoutMs: 15000 },
    );
    const exact = (search.results ?? []).find(
      (author) => author.display_name.toLowerCase() === source.academicAuthor?.toLowerCase(),
    );
    authorId = (exact ?? search.results?.[0])?.id;
  }
  if (!authorId) return [];
  const id = authorId.split("/").pop();
  const limit = source.dailyLimit ?? source.limit ?? 5;
  const works = await fetchJson<OpenAlexWorks>(
    `https://api.openalex.org/works?filter=author.id:${encodeURIComponent(id ?? authorId)}&sort=publication_date:desc&per-page=${limit}`,
    { timeoutMs: 15000 },
  );
  return (works.results ?? []).map((work) => ({
    sourceId: source.id,
    title: work.display_name,
    url: work.doi || work.primary_location?.landing_page_url || work.ids?.openalex || "",
    excerpt: (work.authorships ?? []).map((a) => a.author?.display_name).filter(Boolean).join(", ").slice(0, 300),
    publishedAt: work.publication_date ? new Date(work.publication_date) : undefined,
    category: source.category,
  })).filter((work) => work.title && work.url);
}
