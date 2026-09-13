# Membership lifecycle audit — 2026-09-12

Audit time: 2026-09-12 18:34 MST

Scope: Stripe Checkout and Customer Portal, Discord OAuth and paid-role synchronization, Supabase membership persistence, webhook behavior, and the daily reconciliation job. This audit made no live charge, refund, cancellation, Discord role change, or public post.

## Executive status

The architecture is valid: Stripe is the payment and subscription authority; Discord OAuth authenticates the community identity; Supabase stores the Stripe-to-Discord relationship and event history. The current build is **not yet fully release-validated** because exception billing events and the legal/policy layer are incomplete, and a complete test-mode lifecycle has not been run with a dedicated Discord test identity.

## Evidence verified

- Production Worker health returned HTTP 200 at `https://kobes-betting-hub-checkout.kobedirwin.workers.dev/health`.
- Cloudflare reports all six required secret names: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `DISCORD_CLIENT_SECRET`, `DISCORD_BOT_TOKEN`, `DISCORD_OAUTH_STATE_SECRET`, and `SUPABASE_SECRET_KEY`. Secret values were not read or exposed.
- `wrangler.jsonc` contains the Discord guild/role/application IDs, both Stripe price IDs, the Supabase project URL, and the daily `15 16 * * *` reconciliation trigger.
- Hosted Stripe Checkout is configured as a subscription. The starter offer uses the monthly price plus a one-time starter price and a seven-day trial; the other offer collects a card and uses a two-day trial.
- The webhook verifies Stripe HMAC signatures with a five-minute tolerance before writing, records event IDs in Supabase, and treats already-processed deliveries as duplicates.
- `customer.subscription.created`, `.updated`, and `.deleted` persist subscription state and grant or remove the Discord role based on `active`/`trialing` status.
- The manage-membership page authenticates the linked Discord identity and then creates a Stripe Customer Portal session. Checkout-session cancellation endpoints are disabled.
- Supabase membership tables have row-level security enabled and revoke `anon` and `authenticated` access.
- The full local test suite passes: **98 tests passed, 0 failed**. Ten tests directly cover the checkout Worker; one additional regression test covers text-only public Free Pick persistence.

## Hardening release

The audit itself made no production change. After review, the prepared hardening was deployed to production as Checkout Worker version `4b66c8f4-d5b0-4b7b-888e-f85584423f9a`; the public health endpoint returned HTTP `200` after deployment.

- A Stripe signature with multiple `v1` values now succeeds when any current signature is valid, supporting webhook-secret rotation.
- A conditional first-claim rule prevents a completed Checkout Session from being replayed to replace the linked Discord identity or reuse one Discord identity across two Stripe customers.
- Portal authentication now requests only Discord `identify`; the broader `guilds.join` scope is limited to initial onboarding.
- Cloudflare version metadata is attached to outbound Stripe/Discord API audit rows so each call can be traced to the exact Worker version.
- Tests cover signed OAuth state and tampering, exact offer composition, single-identity claims, idempotent webhook delivery, active-role grant, canceled-role removal, and Worker-version audit attribution.

Modified implementation files:

- `cloudflare/kobes-checkout-worker.js`
- `cloudflare/kobes-checkout-worker.test.mjs`
- `wrangler.jsonc`

## Open gaps, ordered by severity

### Release blockers

1. **Terms and policy are not effective.** `terms.html` publicly says “DRAFT • NOT YET EFFECTIVE” while checkout is enabled. Legal entity, jurisdiction, renewal/cancellation language, refunds, taxes, and the official contact are unresolved.
2. **Billing exceptions do not drive entitlement.** The webhook records but does not act on `invoice.payment_failed`, `invoice.paid`, refunds, or disputes. A refund or dispute can therefore leave an otherwise-active subscription role in place. The intended past-due grace behavior is also undecided; current code removes access whenever status leaves `active`/`trialing`.
3. **No complete test-mode lifecycle evidence.** A dedicated test Discord account must complete Checkout, OAuth join/link, role grant, portal access, cancel-at-period-end, period-end role removal, failed renewal/recovery, refund, and dispute scenarios.

### High-priority operational gaps

4. **No paid-without-access alert.** If a customer pays but never completes Discord linking, reconciliation records `NO_DISCORD_LINK` but there is no external alert or owner queue.
5. **Checkout abuse controls are absent.** `/create-checkout` has no server-side rate limiter or Turnstile verification, and Stripe session creation has no client idempotency key. This can inflate Stripe/API volume even without completing a payment.
6. **Webhook event registration is not independently evidenced.** The code expects Checkout and subscription events, but the Stripe Dashboard endpoint selection and Customer Portal configuration still need a dashboard check.
7. **No staging environment is defined.** `wrangler.jsonc` targets one Worker and live-looking price IDs. Safe repeatable end-to-end testing should use a separate Worker, Stripe test keys/prices/webhook, test Discord server/role, and staging Supabase data.
8. **Support relinking is undefined.** The new first-claim protection deliberately fails closed if a member needs to move access to another Discord identity. An owner-approved, audited support procedure is required.
9. **Database integrity is application-enforced.** The subscription-to-customer relationship has no foreign key, and event status/actor fields have no constraints. This is acceptable for the smoke-test phase but should be hardened before reporting depends on it.

## Exact inputs required from the owner

Business and policy decisions:

- Legal/business name, business address, governing jurisdiction, and legal-review owner.
- Official support and privacy email; private escalation path and response-time target.
- Refund policy, including intro-payment refunds and partial periods.
- Failed-payment grace duration and whether `past_due` retains Discord access.
- Whether refunds and disputes remove access immediately or require manual review.
- Cancellation effective time, tax handling, receipt/billing descriptor, and approved renewal disclosure.
- Who may approve a Discord-account relink and what evidence support must verify.
- Membership/audit data retention period and deletion process.

Test credentials and resources:

- One dedicated Discord test-user identity that may join the test guild and safely receive/remove a test paid-member role.
- A Discord staging application/bot, test guild ID, test role ID, OAuth redirect URI, client secret, bot token, and OAuth-state secret.
- Stripe test restricted key, test recurring and intro Price IDs, test webhook endpoint signing secret, and enabled test Customer Portal configuration.
- A staging Supabase project or approved isolated staging schema plus its server-only secret key.
- Confirmation of the alert destination for paid-without-access and reconciliation failures.

## Required final validation sequence

1. Deploy the prepared hardening to an isolated staging Worker.
2. Run the full test-mode lifecycle and retain Stripe event IDs, Supabase event rows, Discord role before/after evidence, and Worker version ID.
3. Implement the approved past-due/refund/dispute state rules and automated alerts.
4. Approve and publish effective Terms, Privacy, refund, renewal, cancellation, and support language.
5. Deploy production, run one owner-approved low-value live transaction if required, cancel/refund it under the approved policy, and attach the resulting evidence to this audit trail.
