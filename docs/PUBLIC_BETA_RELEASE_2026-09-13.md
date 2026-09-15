# Public Beta Release Record — 2026-09-13

Owner and final production approver: Zakai Martin  
Release model: public beta, improved continuously while live  
Customer-experience requirement: checkout, Discord access, billing management, cancellation, and approved-pick publication must work before invitations open.
Public operator identity approved by owner: Kobe Irwin, operating as Kobe's Betting Hub

Governing jurisdiction approved by owner: California

## Integrated release candidate

- Branch: `codex/public-beta-release`
- Release commit: `3bd9945976758eb8efc287779a3bf2b5ffce7e01`
- Pick-system base: `3104e382d1e679afb363431261f8181436682c35`
- Membership candidate: `5420caeba9daaeba218b2a3be2f66f5b0832cd98`
- Verification: 172 tests passed, zero failed after the production retention and webhook-size hardening update.
- Production-site build: 35 public entries prepared successfully.
- The release branch contains the hardened Checkout Worker, production migration runner, migrations 007–009, recurring-billing disclosures, cancellation/retention behavior, billing-exception entitlement blocks, referral assets, and the current pick workflow.

## Production work already verified

- Render pick worker deployed commit `04f4783a4900cb042e894a51f2bbcf90bb6c68a0` as deployment `dep-dajgc7ojo6nc73dovq1g` and reported live.
- Pending player-prop approval cards were refreshed in Discord at 13:23 MST with four evidence bullets and active Free/Paid/Reject controls.
- The approval and publication payload is locked by SHA-256; a changed packet requires fresh approval and publishes nothing.
- Original-post facts remain first. Deterministic ESPN research fills only missing evidence slots. Source/provider URLs remain audit metadata and are not placed in member-facing copy.
- Generic season hype is no longer accepted as evidence in commit `3104e382d1e679afb363431261f8181436682c35`; the complete pick suite passed 135 tests.
- Render uses a 1 GB persistent disk mounted at `/var/data`; `PICK_LOG_PATH` is `/var/data/pick-log.csv`, and the X review queue is durable under `/var/data/x-review-queue`.
- Cloudflare Email Routing is enabled for `kobesbettinghub.com`.
- `support@kobesbettinghub.com` is active and forwards to the verified destination `themartinventures@gmail.com`.
- The production migration ledger was checked read-only on 2026-09-13 and contains referral migrations `005_referral_cash_rewards` and `006_referral_reward_ten_dollars`.
- The production Supabase project is on the free plan and explicitly reports that provider-managed project backups are unavailable. An encrypted logical dump is therefore required immediately before migrations 007–009.
- Backup preparation confirmed the production IPv4 session-pooler target without exposing or rotating the database password. The guarded GitHub Actions job used the existing masked credentials and streamed the dump directly into encryption.
- The GitHub repository already contains masked `DATABASE_URL` and `PRODUCTION_BACKUP_KEY` Actions secrets. The guarded `encrypted-backup` operation in `.github/workflows/sync-openai-usage.yml` can therefore create and verify the logical dump without exposing or rotating the database password. Its encrypted artifact is retained in GitHub Actions for three days so it can be downloaded into owner-controlled storage before expiration.
- Encrypted production backup run `34783539955` completed successfully from release commit `e267fbb4cf704ced77c30901423388b6125cca47`. The PostgreSQL 17.11 custom-format dump was encrypted with AES-256-CBC/PBKDF2 at 200,000 iterations, decrypted in-stream for `pg_restore --list` verification, and uploaded as a private three-day GitHub artifact. It was downloaded to owner-controlled local storage under `/Users/z/Library/Application Support/KobesBettingHub/backups/github-run-34783539955`; its manifest and local SHA-256 both equal `265130003678b5641b3f38e567c1aa576f17ec0f2d2e3fe3aa6736edc769dbb7`.
- Production migration run `34783634199` completed successfully. The locked runner applied only `007_service_role_rest_access.sql`, `008_subscription_cancellation_fields.sql`, and `009_membership_entitlement_blocks.sql`, then verified the production ledger, RLS/browser grant restrictions, service-role access, cancellation fields, and entitlement-block fields.
- The live Stripe account has Customer Portal cancellation enabled. Live coupon `kEPvsD5Y` is active, applies 75% off once, and is reserved as the retention-offer template; the Worker creates a customer-specific coupon capped to one redemption before presenting the offer.
- Cloudflare Checkout Worker version `00cdf542-4592-4204-b0b2-ab5c6b2e536c` deployed successfully from release commit `3bd9945976758eb8efc287779a3bf2b5ffce7e01`. Health returned that exact version; all seven secret names remained installed; production CORS, Discord portal redirect, invalid-checkout rejection, legacy-cancellation rejection, bad-signature rejection, and headerless oversized-webhook rejection passed.
- Cloudflare site version `9a0f5b1b-edf8-46c2-b91c-ffa0b83b2bf2` deployed successfully. `kobesbettinghub.com` serves the production membership Worker origin, effective Terms/Privacy pages, and 75%-retention disclosure. The five-endpoint read-only production smoke suite passed.
- At 15:20 MST, the manage-membership page was rebuilt on the release branch with the shared ticker/header/navigation, a bounded two-column desktop grid, a branded Stripe-portal card, mobile spacing, and responsive rules for 800 px and 390 px breakpoints. The authenticated Discord-to-Stripe portal behavior and billing language were unchanged. A 390×844 live visual check confirmed no horizontal overflow, and the release-branch suite passed `174/174`.
- Static-site version `11e5ff70-15fc-48ff-82a6-d85464ebff65` was immediately superseded after deployment inspection showed that it had been built from an older audit worktree and could replace newer support/Terms assets. Corrected version `59485719-9cab-42eb-bf90-1074c21f0156` was rebuilt from this frozen public-beta release branch and deployed. Live verification confirmed the responsive stylesheet, effective 2026-09-13 Terms, support alias, absence of draft markers, and `5/5` production smoke. No billing, customer, Discord, Supabase, or Stripe state changed.
- Stripe live event destination `we_1U7p1cE6p9BmPii3meFaIjH4` is active and listens to eight events. `invoice.payment_failed` was added after Checkout Worker health verification; future failed-payment deliveries are signature-verified, persisted to the production audit trail, and reconciled with membership access.
- At 15:16 Arizona, two live Discord approval clicks were acknowledged and loaded their packets in under 300 ms but produced no event-verification, publication, failure, or completion log. The approved hotfix prevents a successful ESPN response's audit-write failure from being retried as a second `NETWORK_ERROR` write, uses one current-day scoreboard request before querying later dates, adds an overall 25-second verification bound, logs the exact transition into event verification, and bounds the pause-file read to two seconds. Commit `6989dd1b346508728dea43b3` was deployed automatically to Render as deployment `dep-dajifs7qj5pc73b9j7pg`; Render reported it `Live` after 30.0 seconds. Startup logs show command registration, login as Kobe Bot, refresh of three pending locked-format cards, and the expected daily X-monitor cutoff. The exact production-base suite passed `125/125`, the integrated release suite passed `177/177`, and the post-deploy public read-only smoke suite passed `5/5`. No pick was published as part of this deployment.
- The 14:05 Gmail message titled `Kobe's Betting Hub — Daily Picks — 2026-09-13` was not sent by the Render recap path: Render repeatedly logged that zero published picks caused no recap email. It came from the installed Apps Script `sendDailyPackage` trigger, whose stale source still generated an empty message. At 15:50 Arizona, the installed source was updated and saved with an immediate zero-pick return before subject/body construction, preserving the once-daily approved-picks email while making zero-pick days silent. The separate `deliverKobeRecapNotifications` five-minute trigger, which had a 63.33% displayed error rate and repeated `401 Unauthorized` responses, was permanently deleted after owner approval. The Triggers page then showed two remaining triggers: the useful `sendDailyPackage` trigger at 0% error and the already-disabled setup helper `createDailyTrigger`. No email was sent during this remediation.
- The formerly Google-only daily email implementation is now versioned at `cloudflare/kobe-daily-picks-email.gs`. Four source-invariant tests require the zero-pick email and X-queue guards to run before any outbound call, reject embedded credentials/database URLs, and keep recap polling bound to its dedicated property while trigger-disabled. Three additional tests prove exact image-byte multipart publication, text fallback after media failure, and fail-closed Free Pick credentials. The complete release suite now passes `188/188`. Future Apps Script changes must be made in this source and reconciled to the installed project rather than edited invisibly.
- Cloudflare Publisher staging is isolated from production as Worker `bettinghub-publisher-staging`, D1 `bettinghub-publisher-staging`, and KV `bettinghub-publisher-staging-free-pick`, with no cron, X connection, recap recipient, Discord delivery, or production storage binding. Version `8c2bb6df-d13c-47f7-8f28-06eec7225b16` reports ready. The final image acceptance rejected an unauthorized publish with `401`, accepted an authorized fixture with `201`, returned its metadata with `200`, returned the identical 68-byte PNG with `200 image/png` and SHA-256 `431ced6916a2a21a156e38701afe55bbd7f88969fbbfc56d7fe099d47f265460`, and reported `xConnected=false` / `xPosted=false`. The exact image and current-state KV keys were then deleted; `/api/free-pick/current` returned `404`. No production Free Pick, Discord, X, email, customer, or membership state changed.
- Checkout Worker `ff778d91-c34c-4b49-92c9-dfa02785fa37` adds Cloudflare's per-location checkout limiter at 10 attempts per 60 seconds over a hash of network/client hints. Staging version `88319942-ddae-4028-983a-e02ce707acb6` returned `429` with `Retry-After: 60` during a paced invalid-payload run; no request reached Stripe. Production deployment preserved all seven secret names and the daily reconciliation cron, and the post-deploy public smoke passed `5/5`.
- `.github/workflows/membership-operations-alert.yml` and `scripts/check-membership-operations.mjs` define a private, read-only two-hour owner alarm for paid-but-unlinked memberships, reconciliation failures, failed/stuck Stripe webhooks, and stale reconciliation. The query is locked to encrypted production Supabase and returns only aggregate counts/timestamps. Three tests cover the project guard, all alert classes, read-only transaction, and identifier-free output. Activation and the first live read remain tied to promotion onto the default branch.
- Stripe remains the payment/subscription authority. Discord OAuth identifies the member; Discord is not a payment method. Supabase persists the Stripe-to-Discord mapping and event/audit trail.

