# Education editorial workflow

Local review package, October 21, 2026 MST. Nothing in this package publishes, sends messages, purchases tools, calls AI services or requests indexing.

## What was adapted

[Eric Siu's post](https://x.com/ericosiu/status/2112970212190691692): source-led planning, duplicate review, human editing and measurement after publication. His post text was read; the attached video was not watched in full. No Grok/Jev/WP bot was installed.

[Jake Ward's post](https://x.com/jakezward/status/2112901970553885078) and its [quoted checklist](https://x.com/jakezward/status/2112878315308540076): concise answers, an early comparison table, reproducible examples, fair limitations, sources and maintenance. His reported client revenue is unverified and is not a KBH projection. This package applies those editorial principles to neutral education rather than creating betting-service acquisition or competitor-alternatives pages.

## Find → check → draft → review → measure

1. Review the 40 candidate topics in `editorial-topics.json`. They are drawn from the existing 50-query audit, not 40 new searches. Each row keeps its original query number and observed sources. Observed results do not prove demand, ranking position or source accuracy.
2. Review current coverage. The 25 risk/support rows point to the existing responsible-gambling page and require consolidation; the 15 statistics rows require a coverage decision. Do not create one page per keyword.
3. Record verified sources with `url`, `checkedOn` and `supports`. Observed search snippets are not verified sources. Recheck changing claims even inside the validator's default 90-day review interval.
4. Confirm demand with a dated evidence reference (such as a query-level Search Console export). Unknown volume stays unknown. An editor can also decide a topic is useful on its merits; document that separately instead of fabricating demand.
5. Draft, verify calculations and claim support, assign reviewer/date, then request the owner's visible-preview approval. The validator is advisory and cannot verify that evidence is truthful or that writing is high quality. Its exact normalized-title and shared-destination checks are not semantic duplicate detection.
6. Before public release, fit the approved KBH page template, verify internal links, canonical, title, description, crawlability, structured data matching visible content, and rendered 320/390/desktop layouts. Add the page to the explicit public whitelist and sitemap only after review. This package has not performed those publication checks for the draft.
7. Measure the page after actual publication. Use page/query/country/device filters and equal-length windows. Save export evidence, dates, impressions, clicks, CTR and position; separate branded from nonbranded queries. Treat small samples and reporting lag cautiously. Compare useful reading/support actions if measured, without inventing tracking events.
8. Update weak sections when real queries show a mismatch. Combine overlapping pages; do not rewrite titles simply because a single day's position changed. Reuse a winning explanation only after evidence and editorial review. No scheduled monitoring is enabled.

## Run the offline checks

`node --test scripts/education-editorial.test.mjs`

`node scripts/education-editorial.mjs 2026-10-21`

Pass a deliberate review date, rather than silently depending on the machine timezone. The report lists holds and measurement due dates. A green row means ready for publication review, not approved or deployed.

## Review now

Read `drafts/mean-versus-median.md`. Its comparison, calculations, boundaries and sources demonstrate the new format. Demand for this page remains unverified; it is a draft, not a ready-to-publish recommendation.

The existing responsible-gambling release has measurement checkpoints on October 27, November 3 and November 17, 2026. Metrics remain null until observed. Those dates are a plan, not reminders or automation.

Google says its normal SEO practices also apply to AI search features; no special AI markup is required: https://developers.google.com/search/docs/appearance/ai-features . Neither these checks nor the referenced posts guarantee ranking or indexing.
