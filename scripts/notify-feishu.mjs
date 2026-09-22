#!/usr/bin/env node
/**
 * Push the latest daily report to a Feishu / Lark group chat as an
 * interactive card.
 *
 * Triggered automatically by run-daily.mjs after a successful daily run.
 * Manual invocation:
 *   node scripts/notify-feishu.mjs              # today's report
 *   node scripts/notify-feishu.mjs 2026-05-20   # a specific date
 *
 * Configuration (in .env.local — gitignored, never shipped):
 *   FEISHU_APP_ID=cli_xxx           # 自建应用 App ID
 *   FEISHU_APP_SECRET=xxx           # 自建应用 App Secret
 *   FEISHU_CHAT_ID=oc_xxx           # 目标群聊的 chat_id；多个群用逗号分隔
 *   FEISHU_BASE_URL=                # optional; default https://open.feishu.cn
 *                                   #   Lark (international): https://open.larksuite.com
 *   FEISHU_RECEIVE_ID_TYPE=         # optional; default chat_id (open_id/user_id/email also valid)
 *   FEISHU_REPORT_URL=              # optional; if set, card adds a "查看完整网页版" button
 *
 * Any of APP_ID / APP_SECRET / CHAT_ID unset → push is a no-op (forks
 * without Feishu skip it silently, matching deploy.mjs behaviour).
 *
 * App permission required: im:message  (send messages as the application).
 * The application must also be added to the target group.
 */
import { config } from "dotenv";
// quiet: true suppresses dotenv v17's stdout banner advertising paid products.
config({ path: ".env.local", quiet: true });

import fs from "node:fs";
import path from "node:path";
import { getNotificationPolicy } from "../lib/editorial/runtime.mjs";

const appId = process.env.FEISHU_APP_ID?.trim();
const appSecret = process.env.FEISHU_APP_SECRET?.trim();
const chatIds = (process.env.FEISHU_CHAT_ID ?? "")
  .split(/[\n,]+/)
  .map((id) => id.trim())
  .filter(Boolean);

if (!appId || !appSecret || chatIds.length === 0) {
  console.log(
    "[feishu] FEISHU_APP_ID / FEISHU_APP_SECRET / FEISHU_CHAT_ID not all set in .env.local — skipping",
  );
  process.exit(0);
}

const baseUrl = (
  process.env.FEISHU_BASE_URL?.trim() || "https://open.feishu.cn"
).replace(/\/+$/, "");
const receiveIdType = process.env.FEISHU_RECEIVE_ID_TYPE?.trim() || "chat_id";
if (receiveIdType !== "chat_id") {
  console.error(
    `[feishu] REFUSING to push: FEISHU_RECEIVE_ID_TYPE must be chat_id for the guarded group, got ${receiveIdType}`,
  );
  process.exit(1);
}

// Build the "查看完整网页版" button target from FEISHU_REPORT_URL.
//   - contains {date}      → substitute (full control)
//   - ends in .html/.htm   → used verbatim (single fixed page)
//   - otherwise (a base)   → `${base}/<date>/<date>.html` (GitHub Pages layout)
// The per-date form is preferred so an old card still links to that day's
// report instead of whatever index.html currently shows.
function resolveReportUrl(base, d) {
  if (!base) return undefined;
  if (base.includes("{date}")) return base.replaceAll("{date}", d);
  if (/\.html?($|[?#])/i.test(base)) return base;
  return `${base.replace(/\/+$/, "")}/${d}/${d}.html`;
}

// --- Pick the report to push (same date logic as deploy.mjs) ---
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
    console.error(`[feishu] local file missing: ${file}`);
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
      "[feishu] no <YYYY-MM-DD>/<YYYY-MM-DD>.json files in daily_reports/",
    );
    process.exit(1);
  }
  date = dirs[dirs.length - 1];
  file = jsonPath(date);
  console.log(
    `[feishu] today (${todayLocal}) not generated yet, pushing latest: ${date}`,
  );
}

const report = JSON.parse(fs.readFileSync(file, "utf8"));
const notificationPolicy = getNotificationPolicy();
if (report.quality_review?.status === "failed") {
  const review = report.quality_review;
  console.error(
    `[feishu] REFUSING reviewer-failed digest after ${review.history?.length ?? review.attempt ?? "unknown"}/${review.maxAttempts ?? "unknown"} review rounds: score=${review.score ?? "unknown"}, exhausted=${review.exhausted ?? false}`,
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
    `[feishu] REFUSING incomplete digest: tech=${sectionCounts.tech}, finance=${sectionCounts.finance}, politics=${sectionCounts.politics}`,
  );
  process.exit(1);
}

// --- Build the interactive card from the DailyReport JSON ---

