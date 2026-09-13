# Membership and payment foundation

## Current architecture

Stripe Checkout is the payment entry point and Stripe remains the authority for charges, invoices, renewal, and cancellation. Discord OAuth authenticates the community identity; it is not a payment method. Supabase stores the durable mapping between Stripe customer/subscription IDs and the linked Discord user, plus an idempotent webhook trail. Do not add credentials to this repository.

Members manage billing through Stripe Customer Portal after authenticating with the Discord account linked during onboarding. Do not use a Checkout Session ID in a URL as ongoing account authentication.

## Subscription states

The payment provider is the billing source of truth. Normalize provider status to:

| State | Access | Required action |
| --- | --- | --- |
| `pending` | No | Wait for verified checkout webhook |
| `active` | Yes | Create or confirm access handoff |
| `trialing` | Yes, if offered | Show trial end and first charge date |
| `past_due` | Approved grace period only | Link billing portal; remove after grace period |
| `canceled` | Until paid-through date | Remove at period end |
| `expired` | No | Confirm removal and offer rejoin |
| `refunded` | No by default | Remove after policy check |
| `disputed` | No; manual review | Suspend and notify owner |

Never infer `active` from a browser redirect. Entitlement changes only after a verified, idempotent server-side webhook.

## Checkout integration plan

Use hosted subscription checkout so card data never touches this site:

1. Customer selects the published plan and provides an email.
2. The server creates a hosted session using a server-side price ID.
3. The provider returns the customer to `/membership/processing`.
4. A signed webhook updates subscription and entitlement records.
5. The processing page polls the site's membership endpoint for `active` or a recoverable failure.
6. Active members receive the approved access handoff. Billing changes use the provider's hosted portal.

### Required server-only configuration

- Cloudflare Worker secrets: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `DISCORD_CLIENT_SECRET`, `DISCORD_BOT_TOKEN`, `DISCORD_OAUTH_STATE_SECRET`, `SUPABASE_SECRET_KEY`
- Cloudflare Worker variables: Stripe price IDs, Discord IDs/redirect URI, and `SUPABASE_URL`
- Render worker secret: pooled Supabase `DATABASE_URL`; set `AUDIT_DATABASE_REQUIRED=true` only after a verified migration and write/read smoke test

Handle checkout completion, subscription creation/change/deletion, invoice success/failure, refunds, and disputes. Store event IDs, reject duplicates, and verify signatures before writes.

## Decisions required before payments

- Provider and legal account owner
- Price, currency, cadence, offer, and trial decision
- Renewal disclosure, cancellation cutoff, refund policy, grace period, and taxes
- Support owner for refunds, disputes, and access failures
- Approved terms, privacy, responsible-gambling, age, and location requirements
- Approved access destination and supported handoff method

## Access handoff requirements

Begin only after independent verification of an active entitlement. Show confirmation, renewal date, receipt/billing portal, support contact, and the next member action.

For a community platform, use only an approved first-party invite or supported OAuth/application flow. Store the minimum identifier required. Do not request passwords, scrape member lists, reuse partner invites, or access partner communities. Access changes must be auditable and retryable.

Minimum records: internal user ID, normalized email, provider customer/subscription IDs, plan ID, status, period end, cancellation flag, handoff status, timestamps, and last processed event ID.

## Release checklist

- Publish exact pricing and approved policies.
- Add server authentication, database records, webhook verification, and rate limiting.
- Configure hosted checkout and billing portal with test credentials first.
- Test success, abandonment, duplicate webhook, failed renewal, cancellation, refund, dispute, and handoff retry.
- Confirm no secrets, card data, or customer data are committed.
- Run a small internal test cohort before public launch.
