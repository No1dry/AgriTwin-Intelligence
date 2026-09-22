import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { SourceDef } from "./types";
import { applySourceOverrides } from '../editorial/runtime.mjs';

/**
 * Source registry — loaded at module-init time from sources.config.json
 * and sources.candidates.json at the project root. The former remains the
 * production registry; the latter holds shadow-mode expansion candidates.
 *
 * Locale filtering:
 *   - `REPORT_LOCALE=zh` (default) — keeps sources whose `locales` includes "zh"
 *   - `REPORT_LOCALE=en`           — keeps sources whose `locales` includes "en"
 *   Sources without an explicit `locales` field default to both ["zh", "en"].
 *
 * Adding a source:
 *   - Plain RSS / Atom: add a JSON entry with type=rss. If the host blocks
 *     Node's undici TLS fingerprint (Cloudflare "Just a moment…"), set
 *     useCurl=true so rss.ts shells out to curl.
 *   - Special source (HN / V2EX / GitHub Trending / LinuxDo): add a branch
 *     in lib/sources/dispatch.ts pointing to your fetcher.
 *
 * `enabled: false` entries stay in the config for visibility; disable
 * rather than delete so the "why we don't use this" history is preserved.
 *
 * Subcategory determines L2 grouping in the rendered HTML:
 *   tech    → github-trending / ai-news / x-viral (cn-community renders as L1)
 *   finance → news
 *   politics → no L2 split (subcategory omitted)
 */

export const REPORT_LOCALE: "zh" | "en" =
  process.env.REPORT_LOCALE === "en" ? "en" : "zh";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.resolve(__dirname, "../..", "sources.config.json");
const CANDIDATE_CONFIG_PATH = path.resolve(__dirname, "../..", "sources.candidates.json");

function loadAndValidate(): SourceDef[] {
  function readSourceFile(file: string, required: boolean): unknown[] {
    if (!fs.existsSync(file)) {
      if (required) throw new Error(`Source config missing: ${file}`);
      return [];
    }
    try {
      const value: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
      if (!Array.isArray(value)) throw new Error("top-level must be an array of sources");
      return value;
    } catch (e) {
      throw new Error(`Invalid source config ${file}: ${(e as Error).message}`);
    }
  }

  const parsed = [
    ...readSourceFile(CONFIG_PATH, true),
    ...readSourceFile(CANDIDATE_CONFIG_PATH, false),
  ];

  const validTypes = new Set([
    "rss",
    "api",
    "scrape",
    "web-list",
    "github-entity",
    "x-user",
    "rsshub",
    "bilibili-user",
    "youtube-channel",
    "academic-author",
    "policy-list",
  ]);
  const validCategories = new Set(["tech", "finance", "politics"]);
  const seenIds = new Set<string>();

  for (let i = 0; i < parsed.length; i++) {
    const s = parsed[i] as Record<string, unknown>;
    const at = `source registry[${i}]`;
    if (typeof s.id !== "string" || !s.id) throw new Error(`${at}: missing string 'id'`);
    if (seenIds.has(s.id)) throw new Error(`${at}: duplicate id '${s.id}'`);
    seenIds.add(s.id);
    if (typeof s.name !== "string") throw new Error(`${at} (${s.id}): missing 'name'`);
    if (typeof s.url !== "string") throw new Error(`${at} (${s.id}): missing 'url'`);
    if (!validTypes.has(s.type as string)) {
      throw new Error(`${at} (${s.id}): invalid 'type' '${String(s.type)}'`);
    }
    if (!validCategories.has(s.category as string)) {
      throw new Error(`${at} (${s.id}): invalid 'category' '${String(s.category)}'`);
    }
    if (s.locales !== undefined) {
      if (!Array.isArray(s.locales) || s.locales.some((l) => l !== "zh" && l !== "en")) {
        throw new Error(`${at} (${s.id}): 'locales' must be an array of "zh" | "en"`);
      }
    }
    if (
      s.keywordFields !== undefined &&
      s.keywordFields !== "title" &&
      s.keywordFields !== "title-excerpt"
    ) {
      throw new Error(`${at} (${s.id}): 'keywordFields' must be "title" | "title-excerpt"`);
    }
    if (
      s.limit !== undefined &&
      (typeof s.limit !== "number" || !Number.isInteger(s.limit) || s.limit < 1)
    ) {
      throw new Error(`${at} (${s.id}): 'limit' must be a positive integer`);
    }
    if (s.tags !== undefined) {
      if (!Array.isArray(s.tags) || s.tags.some((tag) => typeof tag !== "string")) {
        throw new Error(`${at} (${s.id}): 'tags' must be an array of strings`);
      }
    }
    if (
      s.maxPages !== undefined &&
      (typeof s.maxPages !== "number" ||
        !Number.isInteger(s.maxPages) ||
        s.maxPages < 1)
    ) {
      throw new Error(`${at} (${s.id}): 'maxPages' must be a positive integer`);
    }
    if (
      s.dailyLimit !== undefined &&
      (typeof s.dailyLimit !== "number" || !Number.isInteger(s.dailyLimit) || s.dailyLimit < 1)
    ) {
      throw new Error(`${at} (${s.id}): 'dailyLimit' must be a positive integer`);
    }
    for (const key of ["topics", "includePaths", "excludePaths", "githubRepos"] as const) {
      const value = s[key];
      if (value !== undefined && (!Array.isArray(value) || value.some((v) => typeof v !== "string"))) {
        throw new Error(`${at} (${s.id}): '${key}' must be an array of strings`);
      }
    }
  }
  return applySourceOverrides(parsed as SourceDef[]);
}

function filterByLocale(all: SourceDef[]): SourceDef[] {
  return all.filter((s) => {
    const locales = s.locales ?? ["zh", "en"];
    return locales.includes(REPORT_LOCALE);
  });
}

export const sources: SourceDef[] = filterByLocale(loadAndValidate());

/**
 * The full unfiltered list — used by `npm run sources` so the CLI can
 * show entries that are filtered out in the current locale.
 */
export function loadAllSources(): SourceDef[] {
  return loadAndValidate();
}