## Public-beta decision

This release will use a public beta rather than a closed cohort. There is no mandatory multi-day wait after acceptance passes. Invitations may open to any interested member, while operational improvements continue behind the scenes.

### PUBLIC BETA GO — 2026-09-14 21:51 MST

The production acceptance lifecycle passed. Kobe used the production portal to schedule one live `$32.99/month` membership to end on September 30 at 08:38 while access remains active through the paid period, no further invoice is scheduled, and the second live membership remains unchanged. Stripe delivered the signed subscription update to the Checkout Worker with `200`. Production Supabase reports one scheduled cancellation, two currently active subscriptions, zero scheduled-cancellation entitlement blocks, and one processed live subscription webhook whose role outcome is `ROLE_GRANTED`. Private membership identifiers are intentionally omitted here.

GitHub Actions run `34930217840` passed immediately afterward with zero active memberships missing Discord, zero reconciliation failures, zero failed or stuck webhooks, and a fresh reconciliation timestamp. The fresh Travis Kelce Free Pick also passed the Discord approval/publication acceptance. Render reports commit `5ddf951` live, the release suite passed `211/211`, and the public read-only smoke suite passed `5/5`.

Organic public-beta invitations are approved. The operator must reconcile the first five paid signups individually and stop new invitations on any charge-without-access, access-without-payment, duplicate-subscription, or billing-portal failure. Paid advertising and referral promotion remain deferred until the first operating day closes cleanly. The scheduled September 30 terminal cancellation and Discord role removal remain a monitored post-launch acceptance item.

