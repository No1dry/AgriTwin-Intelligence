# Multi-agent daily runtime

The daily pipeline uses deterministic orchestration. Models do not communicate freely and never control publication targets.

## Roles

1. Worker: per-item enrichment and paper semantic review. Default `deepseek-flash` when `DEEPSEEK_API_KEY` exists; otherwise it reuses the editor backend so the legacy pipeline remains available.
2. Editor: final Chinese digest and market commentary. Defaults to the existing `LLM_BACKEND` / `LLM_MODEL` configuration; the production repository currently uses Kimi K2.6 through the Anthropic-compatible Moonshot endpoint.
3. Reviewer: independent report review. Default `deepseek-v4-pro` when `DEEPSEEK_API_KEY` exists. Without a reviewer key the validated editor report follows the legacy path.

Structured drafting and revision run with thinking disabled so the output budget is reserved for complete JSON. DeepSeek review keeps high-effort thinking and uses a larger token budget because DeepSeek counts both `reasoning_content` and final `content` against `max_tokens`. Empty text, `max_tokens`/`length` stops, filtered output and other non-final finish reasons are treated as failed calls with diagnostic metadata instead of successful empty results.

Role-specific variables override the automatic route:

```text
LLM_WORKER_BACKEND / LLM_WORKER_MODEL / LLM_WORKER_BASE_URL
LLM_EDITOR_BACKEND / LLM_EDITOR_MODEL / LLM_EDITOR_BASE_URL
LLM_REVIEWER_BACKEND / LLM_REVIEWER_MODEL / LLM_REVIEWER_BASE_URL
```

Provider credentials remain provider-specific. DeepSeek roles use `DEEPSEEK_API_KEY`; the Kimi editor uses the existing Anthropic-compatible credential and endpoint.

## Daily sequence

```text
fetch + freshness + deterministic dedupe
-> DeepSeek paper semantic review
-> deterministic/semantic paper score fusion
-> DeepSeek worker summaries
-> Kimi editor draft
-> if Kimi output is truncated or incomplete: DeepSeek Worker compact draft
-> deterministic schema and count validation
-> DeepSeek Pro independent review
-> when below threshold: Kimi evidence-bound revision
-> if Kimi returns empty, truncated or invalid JSON: DeepSeek Worker repair
-> deterministic schema / URL / source / count validation
-> DeepSeek Pro re-review
-> repeat the revision-review loop until passed (maximum 4 reviews by default)
-> render
-> deterministic notification gate
```

Paper semantic review combines 40% deterministic score, 35% semantic relevance and 25% semantic quality. The deterministic history, evidence and source-cap rules remain authoritative.

Review is evidence-bound: the reviewer receives the report and a compact candidate evidence set. It returns only score, blocking issues, suggestions and a short summary. It cannot add URLs or directly publish. Every failed review is returned to the Kimi editor, and each revision is stabilized against the previous valid draft before deterministic URL, source, category and count checks. Only a valid revision reaches the next DeepSeek review.

Each review round also has bounded model failover: DeepSeek Pro is attempted twice, then DeepSeek Worker performs one fallback review. Empty or truncated reviewer output is an error, not a pass. If all three calls fail, the webpage may still be generated for diagnosis, but the report receives a failed quality gate and Feishu/PushPlus remain blocked.

The loop is deliberately bounded. `LLM_REVIEW_MAX_ATTEMPTS` defaults to 4 and is clamped to 2-6 when supplied by a local or self-hosted runtime. The stored `quality_review` includes the full score/issue history plus `exhausted`, so the result is auditable. A report that still fails after the configured maximum remains blocked from Feishu and PushPlus.

`logs/llm-calls.jsonl` records `role`, backend, model, duration and success for every call. The article sidecar records paper deterministic score, semantic score, decision and reason; it does not expose model reasoning text.

## Activation

Add repository Secret `DEEPSEEK_API_KEY`. No workflow edit is required because the existing workflow already forwards that Secret. The next run logs the resolved Worker, Editor and Reviewer models before fetching sources.

Optional model overrides should be changed one role at a time. Four review attempts is the recommended production setting; increase it only when the workflow time budget and API quota have been checked.

## Verification

```bash
npm run roles:check
npm run reviewer:check
npm run papers:check
npm run digest:check
npx tsc --noEmit
```

The checks use synthetic data and do not call external models or notification services.
