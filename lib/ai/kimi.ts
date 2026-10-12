import { performance } from 'node:perf_hooks';

export const KIMI_MODEL = 'kimi-k2.6';
export const KIMI_ENDPOINT = 'https://api.moonshot.cn/v1/chat/completions';
const MAX_INPUT_BYTES = 16_000;
const MAX_RESPONSE_BYTES = 256 * 1024;

export interface KimiMessage { role: 'system' | 'user'; content: string }
export interface KimiUsage { promptTokens: number; completionTokens: number; totalTokens: number }
export interface KimiResult {
  text: string; usage: KimiUsage | null; finishReason: string; durationMs: number; model: string;
}
export interface KimiOptions {
  apiKey: string; fetch?: typeof fetch; signal?: AbortSignal; timeoutMs?: number; maxOutputTokens?: number;
}
export type KimiErrorCode =
  | 'KIMI_INVALID_CONFIG' | 'KIMI_INPUT_TOO_LARGE' | 'KIMI_CANCELLED' | 'KIMI_TIMEOUT'
  | 'KIMI_NETWORK_ERROR' | 'KIMI_RESPONSE_READ_ERROR' | 'KIMI_REDIRECT_REJECTED'
  | 'KIMI_HTTP_AUTH' | 'KIMI_HTTP_RATE_LIMITED' | 'KIMI_HTTP_ERROR'
  | 'KIMI_RESPONSE_TOO_LARGE' | 'KIMI_RESPONSE_ENCODING' | 'KIMI_RESPONSE_JSON'
  | 'KIMI_MODEL_MISMATCH' | 'KIMI_CHOICES_INVALID' | 'KIMI_TRUNCATED'
  | 'KIMI_FINISH_REASON' | 'KIMI_MESSAGE_INVALID' | 'KIMI_TOOLS_UNEXPECTED' | 'KIMI_OUTPUT_JSON';