The public-beta label does not waive the customer-facing acceptance gate. Before invitations open, production must demonstrate the live path through cancellation scheduling, while the isolated Stripe-clock environment demonstrates the later terminal event:

1. recurring Checkout succeeds at the advertised price and cadence;
2. the correct Discord identity is linked and the paid role is granted;
3. the billing portal opens for that same member;
4. cancellation is scheduled without an unauthorized refund;
5. live access remains through the paid period; isolated time advancement proves removal at entitlement end, with the real September 30 event retained as post-launch acceptance;
6. Stripe, Supabase, Discord, and the API audit trail agree.

## Final production promotion checklist

- [x] Create and verify a fresh encrypted production logical backup; store its encryption key separately.
- [x] Confirm referral migrations 005 and 006 already appear in the production ledger.
- [x] Apply only migrations 007, 008, and 009 with the locked migration runner.
- [x] Verify RLS, revoked browser grants, service-role privileges, cancellation fields, and entitlement-block fields.
- [x] Deploy the integrated Checkout Worker and record its Cloudflare version ID.
- [x] Verify production health, bindings, secret names, allowed origins, Stripe live price, and Customer Portal configuration.
- [x] Confirm the one-time 75%-off retention coupon is configured for production and can be redeemed only once per customer.
- [x] Enable and record the `invoice.payment_failed` webhook only after the new Worker is healthy.
- [x] Deploy the matching public membership/referral pages and run read-only production smoke checks.
- [x] Publish effective Terms and Privacy pages identifying Kobe Irwin, California, `support@kobesbettinghub.com`, the public-beta status, recurring billing, cancellation, refund exceptions, and payment-dispute access behavior.
- [x] Deploy the bounded Discord approval-verification hotfix to Render and pass the post-deploy `5/5` read-only production smoke suite.
- [x] Suppress zero-pick Apps Script emails and remove only the failing five-minute recap trigger.
- [x] Complete live acceptance through cancellation scheduling and paid-through access on the intended account; rely on the completed isolated terminal proof while monitoring the real September 30 entitlement-end event.
- [x] Reconcile the live cancellation event with Stripe, Supabase, and Discord; the first five new public-beta signups remain individually monitored operating work.
- [x] Record the public-beta GO time, production versions, operator, monitoring rules, and rollback references.

## Accepted operational follow-ups

These can be improved during public beta without blocking invitations once acceptance passes:

- external alerts for reconciliation and role failures;
- a backup operator;
- broader team/game evidence enrichment for non-player sides and totals;
- an explicit payment-recovered membership event;
- support-ticket automation and published support hours;
- marketing and referral promotion.

## Unaccepted risks

- Do not open paid invitations while production checkout, portal, or Discord entitlement behavior is unverified.
- Do not publish an approval card whose locked payload has changed.
- Do not use source text or media beyond the adopted source-rights policy. Monitoring and independent factual research may continue.
- Do not roll back the Checkout Worker without reconciling membership events created after the promoted schema became active.
