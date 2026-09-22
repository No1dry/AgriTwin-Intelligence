import type { RawArticle, SourceDef } from "./types";

type CrunchbaseEntity = {
  uuid?: string;
  properties?: Record<string, unknown>;
};

type CrunchbaseResponse = {
  entities?: CrunchbaseEntity[];
};

function stringProp(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function identifierName(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const obj = value as Record<string, unknown>;
  return stringProp(obj.value) ?? stringProp(obj.name);
}

export async function fetchCrunchbase(source: SourceDef): Promise<RawArticle[]> {
  const apiKey = process.env.CRUNCHBASE_API_KEY?.trim();
  if (!apiKey) return [];

  try {
    const res = await fetch("https://api.crunchbase.com/api/v4/searches/organizations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-cb-user-key": apiKey,
      },
      body: JSON.stringify({
        field_ids: ["identifier", "short_description", "categories", "website_url"],
        query: [
          {
            type: "predicate",
            field_id: "categories",
            operator_id: "includes",
            values: ["Artificial Intelligence"],
          },
        ],
        limit: source.limit ?? 20,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as CrunchbaseResponse;
    return (data.entities ?? [])
      .map((entity): RawArticle | undefined => {
        const props = entity.properties ?? {};
        const name = identifierName(props.identifier);
        if (!name) return undefined;
        const slug =
          entity.uuid ??
          name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "");
        const description = stringProp(props.short_description);
        return {
          sourceId: source.id,
          title: description ? `${name}: ${description}` : name,
          url: `https://www.crunchbase.com/organization/${slug}`,
          excerpt: stringProp(props.website_url),
          category: source.category,
        };
      })
      .filter((a): a is RawArticle => Boolean(a));
  } catch {
    return [];
  }
}
