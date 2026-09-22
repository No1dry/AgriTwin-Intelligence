import "./_env";

import { sources } from "../lib/sources/registry";
import { fetchSource } from "../lib/sources/dispatch";
import type { ArticleInput } from "../lib/ai/pipeline";

// Source-fetch sanity check only — does NOT call the LLM. For the full
// ingest → digest → write-to-disk pipeline use `npm run daily` instead.
async function main() {
  console.log("Fetching from sources…\n");
  const articles: ArticleInput[] = [];
  const shadowArticles: ArticleInput[] = [];

  const enabled = sources.filter((s) => s.enabled !== false);
  const configuredConcurrency = Number.parseInt(process.env.SOURCE_FETCH_CONCURRENCY ?? "6", 10);
  const concurrency = Number.isFinite(configuredConcurrency) && configuredConcurrency > 0
    ? Math.min(configuredConcurrency, 12)
    : 6;
  const fetched = new Array<Awaited<ReturnType<typeof fetchSource>> | null>(enabled.length).fill(null);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, enabled.length) }, async () => {
      while (cursor < enabled.length) {
        const index = cursor++;
        const source = enabled[index];
        try {
          const items = await fetchSource(source);
          fetched[index] = items;
          console.log(`  ${source.id.padEnd(20)} ${items.length}${source.shadowMode ? " [shadow]" : ""}`);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error(`  ${source.id.padEnd(20)} FAILED — ${msg}`);
        }
      }
    }),
  );
  for (let index = 0; index < enabled.length; index++) {
    const source = enabled[index];
    const target = source.shadowMode ? shadowArticles : articles;
    target.push(...(fetched[index] ?? []).map((item) => ({ ...item, source: source.name })));
  }

  console.log(`\nTotal articles: ${articles.length}`);
  console.log(`Shadow articles: ${shadowArticles.length}`);
  console.log("\nTop 10 articles:");
  articles.slice(0, 10).forEach((a, i) => {
    console.log(`  ${i + 1}. [${a.category}] ${a.title}`);
  });
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