// Lark markdown (lark_md) supports **bold**, [text](url) and <font> tags.
// Keep summaries short so the card stays readable on mobile.
function clip(s, n) {
  const t = (s ?? "").toString().trim().replace(/\s+/g, " ");
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
}

function briefsBlock(briefs, max) {
  if (!Array.isArray(briefs) || briefs.length === 0) return "_（暂无）_";
  return briefs
    .slice(0, max)
    .map((b) => {
      const title = clip(b.title, 80) || "(untitled)";
      const head = b.url ? `**[${title}](${b.url})**` : `**${title}**`;
      const body = clip(b.summary, 160);
      const src = b.source
        ? `\n<font color='grey'>—— ${clip(b.source, 40)}</font>`
        : "";
      return `${head}\n${body}${src}`;
    })
    .join("\n\n");
}

const elements = [];

const heroParts = [];
if (report.hero_headline)
  heroParts.push(`**${clip(report.hero_headline, 120)}**`);
if (notificationPolicy.overview && report.daily_overview)
  heroParts.push(clip(report.daily_overview, 600));
if (heroParts.length) {
  elements.push({ tag: "markdown", content: heroParts.join("\n\n") });
}

const sectionDefs = [
  ["🧪 科技", report.tech_briefs, notificationPolicy.feishu.tech],
  ["💰 财经", report.finance_briefs, notificationPolicy.feishu.finance],
  ["🌍 时政", report.politics_briefs, notificationPolicy.feishu.politics],
];
for (const [label, briefs, max] of sectionDefs) {
  if (Array.isArray(briefs) && briefs.length > 0) {
    elements.push({ tag: "hr" });
    elements.push({
      tag: "markdown",
      content: `**${label}**\n\n${briefsBlock(briefs, max)}`,
    });
  }
}

// Optional concise trading line.
if (
  notificationPolicy.market &&
  report.trading &&
  report.trading.market_overview
) {
  elements.push({ tag: "hr" });
  elements.push({
    tag: "markdown",
    content: `**📈 市场观察**\n\n${clip(report.trading.market_overview, 300)}`,
  });
}

const footerBits = [];
if (report.editor_note) footerBits.push(`📝 ${clip(report.editor_note, 200)}`);
if (Array.isArray(report.keywords) && report.keywords.length) {
  footerBits.push(
    `**关键词：** ${report.keywords
      .slice(0, 8)
      .map((k) => `#${clip(k, 20)}`)
      .join(" · ")}`,
  );
}
if (footerBits.length) {
  elements.push({ tag: "hr" });
  elements.push({ tag: "markdown", content: footerBits.join("\n\n") });
}

const reportUrl = resolveReportUrl(process.env.FEISHU_REPORT_URL?.trim(), date);
if (reportUrl) {
  elements.push({
    tag: "action",
    actions: [
      {
        tag: "button",
        text: { tag: "plain_text", content: "查看完整网页版" },
        type: "primary",
        url: reportUrl,
      },
    ],
  });
}

const card = {
  config: { wide_screen_mode: true },
  header: {
    title: { tag: "plain_text", content: `📰 每日简报 · ${date}` },
    template: "blue",
  },
  elements,
};

// --- Feishu API calls ---

async function feishuJson(url, init) {
  const res = await fetch(url, init);
  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error(`${url} → HTTP ${res.status}, non-JSON response`);
  }
  if (data.code !== 0) {
    throw new Error(
      `${url} → code ${data.code}: ${data.msg ?? "unknown error"}`,
    );
  }
  return data;
}

async function main() {
  const tokenData = await feishuJson(
    `${baseUrl}/open-apis/auth/v3/tenant_access_token/internal`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
    },
  );
  const token = tokenData.tenant_access_token;

  const failures = [];
  for (const chatId of chatIds) {
    try {
      await feishuJson(
        `${baseUrl}/open-apis/im/v1/messages?receive_id_type=${encodeURIComponent(receiveIdType)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            receive_id: chatId,
            msg_type: "interactive",
            content: JSON.stringify(card),
          }),
        },
      );
      console.log(
        `[feishu] OK — pushed ${date} digest to ${receiveIdType}=${chatId}`,
      );
    } catch (error) {
      failures.push({ chatId, error });
      console.error(
        `[feishu] FAILED for ${receiveIdType}=${chatId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `push failed for ${failures.length}/${chatIds.length} Feishu groups`,
    );
  }

  console.log(
    `[feishu] OK — pushed ${date} digest to ${chatIds.length} Feishu groups`,
  );
}

main().catch((e) => {
  console.error(
    `[feishu] FAILED: ${e instanceof Error ? e.message : String(e)}`,
  );
  process.exit(1);
});
