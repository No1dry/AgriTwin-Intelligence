/**
 * LLM backend dispatcher.
 *
 * All call sites (pipeline / enrich / trading-commentary) import `runLlm`
 * from this module instead of binding to a specific backend. The actual
 * backend is selected at runtime by the LLM_BACKEND environment variable:
 *
 *   LLM_BACKEND=claude-cli   (default; uses local Claude Code CLI, Max billing)
 *   LLM_BACKEND=anthropic    (Anthropic Messages API)
 *   LLM_BACKEND=openai       (OpenAI Chat Completions)
 *   LLM_BACKEND=deepseek     (DeepSeek, OpenAI-compatible)
 *   LLM_BACKEND=minimax      (MiniMax, OpenAI-compatible)
 *   LLM_BACKEND=zhipu        (Zhipu AI / 智谱, Anthropic-compatible)
 *
 * Per-backend config (API keys, models, base URLs) lives in .env.local.
 * See .env.example for the full list.
 */

import { CLAUDE_MODEL, runClaudeCli } from "./backends/claude-cli";
import {
  PRESETS as ANTHROPIC_PRESETS,
  anthropicCompatModel,
  runAnthropicCompat,
} from "./backends/anthropic-compat";
import {
  PRESETS as OPENAI_PRESETS,
  openaiCompatModel,
  runOpenAICompat,
} from "./backends/openai-compat";

export interface LlmRunOptions {
  systemPrompt: string;
  userPrompt: string;
  role?: LlmRole;
  model?: string;
  baseURL?: string;
  timeoutMs?: number;
  maxTokens?: number;
  maxRetries?: number;
  reasoningEffort?: "none" | "low" | "high" | "max";
}

export interface LlmRunResult {
  text: string;
  durationMs: number;
}

export type LlmBackendId =
  "claude-cli" | "anthropic" | "openai" | "deepseek" | "minimax" | "zhipu";

export type LlmRole = "worker" | "editor" | "reviewer";

export interface LlmTarget {
  role: LlmRole;
  backend: LlmBackendId;
  model: string;
  baseURL?: string;
}

const VALID_BACKENDS: ReadonlySet<LlmBackendId> = new Set([
  "claude-cli",
  "anthropic",
  "openai",
  "deepseek",
  "minimax",
  "zhipu",
]);

function parseBackend(
  value: string | undefined,
  variable: string,
): LlmBackendId {
  const raw = (value?.trim() || "claude-cli").toLowerCase();
  if (!VALID_BACKENDS.has(raw as LlmBackendId)) {
    throw new Error(
      `Unknown ${variable}='${raw}'. Valid values: ${[...VALID_BACKENDS].join(", ")}`,
    );
  }
  return raw as LlmBackendId;
}

export function getBackend(): LlmBackendId {
  return parseBackend(process.env.LLM_BACKEND, "LLM_BACKEND");
}

/**
 * Returns the active model name for the configured backend, useful for
 * stamping a MODEL_TAG into report metadata.
 */
function defaultModel(backend: LlmBackendId): string {
  switch (backend) {
    case "claude-cli":
      return CLAUDE_MODEL;
    case "anthropic":
    case "zhipu":
      return anthropicCompatModel(ANTHROPIC_PRESETS[backend]);
    case "openai":
    case "deepseek":
    case "minimax":
      return openaiCompatModel(OPENAI_PRESETS[backend]);
  }
}

function editorTarget(): LlmTarget {
  const backend = parseBackend(
    process.env.LLM_EDITOR_BACKEND || process.env.LLM_BACKEND,
    "LLM_EDITOR_BACKEND",
  );
  return {
    role: "editor",
    backend,
    model:
      process.env.LLM_EDITOR_MODEL?.trim() ||
      process.env.LLM_MODEL?.trim() ||
      defaultModel(backend),
    baseURL: process.env.LLM_EDITOR_BASE_URL?.trim(),
  };
}

export function isRoleEnabled(role: LlmRole): boolean {
  if (role !== "reviewer") return true;
  return Boolean(
    process.env.LLM_REVIEWER_BACKEND?.trim() ||
    process.env.DEEPSEEK_API_KEY?.trim(),
  );
}

