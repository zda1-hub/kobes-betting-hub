# Growth work state

Updated: 2026-09-22 (America/Phoenix). Read this file first on future growth turns; use `GROWTH_AUDIT.md` for classification. This is a repository audit, not a certification of production.

## Completed

- Mapped the existing Pages → Cloudflare checkout Worker → Stripe → Discord/Supabase path, first-party analytics, admin dashboard, member/creator referrals, pick ledger, and email systems.
- Created `docs/GROWTH_AUDIT.md` with working/partial/missing inventory.
- Added TikTok and tagged Kobe-X source normalization locally in `analytics.js` and `cloudflare/kobes-checkout-worker.js`, with browser and Worker regression tests. The bot's Free Pick X link locally carries `utm_source=kobe_x`. This attribution work is **not** part of the 2026-09-22 production release; it still needs a coordinated Pages/site, checkout Worker, and bot release.
- Added an explicit dashboard warning when its session/event/billing query limits or Stripe payment page are reached. This prevents capped long-range figures from silently appearing complete; pagination/aggregation is still needed for truly complete all-time reporting.
- Released paginated dashboard reads across Supabase tables and Stripe invoices/charges with conservative safety caps and visible incompleteness warnings in PR #22. Checkout Worker version `acbbb9e8-9e51-47a4-a397-6fe2a3b2295a` and site Worker version `33aed0d3-eb09-40a7-81e2-5dc0465f0c4e` are live. The authenticated dashboard's data response still needs a live admin-session check.
- Released next-morning automatic official, writeup, and exclusive recap eligibility at `RECAP_MORNING_REVIEW_AT` (default 07:00 Arizona). Render deploy `dep-dap4mrjrjlhs73f8tas0` is live. Final delivery still waits for verified results and public Discord recaps still require Kobe approval. The next 07:00 cycle has not yet been observed.

## In progress

- Validate real `utm_source=tiktok` and `utm_source=kobe_x` visits and checkout association after the coordinated release; do not make a paid test purchase without approval.

## Architecture and relevant files

- Site: `index.html`, `join.html`, `membership.js`, `analytics.js`; build/injection `scripts/prepare-public-site.mjs`; deploy `.github/workflows/deploy-pages.yml`.
- Checkout, webhooks, attribution, access, referrals, admin API: `cloudflare/kobes-checkout-worker.js`; schema `pipeline/migrations/002*`, `005*`, `006*`, `010*`, `012*`, `013*`, `014*`.
- Admin: `admin-analytics.html`, `admin-analytics.js` (`/admin/analytics`).
- Member referral/creator: `refer.html`, `referral.js`, `creator.html`; unique code ownership in checkout Worker.
- Bot/results: `bot/index.js`, `bot/lib/pick-log.js`, `bot/lib/free-pick-results.js`, `bot/lib/free-pick-x.js`, `bot/lib/recap-approvals.js`; publisher `cloudflare/bettinghub-publisher.js`.
- Email: `cloudflare/member-welcome-email.gs`, publisher recap queue, checkout Worker welcome outbox.

## Environment and data

- Public site origin `kobesbettinghub.com`; production checkout Worker `kobes-betting-hub-checkout.kobedirwin.workers.dev`.
- Existing secrets/bindings include Stripe, Discord OAuth/bot, Supabase service role, and Worker publisher credentials. Do not copy values into docs. See `.env.example` and Wrangler configs for variable names.
- First-party tables: `analytics_sessions`, `analytics_events`, `membership_checkout_associations`, `membership_subscriptions`, `membership_billing_events`, `stripe_webhook_events`, referral/creator profiles and rewards.
- No migration required for adding `tiktok` or `kobe_x`: attribution sources are text fields. Existing analytics history cannot reliably be retroactively separated from `other` or generic `x`.

## Remaining, ordered

1. Release the Pages asset, checkout Worker, and bot X-link change together, then verify TikTok and Kobe-X UTM → checkout association in production using non-purchase test visits.
2. Add a distinct, measurable free-Discord click only if there is an approved public join link; do not infer joins from page views.
3. At scale, replace the 20,000-row/2,000-payment safety caps with database aggregation; continue showing warnings whenever caps are reached.
4. Controlled Stripe → Discord VIP and member/creator referral purchases, cancellation, failed-payment and refund checks. Do not spend money without owner approval.
5. Target tracker and lightweight experiment register, then secondary SEO/conversion/retention work.

## Known issues / release notes

- Local results and result-posting edits from earlier turns have not been released; do not report them as live.
- Free Pick posts in production still showed a 150-like CTA in the latest screenshot; local branch has a 10-like copy change not yet released.
- Dashboard uses `join_page_view`; this is not the same as Discord join or click.
- No public Free Discord invite URL was found in the site or environment example; adding a free-Discord click CTA requires an approved destination.
- The existing full test suite has Free Pick copy-assertion failures unrelated to PR #22; focused dashboard/recap tests passed (43/43). The 2026-09-21 recap had 25 results still pending before the morning window, so a final recap may wait beyond 07:00 until all are verified.
