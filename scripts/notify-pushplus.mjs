#!/usr/bin/env node
/**
 * Push the latest daily report to personal WeChat via PushPlus (推送加).
 *
 * PushPlus relays through its own WeChat 公众号: anyone who subscribes to your
 * "群组/topic" (by scanning your QR) receives the push in their personal
 * WeChat — no WeCom/企业微信 needed.
 *
 * Triggered automatically after a successful daily run (run-daily.mjs locally,
 * daily.yml in CI). Manual:
 *   node scripts/notify-pushplus.mjs              # today's report
 *   node scripts/notify-pushplus.mjs 2026-05-20   # a specific date
 *
 * Configuration (.env.local locally, or Actions secret/var in CI):
 *   PUSHPLUS_TOKEN       your PushPlus token (pushplus.plus → 发送消息 / 一对一)
 *   PUSHPLUS_TOPIC       optional; 群组编码 — set it to fan out to all group
 *                        subscribers. Unset → sends only to the token owner.
 *   PUSHPLUS_REPORT_URL  optional; web-link base (falls back to FEISHU_REPORT_URL)
 *
 * PUSHPLUS_TOKEN unset → push is a no-op (matches the Feishu/deploy pattern).
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

import fs from "node:fs";
import path from "node:path";
import { getNotificationPolicy } from "../lib/editorial/runtime.mjs";

const token = process.env.PUSHPLUS_TOKEN?.trim();
if (!token) {
  console.log("[pushplus] PUSHPLUS_TOKEN not set — skipping");
  process.exit(0);
}
const topic = process.env.PUSHPLUS_TOPIC?.trim() || undefined;

// --- Pick the report (same date logic as the other notifiers) ---
const dateArg = process.argv[2];
const todayLocal = new Intl.DateTimeFormat("en-CA", {
  timeZone: process.env.REPORT_TZ?.trim() || undefined,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

function jsonPath(d) {
  return path.join("daily_reports", d, `${d}.json`);
}

let date;
let file;
if (dateArg) {
  date = dateArg;
  file = jsonPath(date);
  if (!fs.existsSync(file)) {
    console.error(`[pushplus] local file missing: ${file}`);
    process.exit(1);
  }
} else if (fs.existsSync(jsonPath(todayLocal))) {
  date = todayLocal;
  file = jsonPath(todayLocal);
} else {
  const dirs = fs.existsSync("daily_reports")
    ? fs
        .readdirSync("daily_reports")
        .filter((f) => /^\d{4}-\d{2}-\d{2}$/.test(f))
        .filter((f) => fs.existsSync(jsonPath(f)))
        .sort()
    : [];
  if (dirs.length === 0) {
    console.error(
      "[pushplus] no <YYYY-MM-DD>/<YYYY-MM-DD>.json files in daily_reports/",
    );
    process.exit(1);
  }
  date = dirs[dirs.length - 1];
  file = jsonPath(date);
  console.log(
    `[pushplus] today (${todayLocal}) not generated yet, pushing latest: ${date}`,
  );
}

const report = JSON.parse(fs.readFileSync(file, "utf8"));
const notificationPolicy = getNotificationPolicy();
if (report.quality_review?.status === "failed") {
  const review = report.quality_review;
  console.error(
    `[pushplus] REFUSING reviewer-failed digest after ${review.history?.length ?? review.attempt ?? "unknown"}/${review.maxAttempts ?? "unknown"} review rounds: score=${review.score ?? "unknown"}, exhausted=${review.exhausted ?? false}`,
  );
  process.exit(1);
}

const sectionCounts = {
  tech: Array.isArray(report.tech_briefs) ? report.tech_briefs.length : 0,
  finance: Array.isArray(report.finance_briefs)
    ? report.finance_briefs.length
    : 0,
  politics: Array.isArray(report.politics_briefs)
    ? report.politics_briefs.length
    : 0,
};
if (
  sectionCounts.tech < 3 ||
  sectionCounts.finance < 3 ||
  sectionCounts.politics < 2
) {
  console.error(
    `[pushplus] REFUSING incomplete digest: tech=${sectionCounts.tech}, finance=${sectionCounts.finance}, politics=${sectionCounts.politics}`,
  );
  process.exit(1);
}

// --- Resolve the web-report link (shared with Feishu) ---
function resolveReportUrl(base, d) {
  if (!base) return undefined;
  if (base.includes("{date}")) return base.replaceAll("{date}", d);
  if (/\.html?($|[?#])/i.test(base)) return base;
  return `${base.replace(/\/+$/, "")}/${d}/${d}.html`;
}
const reportUrl = resolveReportUrl(
  (process.env.PUSHPLUS_REPORT_URL || process.env.FEISHU_REPORT_URL)?.trim(),
  date,
);

// --- Build the markdown body ---
function clip(s, n) {
  const t = (s ?? "").toString().trim().replace(/\s+/g, " ");
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
}

function section(label, briefs, max) {
  if (!Array.isArray(briefs) || briefs.length === 0) return "";
  const lines = briefs
    .slice(0, max)
    .map((b) => {
      const title = clip(b.title, 80) || "(untitled)";
      const head = b.url ? `[${title}](${b.url})` : title;
      const body = clip(b.summary, 120);
      return `- **${head}**  \n  ${body}`;
    })
    .join("\n");
  return `### ${label}\n${lines}\n`;
}

const parts = [];
if (report.hero_headline) parts.push(`**${clip(report.hero_headline, 120)}**`);
if (notificationPolicy.overview && report.daily_overview)
  parts.push(clip(report.daily_overview, 400));
const tech = section(
  "🧪 科技",
  report.tech_briefs,
  notificationPolicy.pushplus.tech,
);
const fin = section(
  "💰 财经",
  report.finance_briefs,
  notificationPolicy.pushplus.finance,
);
const pol = section(
  "🌍 时政",
  report.politics_briefs,
  notificationPolicy.pushplus.politics,
);
parts.push([tech, fin, pol].filter(Boolean).join("\n"));
if (Array.isArray(report.keywords) && report.keywords.length) {
  parts.push(
    `> 关键词：${report.keywords
      .slice(0, 8)
      .map((k) => clip(k, 16))
      .join(" · ")}`,
  );
}
if (reportUrl) parts.push(`**[👉 查看完整网页版](${reportUrl})**`);

const content = parts.filter(Boolean).join("\n\n");
const title = `📰 每日简报 · ${date}`;

// --- Send ---
const body = { token, title, content, template: "markdown" };
if (topic) body.topic = topic;

const res = await fetch("https://www.pushplus.plus/send", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
let data;
try {
  data = await res.json();
} catch {
  console.error(`[pushplus] FAILED: HTTP ${res.status}, non-JSON response`);
  process.exit(1);
}
if (data.code !== 200) {
  console.error(`[pushplus] FAILED: code ${data.code} — ${data.msg}`);
  process.exit(1);
}
console.log(
  `[pushplus] OK — pushed ${date} digest${topic ? ` to topic '${topic}'` : " (to token owner)"}`,
);