/** Safe diagnostics only: no provider body, headers, credentials, messages or nested exception. */
export class KimiError extends Error {
  readonly name = 'KimiError';
  constructor(
    readonly code: KimiErrorCode,
    readonly usage: KimiUsage | null,
    readonly requestMayHaveBeenBilled: boolean,
    readonly durationMs: number,
  ) { super(code); }
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function safeUsage(value: unknown): KimiUsage | null {
  if (!object(value)) return null;
  const prompt = value.prompt_tokens, completion = value.completion_tokens, total = value.total_tokens;
  if (![prompt, completion, total].every(n => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0)) return null;
  if ((prompt as number) + (completion as number) !== total) return null;
  return { promptTokens: prompt as number, completionTokens: completion as number, totalTokens: total as number };
}

/** One bounded POST only. Explicit credentials; no environment, SDK, tools, redirect or retry path. */
export async function callKimi(messages: KimiMessage[], options: KimiOptions): Promise<KimiResult> {
  const started = performance.now();
  let usage: KimiUsage | null = null, requestStarted = false, responseReceived = false;
  const duration = () => Math.max(0, Math.round(performance.now() - started));
  const fail = (code: KimiErrorCode) => new KimiError(code, usage, requestStarted, duration());
  let body: string, timeoutMs: number, maxOutputTokens: number, fetcher: typeof fetch;
  try {
    if (!options || typeof options !== 'object' || Object.keys(options).some(k => !['apiKey','fetch','signal','timeoutMs','maxOutputTokens'].includes(k))) throw fail('KIMI_INVALID_CONFIG');
    if (typeof options.apiKey !== 'string' || !/^[\x21-\x7e]{1,4096}$/.test(options.apiKey)) throw fail('KIMI_INVALID_CONFIG');
    timeoutMs = options.timeoutMs ?? 60_000; maxOutputTokens = options.maxOutputTokens ?? 1024;
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000 ||
        !Number.isInteger(maxOutputTokens) || maxOutputTokens < 1 || maxOutputTokens > 1024) throw fail('KIMI_INVALID_CONFIG');
    if (options.signal !== undefined && !(options.signal instanceof AbortSignal)) throw fail('KIMI_INVALID_CONFIG');
    fetcher = options.fetch ?? globalThis.fetch;
    if (typeof fetcher !== 'function' || !Array.isArray(messages) || !messages.length ||
        messages.some(m => !object(m) || !['system','user'].includes(m.role) || typeof m.content !== 'string' || !m.content.trim())) throw fail('KIMI_INVALID_CONFIG');
    body = JSON.stringify({
      model: KIMI_MODEL, messages: messages.map(m => ({ role:m.role, content:m.content })),
      thinking: { type: 'disabled' }, response_format: { type: 'json_object' },
      max_tokens: maxOutputTokens, stream: false, n: 1,
    });
    if (Buffer.byteLength(body,'utf8') > MAX_INPUT_BYTES) throw fail('KIMI_INPUT_TOO_LARGE');
  } catch (error) { throw error instanceof KimiError ? error : fail('KIMI_INVALID_CONFIG'); }
  if (options.signal?.aborted) throw fail('KIMI_CANCELLED');

  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let rejectAbort: (error: KimiError) => void = () => {};
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let abortCode: 'KIMI_CANCELLED' | 'KIMI_TIMEOUT' | undefined;
  const stopped = new Promise<never>((_, reject) => { rejectAbort = reject; });
  const cancel = (code: 'KIMI_CANCELLED' | 'KIMI_TIMEOUT') => {
    if (abortCode) return;
    abortCode = code; controller.abort();
    void reader?.cancel().catch(() => {});
    rejectAbort(fail(code));
  };
  const onAbort = () => cancel('KIMI_CANCELLED');
  options.signal?.addEventListener('abort',onAbort,{once:true});
  try {
    if (options.signal?.aborted) throw fail('KIMI_CANCELLED');
    timer = setTimeout(() => cancel('KIMI_TIMEOUT'),timeoutMs);
    const operation = async (): Promise<KimiResult> => {
      requestStarted = true;
      const response = await fetcher(KIMI_ENDPOINT,{
        method:'POST',redirect:'manual',credentials:'omit',signal:controller.signal,
        headers:{'content-type':'application/json',accept:'application/json',authorization:`Bearer ${options.apiKey}`},body,
      });
      responseReceived = true;
      if (abortCode) { void response.body?.cancel().catch(() => {}); throw fail(abortCode); }
      if (response.redirected || response.status >= 300 && response.status < 400 || response.url && response.url !== KIMI_ENDPOINT) {
        void response.body?.cancel().catch(() => {}); throw fail('KIMI_REDIRECT_REJECTED');
      }
      const httpError: KimiErrorCode | null = response.status === 401 || response.status === 403 ? 'KIMI_HTTP_AUTH'
        : response.status === 429 ? 'KIMI_HTTP_RATE_LIMITED' : response.status < 200 || response.status >= 300 ? 'KIMI_HTTP_ERROR' : null;
      const declared = response.headers.get('content-length');
      if (declared && /^\d+$/.test(declared) && Number(declared) > MAX_RESPONSE_BYTES) {
        void response.body?.cancel().catch(() => {}); throw fail(httpError ?? 'KIMI_RESPONSE_TOO_LARGE');
      }
      reader = response.body?.getReader();
      const chunks: Uint8Array[] = []; let count = 0;
      if (reader) {
        try {
          for (;;) {
            const chunk = await reader.read();
            if (abortCode) throw fail(abortCode);
            if (chunk.done) break;
            count += chunk.value.byteLength;
            if (count > MAX_RESPONSE_BYTES) { void reader.cancel().catch(() => {}); throw fail(httpError ?? 'KIMI_RESPONSE_TOO_LARGE'); }
            chunks.push(chunk.value);
          }
        } finally { reader.releaseLock(); reader = undefined; }
      }
      let parsed: unknown;
      try {
        const text = new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks));
        try { parsed = JSON.parse(text); }
        catch { throw fail(httpError ?? 'KIMI_RESPONSE_JSON'); }
      } catch (error) { throw error instanceof KimiError ? error : fail(httpError ?? 'KIMI_RESPONSE_ENCODING'); }
      usage = object(parsed) ? safeUsage(parsed.usage) : null;
      if (httpError) throw fail(httpError);
      if (!object(parsed)) throw fail('KIMI_RESPONSE_JSON');
      if (parsed.model !== KIMI_MODEL) throw fail('KIMI_MODEL_MISMATCH');
      if (!Array.isArray(parsed.choices) || parsed.choices.length !== 1 || !object(parsed.choices[0])) throw fail('KIMI_CHOICES_INVALID');
      const choice = parsed.choices[0];
      if (choice.finish_reason === 'length') throw fail('KIMI_TRUNCATED');
      if (choice.finish_reason !== 'stop') throw fail('KIMI_FINISH_REASON');
      const message = choice.message;
      if (!object(message) || message.role !== 'assistant' || typeof message.content !== 'string' || !message.content.trim()) throw fail('KIMI_MESSAGE_INVALID');
      if (message.tool_calls !== undefined && message.tool_calls !== null && (!Array.isArray(message.tool_calls) || message.tool_calls.length) || message.function_call !== undefined && message.function_call !== null) throw fail('KIMI_TOOLS_UNEXPECTED');
      try { if (!object(JSON.parse(message.content))) throw new Error(); }
      catch { throw fail('KIMI_OUTPUT_JSON'); }
      return { text:message.content,usage,finishReason:'stop',durationMs:duration(),model:KIMI_MODEL };
    };
    return await Promise.race([operation(),stopped]);
  } catch (error) {
    if (error instanceof KimiError) throw error;
    throw fail(abortCode ?? (responseReceived ? 'KIMI_RESPONSE_READ_ERROR' : 'KIMI_NETWORK_ERROR'));
  } finally {
    if (timer) clearTimeout(timer);
    options.signal?.removeEventListener('abort',onAbort);
  }
}
