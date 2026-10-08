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
