# AgriTwin external agriculture development

Read README.md before changing behavior. The current public workflow is the standalone external-source subsystem.

- Use lib/external/sources.ts for the 16 researched groups and independently labelled Open-Meteo supplement. Remove unsuitable inherited source catalogs instead of retaining disabled entries.
- Collect real public information. Never fill collection failures with synthetic articles. Internal farm objects, sensor readings and ontology associations remain null/N/A.
- The user authorized official Kimi K2.6 through repository Actions secret MOONSHOT_API_KEY. Only external-live.yml with run_model enabled or the CLI --live flag calls it. Maximum 3 calls per run, 1024 output tokens each, thinking disabled, no automatic retry or paid schedule.
- Model quote IDs resolve to exact source snippets prepared by code. Never trust model URLs. Quote binding and JSON validation do not establish semantic correctness or farm suitability.
- Preserve publication precision, completion times, response/content hashes, restrictions and per-source failures. Never use collection time or a URL date as publication date. Exclude future-dated publications from current news.
- Open-Meteo is regional model weather, not a farm observation. Missing QWeather credentials mean official forecast/alerts are disconnected, not no alerts. Esri imagery is not real-time and requires visible attribution.
- Public output is limited to public/external/latest.json and brief.md: short excerpts, summaries, references, health and usage. Keep full fetched text, private farm data and credentials out of Git. Never log provider error bodies or headers.
- Use Node.js 24 and node --import tsx --test tests/external-*.test.ts. The separate No1dry/AgriTwin-Showcase repository runs frontend tests and Pages deployment without Secrets.
- Platform import, task creation, device control, notifications and ontology integration are outside this phase. Standalone Pages deployment and dated documentation upload are authorized.
- Archive every generated or substantially revised project document under docs/conversation-archive/<category>/YYYY-MM-DD/. Preserve earlier versions, update the index and a dated hash manifest, and verify the remote files; local staging alone is not delivery.
- Retain LICENSE and UPSTREAM.md attribution.
