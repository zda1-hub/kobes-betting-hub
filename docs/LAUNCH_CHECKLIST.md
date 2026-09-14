# Kobe's Betting Hub — Current Public-Beta Launch Checklist

**Status date:** 2026-09-13

**Authority:** `PROJECT_CONTROL.md` remains the project source of truth.

**Final production approver / technical and support owner:** Zakai Martin

**Business and pick approver:** Kobe

This checklist replaces the obsolete early-build checklist. A box is complete only when production or isolated staging evidence proves the business outcome.

## Verified and live

- [x] Public website, Checkout Worker, Publisher Worker, Free Pick API/page, and client asset pass the five-check production smoke suite.
- [x] Stripe is the subscription authority; Discord OAuth identifies the linked member; Supabase stores normalized membership and audit state.
- [x] Production migrations through `009` are live, including cancellation fields, service-role access, and refund/dispute entitlement blocks.
- [x] The paid-member bot role has `Manage Roles`, is above the paid role, and production reconciliation successfully granted both observed eligible roles.
- [x] Checkout is idempotent and rate limited before Stripe; signed webhooks handle subscription, invoice-payment-failure, refund, and dispute events.
- [x] Stripe Customer Portal provides payment-method, invoice, and cancellation management.
- [x] Isolated test-clock evidence proves role grant, one-time 75%-off retention, return to `$32.99`, terminal cancellation, Supabase cancellation, and Discord role removal.
- [x] The live starter offer uses `$10` once for the first seven days, followed by `$32.99/month`. The correct one-time price is the product default; the mistaken `$10/week` price is archived and had zero active subscriptions.
- [x] The alternate offer is two days free followed by `$32.99/month`.
- [x] Effective Terms, Privacy, cancellation/refund disclosures, public-beta disclosure, and responsible-gambling language are live.
- [x] `support@kobesbettinghub.com` forwards to the owner. Support hours are Monday–Saturday, 9:00 AM–7:00 PM Pacific, with a one-business-day response target.
- [x] The read-only membership/pick operations alarm and scheduled production-health workflow are active.
- [x] X intake uses Luna under request/dollar limits, preserves audit records, and remains approval-first.
- [x] Recap and Trends polling are activated with backlog exclusions; empty runs send no public content.
- [x] Latest production source passes the complete 210-test release suite.

## Final gates before invitations

- [ ] Kobe opens the billing portal using the Discord identity linked to the intended duplicate membership and schedules that exact membership for cancellation. An operator must not guess or cancel either subscription on his behalf.
- [ ] Zakai performs a read-only Stripe → Supabase → Discord reconciliation after Kobe reports completion. Confirm the selected subscription is scheduled to end, the other subscription is unchanged, and paid access remains through the displayed paid-through date.
- [ ] Kobe acts on one fresh locked-format Discord approval card. Verify the interaction ends with a clear approved/rejected terminal result instead of disappearing after “thinking.” Do not publish a test pick publicly.
- [ ] Record `PUBLIC BETA GO`, timestamp/timezone, current commit and runtime versions, support coverage, and accepted residual risks in `PROJECT_CONTROL.md`.

## First-member activation routine

For each initial member, complete these checks within five minutes of checkout:

1. Confirm exactly one Stripe customer/subscription and the disclosed offer: `$10` once plus seven-day trial, or two-day free trial, then `$32.99/month`.
2. Confirm the signed webhook is processed and Supabase has one matching customer/subscription state.
3. Confirm exactly one Discord identity is linked and the paid role is granted.
4. Confirm the member can see paid channels and cannot see staff-only channels.
5. Confirm Manage Membership reaches Stripe Customer Portal using the linked Discord identity.
6. Give the member the official support route; record only sanitized internal references, never card data, tokens, or passwords.
7. If money, identity, or entitlement state is unclear, stop new invitations and open an incident before changing any other account.

## First-day operating routine

- Run the five public smoke checks before the first invitation and after any deployment.
- Review every new activation rather than sampling.
- Check the private operations alarm, Stripe webhook failures/retries, Supabase reconciliation, Discord roles, and support queue at least every 30 minutes while invitations are active.
- Reconcile all active/trialing memberships at close of day.
- Ensure every official pick has an approval, publication, canonical-log, grade/correction, and recap trail.
- Keep monitored-source publication approval-first; do not publish a synthetic test pick.

## Stop conditions

Stop new invitations immediately for any of the following:

- Duplicate or unexplained charge/subscription.
- Paid member without access, or access without eligible payment.
- Wrong Discord identity linked or first-claim protection failure.
- Timely cancellation followed by an unexpected renewal.
- Repeated webhook/reconciliation failure or stale monitoring.
- Wrong, unapproved, or unlogged member-facing pick.
- Checkout, website, or support route fails the public smoke/acceptance check.

## Safe post-launch backlog

- Observe the first real renewal and period-end cancellation through terminal role removal.
- Complete real approved-pick grading, recap, Trends, X, and Instagram Story content acceptance as legitimate content becomes available.
- Add a shared ticketing system and name a backup operator/legal-compliance owner.
- Decide non-OpenAI infrastructure budgets and retention periods.
- Build the deferred original black/orange sports-broadcast homepage redesign in a preview environment after memberships are rolling.