export function resolveLlmTarget(role: LlmRole = "editor"): LlmTarget {
  const editor = editorTarget();
  if (role === "editor") return editor;
  if (role === "worker") {
    const backend = process.env.LLM_WORKER_BACKEND?.trim()
      ? parseBackend(process.env.LLM_WORKER_BACKEND, "LLM_WORKER_BACKEND")
      : process.env.DEEPSEEK_API_KEY?.trim()
        ? "deepseek"
        : editor.backend;
    return {
      role,
      backend,
      model:
        process.env.LLM_WORKER_MODEL?.trim() ||
        (backend === "deepseek" ? "deepseek-flash" : editor.model),
      baseURL: process.env.LLM_WORKER_BASE_URL?.trim(),
    };
  }
  const backend = process.env.LLM_REVIEWER_BACKEND?.trim()
    ? parseBackend(process.env.LLM_REVIEWER_BACKEND, "LLM_REVIEWER_BACKEND")
    : "deepseek";
  return {
    role,
    backend,
    model:
      process.env.LLM_REVIEWER_MODEL?.trim() ||
      (backend === "deepseek" ? "deepseek-v4-pro" : defaultModel(backend)),
    baseURL: process.env.LLM_REVIEWER_BASE_URL?.trim(),
  };
}

export function getModelTag(role: LlmRole = "editor"): string {
  const target = resolveLlmTarget(role);
  return `${target.backend}-${target.model}`;
}

export function hasDedicatedRole(role: Exclude<LlmRole, "editor">): boolean {
  if (role === "reviewer") return isRoleEnabled(role);
  const editor = resolveLlmTarget("editor");
  const target = resolveLlmTarget(role);
  return (
    target.backend !== editor.backend ||
    target.model !== editor.model ||
    target.baseURL !== editor.baseURL
  );
}

export async function runLlm(opts: LlmRunOptions): Promise<LlmRunResult> {
  const target = resolveLlmTarget(opts.role ?? "editor");
  const backend = target.backend;
  const routed = {
    ...opts,
    role: target.role,
    model: opts.model ?? target.model,
    baseURL: opts.baseURL ?? target.baseURL,
  };
  switch (backend) {
    case "claude-cli":
      return runClaudeCli(routed);
    case "anthropic":
    case "zhipu":
      return runAnthropicCompat(routed, ANTHROPIC_PRESETS[backend]);
    case "openai":
    case "deepseek":
    case "minimax":
      return runOpenAICompat(routed, OPENAI_PRESETS[backend]);
  }
}
/**
 * Cheap startup sanity-check so a misconfigured backend errors in <1s
 * instead of after 30s of source-fetching + half a dozen confusing
 * "ANTHROPIC_API_KEY required" lines deep into the pipeline.
 *
 * The default LLM_BACKEND in the GH Actions workflow is `anthropic`,
 * so the most common forker mistake is: add DEEPSEEK_API_KEY as a
 * secret, forget to add the matching `LLM_BACKEND=deepseek` variable,
 * then watch the run blow up looking for a key they never intended
 * to use. We detect that exact case and tell them how to fix it.
 */
export function validateBackendCredentials(): void {
  const required: Record<Exclude<LlmBackendId, "claude-cli">, string> = {
    anthropic: "ANTHROPIC_API_KEY",
    openai: "OPENAI_API_KEY",
    deepseek: "DEEPSEEK_API_KEY",
    minimax: "MINIMAX_API_KEY",
    zhipu: "ZHIPU_API_KEY",
  };
  const roles: LlmRole[] = ["editor"];
  if (process.env.LLM_WORKER_BACKEND?.trim()) roles.push("worker");
  if (process.env.LLM_REVIEWER_BACKEND?.trim()) roles.push("reviewer");
  for (const role of roles) {
    const backend = resolveLlmTarget(role).backend;
    if (backend === "claude-cli") continue;
    const requiredVar = required[backend];
    if (process.env[requiredVar] || process.env.LLM_API_KEY) continue;

    const otherKeysSet = Object.entries(required)
      .filter(([b, v]) => b !== backend && !!process.env[v])
      .map(([b, v]) => ({ backend: b, var: v }));

    const lines: string[] = [
      `${role} role uses ${backend}, but ${requiredVar} (and generic LLM_API_KEY) are both unset.`,
    ];
    if (otherKeysSet.length > 0) {
      lines.push(
        "",
        "Other API keys ARE present in the environment — likely you meant to use one of those:",
      );
      for (const k of otherKeysSet) {
        lines.push(`  • ${k.var} is set → switch to LLM_BACKEND=${k.backend}`);
      }
      lines.push(
        "",
        "Fix one of:",
        `  (a) set LLM_BACKEND to match the key you actually have, or`,
        `  (b) add ${requiredVar} for the backend you currently selected.`,
      );
    } else {
      lines.push("", `Fix: set ${requiredVar} (or the generic LLM_API_KEY).`);
    }
    lines.push(
      "",
      "Where to set it:",
      "  • Local:          .env.local at the repo root",
      "  • GitHub Actions: Settings → Secrets and variables → Actions",
      "                    (Secrets tab for the API key, Variables tab for LLM_BACKEND)",
    );
    throw new Error(lines.join("\n"));
  }
}
