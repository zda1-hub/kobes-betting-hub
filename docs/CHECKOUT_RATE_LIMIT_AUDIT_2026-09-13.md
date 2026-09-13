# Checkout Rate-Limit Acceptance — 2026-09-13

Owner: Zakai Martin  
Outcome: Staging acceptance passed; production deployed and read-only verified

## Control

`POST /create-checkout` now calls a Cloudflare Workers Rate Limiting binding before parsing the offer or contacting Stripe. The binding allows 10 attempts per 60 seconds in each Cloudflare location for a SHA-256 key derived from network and client hints. Raw IP and User-Agent values are not stored in the key or application logs. A blocked request returns `429` and `Retry-After: 60`.

Stripe `Idempotency-Key` behavior remains the duplicate-session/charge control. The edge limiter is deliberately an abuse and runaway-client control, not an exact billing counter; Cloudflare documents its counters as eventually consistent.

## Isolated staging evidence

- Staging Worker: `kobes-betting-hub-checkout-staging`
- Staging version: `88319942-ddae-4028-983a-e02ce707acb6`
- Separate staging limiter namespace: `42027102`
- Test payload: deliberately invalid JSON, so every allowed request ended at local validation and no Stripe, Supabase, or Discord request occurred.
- A tight initial 12-request burst returned `400` throughout, retaining evidence of the documented permissive/eventually-consistent behavior.
- A paced follow-up returned ten `429` responses in a 12-request batch.
- A fresh paced window produced its first `429` at attempt 11 with `Retry-After: 60` and the safe retry message.
- Unit coverage verifies the limiter rejects before the Stripe fetch and hashes the raw actor hints.

## Production promotion evidence

- Production Worker: `kobes-betting-hub-checkout`
- Production version: `ff778d91-c34c-4b49-92c9-dfa02785fa37`
- Separate production limiter namespace: `42027101`
- Health returned `200` with the exact version ID.
- All seven encrypted secret names remained installed; values were not read or printed.
- Daily reconciliation remained scheduled at `15 16 * * *` UTC (09:15 Arizona).
- The credential-free production suite passed Checkout health, Publisher health, current Free Pick API, public Free Pick page, and client asset (`5/5`).

Production was not load-tested because that could temporarily block a legitimate visitor. No checkout session, customer, subscription, charge, Discord action, or public message was created by this acceptance.
