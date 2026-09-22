import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { configSchema, defaultConfig } from "./schema.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
let loaded = false;
let policy = null;
export function loadEditorialConfig(
  file = process.env.EDITORIAL_PROFILE_PATH ||
    path.join(root, "config/editorial-profile.json"),
) {
  if (!fs.existsSync(file)) return null;
  const text = fs.readFileSync(file, "utf8");
  if (Buffer.byteLength(text) > 200000)
    throw new Error("Editorial configuration exceeds 200 KB");
  const result = configSchema.safeParse(JSON.parse(text));
  if (!result.success)
    throw new Error(
      `Invalid editorial configuration: ${result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`,
    );
  return result.data;
}
export function getEditorialConfig() {
  if (!loaded) {
    policy = loadEditorialConfig();
    loaded = true;
  }
  return policy;
}
export function editorialPolicyHash() {
  const current = getEditorialConfig();
  return current
    ? createHash("sha256")
        .update(JSON.stringify(current))
        .digest("hex")
        .slice(0, 16)
    : "legacy";
}
function normalized(text) {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
export function matchesKeyword(text, keyword) {
  const haystack = normalized(text),
    needle = normalized(keyword);
  if (!needle) return false;
  if (!/^[\x00-\x7f]+$/.test(needle)) return haystack.includes(needle);
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:s)?(?:$|[^a-z0-9])`, "i").test(
    haystack,
  );
}
export function matchingTopics(article, config = getEditorialConfig()) {
  if (!config) return [];
  const text = `${article.title}\n${article.excerpt ?? ""}\n${article.contentText ?? ""}\n${article.summary ?? ""}`;
  return config.researchTopics.filter((topic) => {
    const builtInAliases =
      topic.id === "world-model" ? ["world modeling", "world modelling"] : [];
    return (
      topic.enabled &&
      topic.weight > 0 &&
      !topic.excludeKeywords.some((word) => matchesKeyword(text, word)) &&
      [...topic.keywords, ...topic.aliases, ...builtInAliases].some((word) =>
        matchesKeyword(text, word),
      )
    );
  });
}
export function applySourceOverrides(sources, config = getEditorialConfig()) {
  if (!config) return sources;
  const ids = new Set(sources.map((source) => source.id));
  for (const id of Object.keys(config.sourceOverrides))
    if (!ids.has(id))
      throw new Error(
        `Editorial configuration references unknown source: ${id}`,
      );
  return sources.map((source) => {
    const override = config.sourceOverrides[source.id];
    if (!override) return source;
    return {
      ...source,
      ...(override.enabled === undefined ? {} : { enabled: override.enabled }),
      ...(override.dailyLimit === undefined
        ? {}
        : { dailyLimit: override.dailyLimit, limit: override.dailyLimit }),
      ...(override.priority === undefined
        ? {}
        : { tier: { P0: "T0", P1: "T2", P2: "T3" }[override.priority] }),
    };
  });
}
export function requestedBriefCounts(config = getEditorialConfig()) {
  const c = config ?? defaultConfig;
  return Object.fromEntries(
    ["tech", "finance", "politics"].map((category) => [
      category,
      Math.max(
        c.notifications.feishu[category],
        c.notifications.pushplus[category],
      ),
    ]),
  );
}
export function getNotificationPolicy() {
  return (getEditorialConfig() ?? defaultConfig).notifications;
}
