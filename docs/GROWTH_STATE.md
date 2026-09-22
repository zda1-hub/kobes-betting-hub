# Growth work state

## First-month-back offer (2026-09-22)

- Added a 30-day, Arizona-time public monthly offer: $19.99 for the first full month, then $32.99/month. The claim window is September 22 through October 21, 2026; server checkout rejects it after the window. No existing subscription is changed.
- The checkout Worker uses a verified Stripe `duration=once` $13 coupon against the existing $32.99 monthly Price, with no trial, and retains the existing Stripe → Discord onboarding. The coupon is created deterministically on the first eligible checkout if absent. Referral links retain their separate two-day offer and $10-reward rules.
- `pipeline/migrations/015_first_month_back_offer.sql` permits the new `first_month_back` checkout-association value. Applied successfully to production in Supabase SQL Editor on September 22; the migration allowlist pins its hash.
- Homepage, join, and membership page offer copy switch only during the claim window; FAQ and terms disclose first and renewal prices. Production is live. Staging site version `759554f2-5762-40b8-827a-8089467e214b` visibly exposes the $19.99 first month and $10/7-day offers. Checkout Worker version `a0231942-780b-4c4a-bda9-164758cdad1c` is deployed to staging from clean `origin/main`. Its Stripe test-mode checkout deterministically created/validated the one-time $13 coupon and visibly showed Sandbox, $19.99 due today, and $32.99/month starting next month. No test subscription was submitted and no staging Discord authorization or role change was made.

Updated: 2026-09-22 (America/Phoenix). Read this file first on future growth turns; use `GROWTH_AUDIT.md` for classification. Local tests do not certify the paid production funnel.

## Completed

- Mapped the existing Pages → Cloudflare checkout Worker → Stripe → Discord/Supabase path, first-party analytics, admin dashboard, member/creator referrals, pick ledger, and email systems.
- Created `docs/GROWTH_AUDIT.md` with working/partial/missing inventory.
- Added TikTok and tagged Kobe-X source normalization in `analytics.js` and the checkout Worker, with regression tests. The bot's Free Pick X link carries `utm_source=kobe_x`. This was coordinated and released in PR #24; exact UTM text remains available on the checkout association.
- Added an explicit dashboard warning when its session/event/billing query limits or Stripe payment page are reached. This prevents capped long-range figures from silently appearing complete; pagination/aggregation is still needed for truly complete all-time reporting.
- Released paginated dashboard reads across Supabase tables and Stripe invoices/charges with conservative safety caps and visible incompleteness warnings in PR #22. Checkout Worker version `acbbb9e8-9e51-47a4-a397-6fe2a3b2295a` and site Worker version `33aed0d3-eb09-40a7-81e2-5dc0465f0c4e` are live. The authenticated dashboard's data response still needs a live admin-session check.
- Released next-morning automatic official, writeup, and exclusive recap eligibility at `RECAP_MORNING_REVIEW_AT` (default 07:00 Arizona). Render deploy `dep-dap4mrjrjlhs73f8tas0` is live. Final delivery still waits for verified results and public Discord recaps still require Kobe approval. The next 07:00 cycle has not yet been observed.
- Verified 2026-09-22 production checkout `/health` (HTTP 200), website `/` and `/join` (HTTP 200), and admin API rejects unauthenticated requests (HTTP 401). Render bot deploy `dep-dap4phbrjlhs73f900u0` is live. This is not a completed paid-funnel test.
- Released a compact, responsive executive scoreboard to the existing authenticated admin dashboard: active paid, MRR, Arizona-day new paid/cancelled/net, and new paid in the last seven rolling days. Source UTM tags now remain intact through the site return path, while rollup sources distinguish TikTok and Kobe X. The bot's X link carries `utm_source=kobe_x`. PR #24 merged as `e750f7a`; checkout Worker version `d9df5a99-fc9a-4753-93e3-a4abe9e5ff1b`, site Worker version `e1f26632-ce33-476d-b567-5e8630156268`, Render bot deploy `dep-dap528e8bjmc73apt030`, and GitHub Pages are live. Public assets and unauthenticated API boundary were verified; the private scoreboard still needs a logged-in admin verification.
- The entire repository test suite passes in the isolated release worktree: 499/499. Site build and both Worker dry-runs pass. Stale Free Pick caption assertions were updated to match already-live professional/age-neutral copy.
- A lightweight 1,000-member target panel (remaining, seven-day net pace, required daily pace by Dec 31, and milestones) is live in the existing private dashboard after PR #25; site Worker version `9969af61-4ac8-4443-be95-170f2ddfd211`. It labels pace as a run-rate estimate. The HTML/JS assets were verified live, but a logged-in admin data response still needs checking.
- PR #27 fixed missing cancellation analytics at the existing Stripe subscription webhook, with a subscription-scoped dedupe key. Checkout Worker version `333d6064-8717-4a6c-8099-d0a66c398206` and site Worker version `d56f4d4c-b402-40e4-8958-9e6252e59188` are live. Admin now displays unavailable—not zero—for cancellation/net windows before a full tracked Arizona day. GitHub Pages and Render bot deploy `dep-dap59d0473hc73966qh0` are live. Read-only production smoke checks passed for checkout health, publisher health, current Free Pick API, public Free Pick page, and client asset.
- PR #29 aligned date-filtered Today/Yesterday and Today/Week/Month revenue with Phoenix day boundaries; checkout Worker version `d3ed88a6-3d74-4ef0-b6a4-597d1d2264b2` is live. Full suite passed 500/500 and read-only production smoke passed. No billing data was changed.
- Authenticated production dashboard verified September 22: 9 active paid, $296.91 MRR, 5 active monthly, 4 $10 intro, 5 failed payments, and 4 paid-without-VIP alerts. Counts are real production values; cancellation/net remain unavailable where clean tracked history does not exist.
- Applied staging migrations 010-015 and confirmed `membership_checkout_associations` exists. A staging two-day Stripe checkout can now be created, proving the prior missing-table blocker is fixed.
- Released Kobe's free-writeup preview and Expert Play Feedback formats in PR #35. Full suite passed 506/506; Render deploy `dep-dapdg7f40ujc73akdpig` is live and Kobe Bot logged in. Expert rankings use only linked verified results and the requested >61% yesterday, 2+ winning-day, >60% seven-day, and >54% all-time thresholds.

