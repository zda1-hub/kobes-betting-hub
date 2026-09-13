# Public Beta Release Record — 2026-09-13

Owner and final production approver: Zakai Martin  
Release model: public beta, improved continuously while live  
Customer-experience requirement: checkout, Discord access, billing management, cancellation, and approved-pick publication must work before invitations open.

## Integrated release candidate

- Branch: `codex/public-beta-release`
- Release commit: `0a54485b82aab6a6d4b4bd1d31254dfde2d22c4e`
- Pick-system base: `3104e382d1e679afb363431261f8181436682c35`
- Membership candidate: `5420caeba9daaeba218b2a3be2f66f5b0832cd98`
- Verification: 169 tests passed, zero failed.
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

- [ ] Create and verify a fresh encrypted production logical backup; store its encryption key separately.
- [x] Confirm referral migrations 005 and 006 already appear in the production ledger.
- [ ] Apply only migrations 007, 008, and 009 with the locked migration runner.
- [ ] Verify RLS, revoked browser grants, service-role privileges, cancellation fields, and entitlement-block fields.
- [ ] Deploy the integrated Checkout Worker and record its Cloudflare version ID.
- [ ] Verify production health, bindings, secret names, allowed origins, Stripe live price, and Customer Portal configuration.
- [ ] Confirm the one-time 75%-off retention coupon is configured for production and can be redeemed only once per customer.
- [ ] Enable and record the `invoice.payment_failed` webhook only after the new Worker is healthy.
- [ ] Deploy the matching public membership/referral pages and run read-only production smoke checks.
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
- stronger webhook body-size enforcement when `Content-Length` is absent;
- marketing and referral promotion.

## Unaccepted risks

- Do not open paid invitations while production checkout, portal, or Discord entitlement behavior is unverified.
- Do not publish an approval card whose locked payload has changed.
- Do not use source text or media beyond the adopted source-rights policy. Monitoring and independent factual research may continue.
- Do not roll back the Checkout Worker without reconciling membership events created after the promoted schema became active.
