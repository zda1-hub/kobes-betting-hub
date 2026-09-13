# Membership lifecycle audit — 2026-09-12

Audit opened: 2026-09-12 18:34 MST

Latest staging verification: 2026-09-13 02:40 MST

Scope: Stripe Checkout and Customer Portal, Discord OAuth and paid-role synchronization, Supabase membership persistence, webhook behavior, and scheduled reconciliation. All transaction and entitlement mutations in this audit used isolated test resources. Production was not changed, no real money moved, and nothing was published to Discord or X.

## Executive status

The intended authentication and billing split is now verified through scheduled cancellation:

- Discord OAuth authenticates which community account is acting. It is not the payment authenticator and never handles card data.
- Stripe Checkout and the Stripe Customer Portal authenticate and perform payment, recurring billing, invoices, payment-method changes, and cancellation.
- Supabase durably maps the Stripe customer/subscription to the Discord user and stores webhook, membership, and outbound API audit events.
- Discord membership roles are derived entitlements. Stripe subscription state is authoritative.

One dedicated test identity completed Checkout, Discord link and guild join, paid-role grant, Discord-authenticated portal access, and cancellation at the end of its trial. The role correctly remains present while the subscription is still `trialing`; the remaining time-dependent proof is role removal after the terminal cancellation event on 2026-09-20. Failed renewal/recovery, refund, and dispute behavior also remains to be tested. Legal and support policy remain release blockers.

## Controlled staging lifecycle — 2026-09-13

| Stage | Durable evidence | Result |
|---|---|---|
| Checkout | Client request `538bb01e-2bd6-4774-bacb-73070bd923cb`; Checkout Session `cs_test_b1CVOAryEQbWLUTGnKOcKe9lZruQwApLX4C9cxu9nKm6Huw9JACjGp8kwQ` | `$10` test payment, seven-day trial, then `$32.99/month`; no real money |
| Identity | Discord user `832944927884312606` | OAuth token exchange and `/users/@me` returned HTTP `200` |
| Guild and entitlement | Guild `1548568770123927562`; role `1548578573177061416` | Guild join and role PUT returned HTTP `204`; role visibly assigned |
| Membership persistence | Supabase staging `ctqmksvfqrysomvckqrm` | `DISCORD_ACCOUNT_LINKED`, subscription, event, and API-call rows persisted |
| Initial grant webhook | `evt_1UF9bEE6p9BmPii3RxeS3DjL` | `customer.subscription.updated`, `PROCESSED`, `ROLE_GRANTED`, test mode |
| Portal authentication | Discord `identify`, then Stripe Customer Portal | Portal opened for the linked Stripe customer; no Checkout Session ID was accepted as authentication |
| Cancellation | Subscription `sub_1UF8Y4E6p9BmPii37J9VhpeS` | Owner-authorized cancel at period end; portal displays `Cancels Sep 20` |
| Cancellation webhooks | `evt_1UF9keE6p9BmPii3rJjT5igf`, `evt_1UF9kfE6p9BmPii3kga4qZ9I` | Both `customer.subscription.updated`, `PROCESSED`, `ROLE_GRANTED`, test mode |
| Final idempotent refresh | `evt_1UF9paE6p9BmPii3E5s0nNcB` | OAuth/link refresh succeeded; webhook processed under final Worker version |
| Final state | Supabase subscription row | `trialing`; `cancel_at=2026-09-20T08:14:02Z`; `current_period_end=2026-09-20T08:14:02Z`; role retained until entitlement end |

The raw Stripe field `cancel_at_period_end` is `false` because current Stripe behavior represents this trial-end cancellation with the explicit future `cancel_at` timestamp. The application now treats either field as scheduled cancellation and uses the subscription item's period end when top-level period fields are absent.

## Defects found and corrected

1. The first successful Checkout return used a hard-coded production site origin. The production page rendered but no production Discord endpoint was invoked. The Worker now validates `SITE_ORIGIN`, supports the staging browser origin, and fails closed if staging would fall back to production.
2. Supabase initially returned HTTP `403` for `referral_rewards` because the server credential lacked explicit REST table grants. Migration `007_service_role_rest_access` grants only the backend operations required by `service_role`, retains RLS, and leaves `anon` and `authenticated` with zero table grants.
3. Stripe's Basil API moved subscription period fields from the subscription root to subscription items. The initial cancellation webhooks therefore stored a null period end. Migration `008_subscription_cancellation_fields` adds `cancel_at`; the Worker now persists explicit cancellation time and falls back to item-level period fields.

