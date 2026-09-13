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
- Stripe remains the payment/subscription authority. Discord OAuth identifies the member; Discord is not a payment method. Supabase persists the Stripe-to-Discord mapping and event/audit trail.

## Public-beta decision

This release will use a public beta rather than a closed cohort. There is no mandatory multi-day wait after acceptance passes. Invitations may open to any interested member, while operational improvements continue behind the scenes.

The public-beta label does not waive the customer-facing acceptance gate. Before invitations open, one production account must demonstrate:

1. recurring Checkout succeeds at the advertised price and cadence;
2. the correct Discord identity is linked and the paid role is granted;
3. the billing portal opens for that same member;
4. cancellation is scheduled without an unauthorized refund;
5. access remains through the paid period and is removed at entitlement end;
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
- [ ] Run the single production acceptance lifecycle above; do not use an unrelated real customer.
- [ ] Reconcile every Stripe event received during promotion with Supabase and Discord.
- [ ] Record the public-beta GO time, exact versions, operator, monitoring window, and rollback reference.

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
