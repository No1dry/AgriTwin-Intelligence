import type { SourceDef } from "./types";

export function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function keywordMatches(haystack: string, keyword: string): boolean {
  // CJK keywords are naturally wordless, so substring matching is expected.
  if (/[\u3400-\u9fff]/.test(keyword)) return haystack.includes(keyword);

  // Latin keywords need loose word boundaries: "ai" should match "AI tools"
  // but not "Airbnb"; "agent" should not match "management".
  const pattern = keyword.split(/\s+/).map(escapeRegExp).join("\\s+");
  return new RegExp(`(^|[^a-z0-9])${pattern}([^a-z0-9]|$)`, "i").test(
    haystack,
  );
}

export function matchesSourceKeywords(
  source: Pick<SourceDef, "keywords" | "keywordFields">,
  article: { title: string; excerpt?: string },
): boolean {
  const keywords = (source.keywords ?? [])
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean);
  if (keywords.length === 0) return true;

  const haystack =
    source.keywordFields === "title"
      ? article.title.toLowerCase()
      : `${article.title}\n${article.excerpt ?? ""}`.toLowerCase();
  return keywords.some((keyword) => keywordMatches(haystack, keyword));
}