## In progress

- Finish the staging $19.99 Stripe-to-Discord lifecycle by submitting the already-verified Stripe Sandbox checkout and authorizing the designated staging Discord identity. The test-mode $13 one-time coupon and displayed $19.99/$32.99 billing are verified; the remaining payment submission and Discord authorization require an approved test identity. Production payment, refund, and role state were not mutated.
- `free-writeups` is currently private in Discord even though the new format is intended for free members. Changing `@everyone` visibility and creating/confirming the official invite requires an explicit Discord access-control confirmation.

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

1. Verify the logged-in scoreboard and tagged-visit checkout association; do not make a paid test purchase without an appropriate safe test mechanism.
   Staging currently cannot prepare checkout until its membership schema is installed.
2. Add a distinct, measurable free-Discord click only if there is an approved public join link; do not infer joins from page views.
3. At scale, replace the 20,000-row/2,000-payment safety caps with database aggregation; continue showing warnings whenever caps are reached.
4. Controlled Stripe → Discord VIP and member/creator referral purchases, cancellation, failed-payment and refund checks. Do not spend money without owner approval.
5. Lightweight experiment register, then remaining results-transparency and retention work. Do not expand the selective `/recaps` page into an implied full record.

## Known issues / release notes

- Local results and result-posting edits from earlier turns have not been released; do not report them as live.
- Free Pick posts in production still showed a 150-like CTA in the latest screenshot; local branch has a 10-like copy change not yet released.
- Dashboard uses `join_page_view`; this is not the same as Discord join or click.
- No public Free Discord invite URL was found in the site or environment example; adding a free-Discord click CTA requires an approved destination.
- The 2026-09-21 recap had 25 results pending before the morning window, so final delivery may wait beyond 07:00 until all are verified. The former stale Free Pick copy test failures are corrected in PR #24.
- Targeted SEO inspection found the live `/join` canonical pointed at `/join.html`, while the sitemap used `/join`. PR #26 aligned the canonical URLs and labeled `/recaps` as selective, not a full pick record; site Worker version `a6e8f1a4-30ae-4be7-a883-9932d9133f49` is live and verified. No fabricated results were introduced.
- Cancellation events were not collected historically. PR #27 starts idempotent collection going forward; older cancellations cannot be reconstructed reliably from that event stream. It changes no cancellation or VIP-role lifecycle logic.
- Staging schema is current through migration 015. The empty staging `STRIPE_FIRST_MONTH_COUPON` variable is not used by the released offer path: the Worker deterministically creates and validates test coupon `kbh_first_month_back_2026_09_22`. Stripe Sandbox visibly verified $19.99 due today and $32.99/month starting next month. The remaining lifecycle step is an approved test checkout submission plus staging Discord authorization.
- The authenticated dashboard response is verified. No live payment, refund, cancellation, or Discord role mutation was made. Cancellation counts before the new webhook event are not historically available and must not be reported as zero.
