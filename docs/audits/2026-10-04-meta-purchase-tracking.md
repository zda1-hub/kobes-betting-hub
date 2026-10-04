# October 4, 2026 — Relaunch Meta purchase tracking

## Request and initial audit

The user asked whether purchase tracking was good before the relaunch. The live public `meta-pixel.js` and `welcome.js` were read without making a payment. The production checkout health endpoint returned version `80b70bea-065a-465e-9839-4bc826d29c1d`.

Before: the Pixel initialized `PageView` and registered a document click listener for `InitiateCheckout`. Membership's earlier target listener disabled the clicked button before the bubbling Pixel listener checked it, preventing the normal intent event. There was no Meta `Purchase` event, browser or Conversions API implementation. Internal `payment_completed` events already came from Stripe-verified activation and were deduplicated per subscription; they were not forwarded to Meta. The parent also checked production secret names and found no Meta CAPI access token.

## Change

- `meta-pixel.js`: production-host-only initialization; explicit checkout-intent API; verified-receipt purchase API with actual paid value/currency and opaque stable event ID. Same-page memory and local storage prevent repeated welcome returns queuing the same purchase. Automatic configuration is disabled. Initialization pauses while private activation, OAuth or checkout credentials remain in the page URL.
- `membership.js`: queues checkout onboarding intent after preparation succeeds with an allowed HTTPS Discord/Stripe destination. Tracking failure cannot block checkout. The Discord-first flow creates the Stripe session later on the server; this event measures the successful start of that journey, not the exact instant a Stripe session is created. Legacy checkout-session credentials are removed from the URL and retained in the current history entry to support reload/Discord connection.
- `cloudflare/kobes-checkout-worker.js`: the existing private, high-entropy activation-token status endpoint returns a purchase receipt only for a confirmed association and a fresh Stripe lookup of its matching, complete, paid, live session with a positive integer USD amount. It never returns customer email/card data or raw session/subscription identifiers in that receipt. Failure to retrieve a receipt leaves the status page working. No access or billing decisions change.
- `welcome.js`: captures its activation credential, removes it from the visible URL before advertising SDK initialization and preserves it only in the current history entry for reload. Reports Purchase on a verified receipt even if Discord activation needs attention.
- `privacy.html`: discloses verified purchase value/currency events.
- `join.html`, `membership.html`, `welcome.html` and `scripts/prepare-public-site.mjs`: updated script cache versions. No visible design, offer or membership terms change.
- Tests: `scripts/meta-purchase-tracking.test.mjs` and `scripts/membership-checkout.test.mjs` exercise actual event queuing, invalid/unpaid/test/mismatched sessions, all four configured USD plan amounts, repeated returns, private URL cleanup, reload continuity, staging exclusions and failed/invalid redirect behavior.

## Verification

88 tests passed across Meta tracking, membership checkout, secure onboarding, public build preparation and the checkout Worker suite. The explicit public whitelist build succeeded. No real payment, new subscription, email or Discord message was made for verification. Whitespace checks passed.

## Limitations and release status

Local implementation committed for parent review; not deployed by this subagent. Production initially lacks Meta Purchase reporting. This is browser instrumentation: ad blockers, disabled tracking, a shopper not returning to the welcome page, inaccessible storage or a transient Stripe status lookup can prevent reporting. A queued browser event is not proof that Meta accepted it. Events Manager/Test Events receipt has not been inspected because the Meta account belongs to Kobe and the user canceled that login inspection. No CAPI has been configured or claimed. Sessions with no payment required, test sessions, zero/invalid values or non-USD currency do not emit Purchase; renewals are not recorded as new membership purchases. No historical purchases are fabricated or bulk replayed. Private state survives reload in its history entry, not in persistent token storage; bookmarking the cleaned welcome URL cannot reopen that private verification session.
