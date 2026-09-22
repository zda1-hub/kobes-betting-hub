# Kobe's Betting Hub — growth audit

Audit date: 2026-09-21. Status below describes repository implementation, **not a production guarantee**. Production verification requires authenticated Stripe/Discord/Supabase checks and a controlled purchase test. See `GROWTH_STATE.md` for the working inventory and next action.

| Area | Status | Evidence and gap |
| --- | --- | --- |
| Production architecture | WORKING | GitHub Pages site built by `scripts/prepare-public-site.mjs` and `.github/workflows/deploy-pages.yml`; Cloudflare checkout, publisher and Instagram Workers; Render-hosted Discord bot; Supabase/Postgres migrations under `pipeline/migrations/`. Deployment state not independently verified here. |
| Stripe checkout and billing | WORKING / PARTIAL | `cloudflare/kobes-checkout-worker.js` has offer preparation, Stripe Checkout, signed webhooks, subscription and invoice handling, refunds/disputes, and event-ID persistence. End-to-end live payment was not run in this audit. |
| Discord VIP integration | WORKING / PARTIAL | Checkout Worker links a Discord identity, grants/removes roles, retries failed activation, and exposes paid-without-VIP alerts. Live payment-to-role and cancellation timing still need controlled verification. |
| Member referrals | WORKING / PARTIAL | `$10` reward flow, code ownership, fraud holds, payout status, member link UI and admin ledger exist (`refer.html`, migrations 005/006/010/014). Do not rebuild. Live qualifying payment/reward test remains. |
| Creator referrals | WORKING / PARTIAL | Creator profiles and unique codes exist in migration 014 and checkout Worker, with dashboard attribution. Needs a controlled creator-code purchase test; no bespoke system needed. |
| First-party attribution | PARTIAL | `analytics.js` saves first/last touches and UTMs; checkout association and Stripe metadata preserve IDs. This batch adds distinct TikTok and tagged Kobe-X classification locally. Browser `page_view` and join-page view exist, but no distinct free-Discord click event. |
| Growth dashboard | WORKING / PARTIAL | Authenticated `/admin/analytics` and `admin-analytics.js` include funnel, sources/campaigns, members, billing, retention, referrals, and access alerts. PR #22 paginates Supabase history and Stripe payments with visible safety-cap warnings; all-time aggregation at scale remains. No target-to-1,000 or experiments table. |
| Pick and results system | PARTIAL | Official `trackers/pick-log.csv` ledger, ESPN/manual grading, Free Pick results, and recap approvals exist. Local (not released) `/api/record` work aims to show all verified free/VIP picks. Historical completeness and production sync are unverified. Do not present selective proof as full record. |
| Email/notifications | WORKING / PARTIAL | Welcome outbox, Google Apps Script sender, recap notification queue and admin alerts exist. Delivery receipts and sender configuration require production check. |
| SEO | PARTIAL | Homepage and Free Pick have metadata; sitemap, robots and one substantive guide exist. Metadata/canonicals are inconsistent across secondary pages; performance and indexing have not been audited. |
| Reactivation segmentation | PARTIAL | Admin member filters include active, failed, awaiting Discord, VIP mismatch and cancellations. No verified Discord activity cohort or abandoned-checkout cohort. No mass-DM system should be built. |
| Experiment tracking | MISSING | Campaigns can be labeled with UTMs, but no lightweight hypothesis/date/exposure/outcome register exists. |
| Target tracker | MISSING | Dashboard displays active members but not required net-add pace to Dec 31 or milestone progress. |
| Duplicate / not needed | DUPLICATE / NOT NEEDED | Another payment processor, analytics vendor, referral engine, Discord bot, or broad site redesign. Extend current Worker/Supabase/UI instead. |

## Highest-impact confirmed measurement gap

TikTok acquisition traffic was recorded as `other` by both browser and Worker source normalizers. This hid a requested channel throughout acquisition and paid-source reporting. The local fix also tags the bot's X link as `kobe_x`, separating that owned account from generic X referrals. Next: release and verify those changes, then instrument a true free-Discord outbound click and show it distinctly from a join-page view, but only after identifying a real public Discord entry link and the desired destination.

## Constraints and known data-quality risks

- `analytics_sessions` and `analytics_events` are first-party; visitor identity is a random session UUID, not an email.
- Dashboard history is capped by query limits; do not label these as complete all-time figures at scale.
- A page view is **not** a Discord join. Current funnel labels must not imply otherwise.
- Existing local edits to results/posting and an untracked contract artifact predate this audit; preserve them.