All three fixes are present in staging source deployment `30cea51e-5ef2-4d24-baae-f36565152726`. Secret-only Discord client rotation deployment `5c878920-d8c8-449d-9922-ce4cfc849e77` preceded it. The final health endpoint returned HTTP `200` and the local suite passes **151 tests, 0 failures**.

## Credential and isolation evidence

- Cloudflare staging contains encrypted secret names `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `DISCORD_CLIENT_SECRET`, `DISCORD_BOT_TOKEN`, `DISCORD_OAUTH_STATE_SECRET`, and `SUPABASE_SECRET_KEY`. Values are not committed or recorded in this audit.
- The final Discord bot token and OAuth client secret were rotated and installed directly into encrypted staging secrets. Earlier exposed or unusable credentials were superseded.
- Discord application `1548556799513333770` has two intentional staging redirect URIs: the membership callback and the separate referral-sandbox callback. Neither is a production callback.
- The bot has `Manage Roles`, and active member role `1548578573177061416` is below the bot. Empty obsolete role `1548568981906919464` was verified by exact ID and deleted with owner authorization.
- Stripe webhook endpoint `we_1UF61QE6p9BmPii30UGuNEMO` is in the intended test account and sends the seven configured membership/refund/dispute event classes to staging.
- Staging cron and global payouts are disabled. The production Supabase project, production Worker, and production Discord membership were untouched.
- One best-effort Discord OAuth token revocation returned HTTP `429`. This is nonblocking: the access token is short-lived, is not persisted, and all membership/guild/role operations had already succeeded. The API audit row retains the outcome without retaining the token.

## Security and behavior already covered

- Stripe webhook HMAC verification uses a five-minute tolerance and accepts any valid current `v1` signature during secret rotation.
- Event IDs make webhook processing idempotent.
- A completed Checkout Session cannot be replayed to replace a linked Discord identity or reuse one Discord identity across two Stripe customers.
- Returning-member portal OAuth requests only Discord `identify`; `guilds.join` is limited to onboarding.
- Browser retries reuse a validated UUID as Stripe's `Idempotency-Key`.
- Outbound Stripe and Discord audit rows include the exact Cloudflare Worker version and retain no bearer token, OAuth code, card data, or raw secret.
- Tests cover OAuth state signing/tampering, offer composition, identity claims, current and legacy Stripe subscription shapes, idempotent webhooks, role grant/removal, cancellation persistence, CORS, and Worker attribution.

## Open gaps, ordered by severity

### Release blockers

1. **Terms and policy are not effective.** `terms.html` publicly says “DRAFT • NOT YET EFFECTIVE” while checkout is enabled. Legal entity, jurisdiction, renewal/cancellation language, refunds, taxes, and official contact details remain unresolved.
2. **Billing exceptions do not yet drive final entitlement policy.** The webhook records `invoice.payment_failed`, `invoice.paid`, refunds, and disputes, but the owner has not approved grace, removal, or restoration rules for every case.
3. **The normal lifecycle is complete only through scheduled cancellation.** Observe the terminal event and role removal on 2026-09-20. Separately exercise failed renewal/recovery, refund, and dispute scenarios.

### High-priority operational gaps

4. **No external paid-without-access alert.** Reconciliation records `NO_DISCORD_LINK`, but there is no owner notification queue.
5. **Checkout abuse controls are partial.** Idempotency is deployed, but `/create-checkout` still lacks server-side rate limiting or Turnstile verification.
6. **Support relinking is undefined.** First-claim protection deliberately fails closed; an owner-approved, audited Discord relink process is required.
7. **Some database integrity remains application-enforced.** Subscription/customer and event-state constraints should be strengthened before reporting depends on them.

## Owner decisions still required

- Legal/business name, address, jurisdiction, and legal-review owner.
- Official support/privacy email, escalation path, and response target.
- Refund policy, failed-payment grace period, and access behavior for refunds/disputes.
- Approved renewal disclosure, cancellation effective time, taxes, and billing descriptor.
- Discord-account relink authority and verification procedure.
- Membership/audit retention and deletion policy.
- Alert destination for paid-without-access and reconciliation failures.

## Remaining validation sequence

1. **Complete:** isolated environment, encrypted credentials, Checkout, Discord OAuth/link, guild join, role grant, portal authentication, scheduled cancellation, Supabase persistence, and versioned API-call audit.
2. **Time-dependent:** after `2026-09-20T08:14:02Z`, retain the terminal Stripe event, Supabase subscription/event rows, and Discord role-removal evidence.
3. Implement and test approved failed-payment, recovery, refund, and dispute rules plus external alerts.
4. Approve and publish effective Terms, Privacy, refund, renewal, cancellation, and support language.
5. Only after production approval, deploy the staging fixes to production and perform any separately authorized production acceptance transaction.
