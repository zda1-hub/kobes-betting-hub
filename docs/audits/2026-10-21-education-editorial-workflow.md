# Source-led education workflow — October 21, 2026 MST

Requested: apply Eric Siu's source-led editorial workflow and Jake Ward's comparison-content principles, then improve the approach for KBH. New work is local and unpublished. Earlier deployment approvals do not approve this draft.

Affected files: `scripts/education-editorial.mjs`, its focused test file, and `docs/seo/` (40-topic queue, measurement log, README, review report and mean/median draft).

Before: 50-query research and the published responsible-gambling update existed; no deterministic editorial evidence report or this worked educational draft existed.

After: offline checks expose duplicate titles, shared destinations, missing coverage decisions, unknown demand, absent/stale sources and missing human review. All 40 candidates remain held. The draft uses an early comparison, original calculations, explicit limitations and primary references. The metric log leaves unknown measurements null and computes 7/14/28-day review dates from the October 20 release. No external service, paid bot or automatic publishing was added.

Verification: 8/8 focused Node tests passed. Generated report contains exactly 40 distinct query IDs, 25 support topics mapped to the existing page and 15 statistics topics requiring coverage review, with no publication-ready rows. Synthetic calculations checked independently: 40/5=8 and sorted middle=4; replacement example totals20/5=4. JSON parse and git whitespace checks passed. Draft opened in Codex for review.

Limits: no public page, styling, build whitelist, navigation or production code changed. No live ranking, new GSC export, demand volume, automated monitoring, indexing submission or backlink outreach is claimed. No public frontend was rendered because this is an editorial Markdown draft, not an implemented page. The 40 candidates reuse the existing 50-query research; they are not new searches. Exact-title matching does not detect all semantic overlap. Manual evidence review, attribution, coverage decision and an approved populated page preview remain necessary before release. Eric's post text and video chapters were reviewed, not the full video. Jake's quoted checklist was read in Arc. Source claims were checked against OpenStax, the Commons Library and Google Search Central.

Unrelated existing dirty audit JSON and preview artifacts were preserved. Work started from origin/main 9f6db7c on codex/education-editorial-workflow.

## Release follow-up — October 21, 2026

The user authorized deployment if quality met the standard. Converted the reviewed draft into education/mean-versus-median.html with the existing approved shared shell, scoped statistics.css, self canonical, WebPage/BreadcrumbList schema, source links, synthetic worked example and learning-hub backlink. Added discovery from guides/index.html, sitemap entry and explicit public whitelist. Content was reviewed by Codex against OpenStax and the Commons Library; no named human expert review or search-demand claim is made. Educational usefulness is the publication rationale despite unknown keyword volume; other candidate holds remain.

Rendered in Arc using same-origin 320/390/1440px frames: scrollWidth matched each viewport, header top was zero and checked article/control bounds did not overflow. Screenshots inspected; worked-example anchor exercised at320px. Full desktop inspected separately. Mobile contents links initially hidden by inherited nav styling; changed to a labelled navigation div. Comparison first column widened after mobile review. Eight focused tests passed; built local assets, canonical/schema/sitemap and whitelist exclusion checks passed. Internal drafts, queue and fixture are excluded from public assets. Release pending live verification.
