# Console integration

Frontend: https://github.com/No1dry/FeishuBrief-Console

The frontend is deployed separately. This repository owns configuration, source fetching, report generation and notification credentials.

`config/editorial-profile.json` is validated once per process by `lib/editorial/runtime.mjs`. Invalid configuration stops the run before external model work. Missing configuration preserves legacy defaults. The configuration hash is logged and stored with the article sidecar.

The existing Actions workflows do not need changes: checkout and npm ci load the new runtime dependency and configuration automatically. Schedule and notification destinations remain controlled by the existing workflow and repository Secrets/Variables.

Supported: research matching and ranking, source overrides and caps, paper quality threshold and limits, calendar-day deduplication window, editor candidate counts and timeout, unique website article cap, Feishu/PushPlus section counts and Feishu overview/market controls.

The website cap reserves selected research papers first. Message counts are independent. Requested message counts determine editor targets; insufficient source material is not fabricated. Recovery still retains the existing minimum 3/3/2 hard gate.

The current keyword settings prioritize/filter the fetched candidate pool, rather than configuring arbitrary search endpoints on every platform. Weekly and multi-model settings are explicitly unsupported in `config/console-capabilities.json` and are blocked by the frontend when changed.

Configuration submission creates a normal Git commit and does not trigger a report. The frontend uses the current config file SHA to detect stale updates. Each Actions job reads the configuration from its checked-out revision, without runtime hot reloading.

The manual generate operation must call `daily.yml` with `send_notifications=false`. Existing-report pushes use `push-feishu-once.yml` with explicit date/channels and an empty chat_id override. Neither operation is executed by integration tests.

Validation: `npm run editorial:check`, `npm run sources:check`, `npm run papers:check`, `npm run digest:check`, `npx tsc --noEmit`.

Source freshness is documented in `docs/source-freshness.md`; validate it with `npm run freshness:check`.

The Kimi + DeepSeek role runtime is documented in `docs/multi-agent-runtime.md`.
