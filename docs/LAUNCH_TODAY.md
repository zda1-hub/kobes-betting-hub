# Kobe's Betting Hub — Current Public-Beta Launch Checklist

Status time: 2026-09-13 17:01 Arizona

Technical/billing/support owner and final production approver: Zakai Martin

Pick approver: Kobe

Release type: public beta with monitored improvement while live

`PROJECT_CONTROL.md` is the authoritative project brain. This page is the short operating list. Update both when a gate changes.

## Completed production gates

- [x] Production website, Checkout health, Publisher health, current Free Pick API, public Free Pick page, and client asset pass the read-only `5/5` smoke suite.
- [x] Stripe is the payment/subscription authority; Discord OAuth identifies the linked member; Supabase persists subscriptions, webhook events, entitlements, and API audit rows.
- [x] Customer Portal billing/cancellation is live through Discord authentication.
- [x] Production migrations through `009` and Checkout Worker `00cdf542-4592-4204-b0b2-ab5c6b2e536c` are live.
- [x] Failed-payment suspension/recovery, dispute/refund blocks, daily entitlement reconciliation, and the one-time 75%-off retention mechanism are deployed.
- [x] The isolated Stripe clock proved `$8.25` once, return to `$32.99`, terminal cancellation, Supabase canceled state, and Discord role removal.
- [x] Effective Terms, Privacy, cancellation, no-refund exceptions, retention, dispute-access, and public-beta disclosures are live under Kobe Irwin operating publicly as Kobe's Betting Hub in California.
- [x] `support@kobesbettinghub.com` forwards to the technical/billing owner.
- [x] Discord approval hotfix `6989dd1` is live on Render; startup was healthy and refreshed three pending locked-format cards.
- [x] Daily zero-pick email is silent. The broken five-minute Apps Script trigger is deleted; the useful daily trigger remains at 0% displayed error.
- [x] The daily Apps Script source is versioned and protected by four source-invariant tests.
- [x] Image-backed Free Pick transport is covered locally for exact bytes, single multipart publication, text fallback, and missing-credential failure. The full release suite passes `192/192`.
- [x] Isolated image-backed Free Pick acceptance passed on a dedicated staging Worker/storage pair: authorized `201`, unauthorized `401`, exact 68-byte PNG retrieval, X disconnected/not called, and fixture cleanup verified by `404`.
- [x] Server-side checkout abuse protection is live in Worker `ff778d91-c34c-4b49-92c9-dfa02785fa37`; staging returned `429`/`Retry-After: 60` before Stripe and production retained its seven secrets, reconciliation cron, health, and `5/5` smoke.
- [x] Luna, durable X cursor/dedupe, two-new-model-calls-per-run cap, and daily/monthly OpenAI hard stops are live.
- [x] X-source publication remains disabled; all monitored candidates require private human approval.
- [x] The private production membership alarm is active on GitHub Actions and correctly detects paid-without-access and unresolved reconciliation failures without emitting member identifiers.
- [x] Stripe-first reconciliation imported both legacy live subscriptions into production Supabase and recovered their Stripe-stored Discord identity mappings.
- [x] The Render restart regression is fixed: the referral constraint migration is repeat-safe, and the latest production instance registered commands, logged in, refreshed three pending cards, and entered the normal grading/recap loop.
- [ ] Enable `Manage Roles` on the production Kobe Bot server role, rerun the controlled reconciliation, and require two successful role grants plus a clean operations alarm. Current Discord response is `403`; no billing action is involved.

## Three gates before public-beta invitations

1. **Live cancellation acceptance — waiting on Kobe**
   - [ ] Kobe completes cancellation through `kobesbettinghub.com/cancel` for the intended membership.
   - [ ] Zakai reports completion; the operator does not cancel or alter another subscription.

2. **Read-only membership reconciliation — ready immediately afterward**
   - [ ] Identify which of the two observed live `$32.99/month` subscriptions changed.
   - [ ] Verify Stripe cancellation scheduling and paid-through date.
   - [ ] Verify matching Supabase customer/subscription/webhook/audit rows.
   - [ ] Verify Discord access remains until entitlement end, with no refund.
   - [ ] Preserve identifiers/timestamps in the release record; never copy secrets or card data.

3. **Fresh real pick acceptance**
   - [ ] Kobe approves one current real pick he actually wants published.
   - [ ] Confirm the interaction produces a clear terminal response rather than disappearing after “thinking.”
   - [ ] Confirm approved content exactly matches locked terms/evidence and the intended Discord destination.
   - [ ] Confirm the canonical pick log and API audit event contain the same Pick ID and publication result.

When all three sections pass, Zakai records `PUBLIC BETA GO` with timestamp, production versions, operator, monitoring window, and rollback references.

## Pick timing

- The automatic X window ended at 15:00 Arizona today.
- Render logged that monitoring resumes at 10:00 Arizona on 2026-09-14.
- Three existing pending cards were refreshed at startup, but event-time verification may block a card whose game has started or finished.
- Do not manually publish a test pick. Use tomorrow's first legitimate selection unless Zakai separately authorizes an isolated non-public Discord test.

## First public-beta operating routine

- Run the `5/5` smoke suite immediately before invitations.
- Start with the first interested supporters; do not run paid marketing yet.
- For every checkout, reconcile one Stripe customer/subscription, one Supabase membership, and one Discord identity/role.
- Stop new invitations if anyone is charged without access, receives access without eligible payment, receives a duplicate subscription, or cannot reach cancellation.
- Watch Stripe webhook failures, membership reconciliation events, Render bot health, approval latency, OpenAI request caps, and support during the first hour.
- At the daily close, reconcile every new member and every official pick rather than sampling.

## Non-blocking work during public beta

- [ ] Monitor Kobe's later production entitlement-end event and confirm role removal.
- [x] Activate the implemented private GitHub owner alarm on the default branch and run its first production read-only check. It covers paid-without-access, unresolved reconciliation failures, failed/stuck webhooks, and stale reconciliation without exposing identifiers.
- [ ] Publish support hours and a response target; support remains manually operated until then.
- [x] Run one isolated staging image-backed Free Pick and verify the retrieved media before relying on that path; evidence and cleanup are recorded in `docs/STAGING_IMAGE_FREE_PICK_AUDIT_2026-09-13.md`.
- [ ] Complete approved-pick recap email and Trends intake/approval acceptance.
- [x] Add server-side checkout abuse protection before broad public marketing.
- [ ] Close remaining Apps Script and Discord pre-response API-audit gaps.
- [ ] Expand deterministic ESPN grading coverage; unsupported markets remain manual.
- [ ] Build the operator dashboard and add marketing only after the public-beta mechanics are stable.

## Current owner decisions still open

- Support hours/timezone and response target.
- Backup technical/billing operator and legal/compliance reviewer.
- Age/location restrictions and records-retention periods.
- X, Cloudflare, Render, and total-infrastructure budget alert/stop thresholds.
- Official production account inventory using identifiers only—never secrets.
