# October 8, 2026 — first-party engagement and join-page click map

## Request
Add prospective visitor time-on-site, bounce/quick-exit insight, and heatmapping so the owner can investigate the join-page funnel more deeply. Keep the existing public visual design and purchase flow.

## Affected files
- `analytics.js`: reports a bounded anonymous sample per public page load, including foreground time, max scroll depth, click count, and coarse 12×12 click cells on the join page. It excludes private portal routes and form/input clicks. No text or form value is collected.
- `cloudflare/kobes-checkout-worker.js`: validates and stores engagement samples in existing analytics events; reports aggregate engagement and mobile/desktop join-page click density in the authenticated admin dashboard. No migration or billing/access path changes.
- `admin-analytics.html`, `admin-analytics.js`, `admin-analytics.css`: add the private engagement metrics and click maps in the existing dashboard style.
- `privacy.html`: disclose the additional first-party usage measures.
- `scripts/prepare-public-site.mjs`: update the analytics asset version while retaining the public build whitelist.
- `cloudflare/kobes-checkout-worker.test.mjs`: validate aggregation, rejection of invalid samples, and private-field discard.

## Before and after
Before: first-party analytics reported sessions, sources, page views and checkout funnel events but no time or click-position measures. After: the dashboard displays measured visits, average foreground time, a clearly defined single-page rate, quick exits (one page, under 10 foreground seconds, no click), join-page time/scroll, and anonymous mobile/desktop join click maps. These measures begin at release; no historical time or heatmap data can be recovered. They are first-party approximations, not a third-party recording or standard GA bounce rate.

## Verification
Focused checkout-worker and public-build suites passed: 65 tests, 0 failures. The broader public-design suite passed 75 of 77 checks; two pre-existing navigation/full-record assertions expect `.html` links while the current public build rewrites them to canonical extensionless routes. A valid engagement payload was confirmed to write only bounded numeric/positional fields while an unexpected email field was discarded; invalid/private paths were rejected. Public build prepared 82 allowlisted entries.

## State and limitations
Local implementation awaiting GitHub merge and coordinated public-site and checkout-worker deployment. The click map is a coarse page-position grid, not session replay. Browser restrictions or early closes can omit samples; background time is excluded. Internal test browsing can still contaminate aggregate figures unless identified by existing reporting exclusions. No pricing, plan, Discord, Stripe or referral rules changed.

## Publication follow-up
PR [#183](https://github.com/zda1-hub/kobes-betting-hub/pull/183) merged into `main` as `25d72a43d9462951a00c45544ee612691edbd829`. The checkout Worker was deployed from this exact commit as version `566937fe-9e7a-47aa-8017-30a22a49a3e2`; the allowlisted public site bundle was deployed as version `07ba8f1b-f85e-4cee-8c70-49b65927d488`. The live `/join`, `/analytics.js`, and admin script returned HTTP 200, the private admin route contained the engagement section, and the new engagement endpoint rejected an invalid payload with HTTP 400 without recording a sample. The checkout Worker health endpoint reported the deployed version. A valid synthetic visitor sample was deliberately not sent to avoid contaminating the user's conversion figures. New engagement data will appear only after real visitors browse the updated site. State: published.
