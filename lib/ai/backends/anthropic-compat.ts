import Anthropic from "@anthropic-ai/sdk";
import { classifyError, logLlmCall } from "../log";
import type { LlmRunOptions, LlmRunResult } from "../llm";

export interface AnthropicCompatConfig {
  backend: "anthropic" | "zhipu";
  defaultBaseUrl: string | undefined;
  defaultModel: string;
  apiKeyEnv: string;
  baseUrlEnv: string;
}

export const PRESETS: Record<
  AnthropicCompatConfig["backend"],
  AnthropicCompatConfig
> = {
  anthropic: {
    backend: "anthropic",
    defaultBaseUrl: undefined,
    defaultModel: "claude-sonnet-4-6",
    apiKeyEnv: "ANTHROPIC_API_KEY",
    baseUrlEnv: "ANTHROPIC_BASE_URL",
  },
  zhipu: {
    backend: "zhipu",
    defaultBaseUrl: "https://open.bigmodel.cn/api/anthropic",
    defaultModel: "claude-sonnet-4-6",
    apiKeyEnv: "ZHIPU_API_KEY",
    baseUrlEnv: "ZHIPU_BASE_URL",
  },
};

const clientCache = new Map<string, Anthropic>();

function getClient(
  cfg: AnthropicCompatConfig,
  opts: LlmRunOptions,
): { client: Anthropic; model: string } {
  const apiKey = process.env[cfg.apiKeyEnv] || process.env.LLM_API_KEY;
  if (!apiKey) {
    throw new Error(
      `${cfg.apiKeyEnv} (or generic LLM_API_KEY) is required for LLM_BACKEND=${cfg.backend}. Set it in .env.local.`,
    );
  }
  const baseURL =
    opts.baseURL?.trim() ||
    process.env[cfg.baseUrlEnv]?.trim() ||
    process.env.LLM_BASE_URL?.trim() ||
    cfg.defaultBaseUrl;
  const model =
    opts.model?.trim() || process.env.LLM_MODEL?.trim() || cfg.defaultModel;

  const cacheKey = `${baseURL ?? "default"}::${apiKey.slice(-6)}`;
  let client = clientCache.get(cacheKey);
  if (!client) {
    client = new Anthropic({ apiKey, baseURL });
    clientCache.set(cacheKey, client);
  }
  return { client, model };
}

export function anthropicCompatModel(cfg: AnthropicCompatConfig): string {
  return process.env.LLM_MODEL?.trim() || cfg.defaultModel;
}

export async function runAnthropicCompat(
  opts: LlmRunOptions,
  cfg: AnthropicCompatConfig,
): Promise<LlmRunResult> {
  const { client, model } = getClient(cfg, opts);
  const started = Date.now();
  const inputChars = opts.systemPrompt.length + opts.userPrompt.length;
  const timeoutMs = opts.timeoutMs ?? 180_000;

  try {
    const resp = await client.messages.create(
      {
        model,
        // The daily digest can contain 8-10k tokens of Chinese JSON. Keep
        // enough headroom so the provider does not cut the final object in
        // half; pipeline.ts also has a compact-output retry as a fallback.
        max_tokens: opts.maxTokens ?? 16384,
        system: opts.systemPrompt,
        messages: [{ role: "user", content: opts.userPrompt }],
        // Structured JSON tasks should spend the output budget on the answer,
        // not hidden/visible reasoning blocks. Moonshot's Anthropic-compatible
        // endpoint accepts the same disabled-thinking shape.
        ...(opts.reasoningEffort === "none"
          ? { thinking: { type: "disabled" as const } }
          : {}),
      },
      { timeout: timeoutMs, maxRetries: opts.maxRetries },
    );
    const text = resp.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("")
      .trim();
    const blockTypes = resp.content.map((block) => block.type);
    const thinkingChars = resp.content.reduce(
      (total, block) =>
        total + (block.type === "thinking" ? block.thinking.length : 0),
      0,
    );
    if (!text) {
      throw new Error(
        `empty text response from ${model} (stop_reason=${resp.stop_reason ?? "unknown"}, block_types=${blockTypes.join(",") || "none"}, thinking_chars=${thinkingChars}, output_tokens=${resp.usage.output_tokens})`,
      );
    }
    if (resp.stop_reason === "max_tokens") {
      throw new Error(
        `truncated response from ${model} (stop_reason=max_tokens, output_chars=${text.length}, thinking_chars=${thinkingChars}, output_tokens=${resp.usage.output_tokens})`,
      );
    }
    const durationMs = Date.now() - started;
    logLlmCall({
      ts: new Date(started).toISOString(),
      backend: cfg.backend,
      role: opts.role ?? "editor",
      model,
      durationMs,
      success: true,
      inputChars,
      outputChars: text.length,
      errorCategory: null,
      errorSnippet: null,
    });
    return { text, durationMs };
  } catch (err) {
    const durationMs = Date.now() - started;
    const msg = err instanceof Error ? err.message : String(err);
    logLlmCall({
      ts: new Date(started).toISOString(),
      backend: cfg.backend,
      role: opts.role ?? "editor",
      model,
      durationMs,
      success: false,
      inputChars,
      outputChars: 0,
      errorCategory: classifyError(msg),
      errorSnippet: msg.slice(0, 200),
    });
    throw err;
  }
}
