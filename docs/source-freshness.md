# Source freshness and repeated-content policy

The daily pipeline filters fetched items before paper selection and LLM enrichment. Prior report sidecars restored by GitHub Actions provide a 14-calendar-day history.

## General sources

- The same canonical URL or the same normalized title from the same source appears once per 14 days.
- Tracking parameters and URL fragments do not create a new identity.
- GitHub blob commit hashes are ignored when the file path is unchanged.
- Person, company and institution feeds must carry recent publication dates when available. Academic-author feeds are handled by the paper-specific history policy.
- Person videos are limited to 48 hours; other dated entity updates are limited to 72 hours.

Items without a reliable publication timestamp can enter once if their URL/title has not appeared before. This avoids treating an unknown date as fresh every day while retaining a first observation from sources whose feeds omit dates.

## GitHub Trending

GitHub Trending is fetched from the daily page and sorted by `stars today`, descending. An item with no daily-growth value is rejected.

A repository not seen in the last 14 days can enter normally. A repeated repository can return only when its current `stars today` exceeds the prior maximum by at least 20%, with a minimum absolute increase of 25 stars/day. Total-star accumulation alone does not qualify a repeated Trending entry.

GitHub Trending is T0. Summaries still describe the project, while ranking and repeat decisions use structured star metrics.

## Personal and organization GitHub feeds

Generic GitHub profiles no longer emit the most recently pushed repository each day. The adapter reads recent public events and recently created repositories, retaining new/public repositories and releases from the last 30 days. Pushes to an old repository are not treated as a new project.

If a repository has already appeared, it can return only after meaningful total-star growth: at least 20 stars for small projects, scaling to 1% and capped at 100 stars for large projects.

## Bilibili

RSSHub identifies new uploads. For each candidate, the pipeline reads Bilibili's public video metadata, publication time, creator description and available subtitle track. The LLM receives subtitle text or a sufficiently detailed creator description; it never receives only the title.

No subtitle plus an empty/very short description means the item is excluded. Videos older than 48 hours are excluded even if RSSHub returns them. Full subtitles are used transiently for summarization and removed before the public report sidecar is written.

`BILIBILI_COOKIE_0` or `BILIBILI_COOKIE` is optional for subtitle tracks that require login. Public descriptions and public subtitle tracks work without it. The existing RSSHub login remains independent.

## Disabled source

`smol-ai-news` is disabled. Its repository archive repeatedly returned old or placeholder newsletter issues and dominated the technical section.

## Verification

`npm run freshness:check` covers URL/title history, GitHub growth exceptions, Trending ranking, GitHub event selection and subtitle-backed Bilibili content. It uses synthetic fixtures and sends no messages.
