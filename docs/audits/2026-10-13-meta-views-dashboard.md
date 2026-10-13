# Meta website page views and sessions — October 13, 2026

Requested: show regular Meta website traffic alongside the existing 30-minute sessions.

Before: dashboard only exposed consented sessions by source; repeated same-page loads shared a 30-minute dedupe bucket. No Meta Ads Manager API connection exists.

After: add three separate Meta cards: ad link clicks (explicitly unavailable until connected), recorded website page views, and website sessions. Add page views to every source row and overview metrics. All values follow the selected MST dates. Session first-touch attribution and tracking consent remain in force. Repeated future page loads retain distinct receipt IDs; retries retain the same receipt. Inline membership openings, engagement samples and CTA records are excluded from page-load totals. Earlier repeat loads cannot be backfilled.

Files: admin-analytics.html/.css/.js, analytics.js, cloudflare/kobes-checkout-worker.js, focused tests and scripts/prepare-public-site.mjs. Existing design and unrelated changes preserved.

Verification: 92 focused attribution/worker/campaign tests and four public-build tests passed. Populated read-only preview rendered at 320, 390 and 1280 pixels; document width matched viewport. Meta metric cards and source table reviewed; seven-day fixture filter changed page views from 19 to 87. No browser console errors. Screenshot: evidence/2026-10-13-meta-views/dashboard.png. Fixture values are illustrative, not production traffic. Existing palette and component geometry preserved; scoped mobile cards stack to keep unavailable labels inside padding.

Limit: actual Meta ad clicks require an Ads Manager export or authorized API connection; no data invented. Production authenticated totals remain to be verified. Release status: locally verified; deployment receipts will be appended.
