import OpenAI from "openai";
import { classifyError, logLlmCall } from "../log";
import type { LlmRunOptions, LlmRunResult } from "../llm";

/**
 * OpenAI-compatible backend. Reused for any provider that exposes the
 * standard `/chat/completions` endpoint: OpenAI itself, DeepSeek, MiniMax,
 * Groq, Together, OpenRouter, local LM Studio / Ollama, etc.
 */
export interface OpenAICompatConfig {
  /** Stable backend id, used in logs and error messages */
  backend: "openai" | "deepseek" | "minimax";
  defaultBaseUrl: string;
  defaultModel: string;
  apiKeyEnv: string;
  baseUrlEnv: string;
}

export const PRESETS: Record<
  OpenAICompatConfig["backend"],
  OpenAICompatConfig
> = {
  openai: {
    backend: "openai",
    defaultBaseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    apiKeyEnv: "OPENAI_API_KEY",
    baseUrlEnv: "OPENAI_BASE_URL",
  },
  deepseek: {
    backend: "deepseek",
    defaultBaseUrl: "https://api.deepseek.com",
    // deepseek-chat alias retires 2026-07-24 — point new users at the
    // current production model instead.
    defaultModel: "deepseek-flash",
    apiKeyEnv: "DEEPSEEK_API_KEY",
    baseUrlEnv: "DEEPSEEK_BASE_URL",
  },
  minimax: {
    backend: "minimax",
    defaultBaseUrl: "https://api.minimax.io/v1",
    defaultModel: "MiniMax-M2.7",
    apiKeyEnv: "MINIMAX_API_KEY",
    baseUrlEnv: "MINIMAX_BASE_URL",
  },
};

const clientCache = new Map<string, OpenAI>();

function getClient(
  cfg: OpenAICompatConfig,
  opts: LlmRunOptions,
): { client: OpenAI; model: string } {
  // Provider-specific env wins; LLM_API_KEY / LLM_BASE_URL are generic
  // aliases so users pointing at a non-preset OpenAI-compatible service
  // (Moonshot, SiliconFlow, OpenRouter, self-hosted vLLM, ...) don't have
  // to misuse the OPENAI_* variable names just to reach a custom endpoint.
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

  const cacheKey = `${baseURL}::${apiKey.slice(-6)}`;
  let client = clientCache.get(cacheKey);
  if (!client) {
    client = new OpenAI({ apiKey, baseURL });
    clientCache.set(cacheKey, client);
  }
  return { client, model };
}

export function openaiCompatModel(cfg: OpenAICompatConfig): string {
  return process.env.LLM_MODEL?.trim() || cfg.defaultModel;
}

export async function runOpenAICompat(
  opts: LlmRunOptions,
  cfg: OpenAICompatConfig,
): Promise<LlmRunResult> {
  const { client, model } = getClient(cfg, opts);
  const started = Date.now();
  const inputChars = opts.systemPrompt.length + opts.userPrompt.length;
  const timeoutMs = opts.timeoutMs ?? 180_000;

  try {
    const request: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming &
      Record<string, unknown> = {
      model,
      messages: [
        { role: "system", content: opts.systemPrompt },
        { role: "user", content: opts.userPrompt },
      ],
      // Explicit max_tokens — most providers default low (DeepSeek 4096,
      // some MiniMax variants 2048). A large batch can exceed 8K output
      // tokens once you count Chinese chars + JSON structure; use the same
      // headroom as the Anthropic-compatible backend.
      max_tokens: opts.maxTokens ?? 16384,
      // Don't force JSON mode — not all OpenAI-compat providers support
      // response_format=json_object, and our prompts + jsonrepair already
      // handle the slop.
    };
    if (cfg.backend === "deepseek" && opts.reasoningEffort) {
      const deepseekRequest = request as Record<string, unknown>;
      deepseekRequest.thinking = {
        type: opts.reasoningEffort === "none" ? "disabled" : "enabled",
      };
      if (opts.reasoningEffort !== "none") {
        deepseekRequest.reasoning_effort = opts.reasoningEffort;
      }
    }
    const resp = await client.chat.completions.create(request, {
      timeout: timeoutMs,
      maxRetries: opts.maxRetries,
    });
    const choice = resp.choices[0];
    const message = choice?.message as
      | (OpenAI.Chat.Completions.ChatCompletionMessage & {
          reasoning_content?: string | null;
        })
      | undefined;
    const text = (message?.content ?? "").trim();
    const reasoningChars = (message?.reasoning_content ?? "").length;
    const finishReason = choice?.finish_reason ?? "missing";
    const completionTokens = resp.usage?.completion_tokens ?? "unknown";
    if (!text) {
      throw new Error(
        `empty text response from ${model} (finish_reason=${finishReason}, reasoning_chars=${reasoningChars}, completion_tokens=${completionTokens})`,
      );
    }
    if (finishReason !== "stop") {
      throw new Error(
        `incomplete response from ${model} (finish_reason=${finishReason}, output_chars=${text.length}, reasoning_chars=${reasoningChars}, completion_tokens=${completionTokens})`,
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
