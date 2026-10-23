# X Ads pixel and membership conversion events — October 22, 2026

Request: enable the existing KBH X Pixel and measure the ad funnel before comparing three more creatives.

Affected files: `x-pixel.js`, `membership.js`, `welcome.js`, `cloudflare/kobes-checkout-worker.js`, `privacy.html`, `scripts/prepare-public-site.mjs`, and focused tests.

Before: X Ads Manager listed Pixel `rht3t`; Landing page views and Site visits were inactive. A link click did not identify checkout intent, a verified free trial, or a paid membership in X. The first-party dashboard remained a separate, consent-dependent source.

After: the public build includes the existing account pixel on marketing/checkout pages only. The browser loads X's SDK only after optional tracking consent on the production host, and only after private activation/OAuth query parameters are removed. A successful `/checkout/prepare` emits checkout intent. The private status endpoint returns an opaque trial event ID only for a confirmed active subscription trial. The welcome page emits the trial event once; Stripe-verified positive paid receipts emit a separate paid event with actual value/currency. Event IDs deduplicate repeated checks. No email, phone, raw Stripe/Discord identifier, or activation token is passed to X. The privacy text names X.

Verification: 29 focused tests passed, including consent refusal, production/staging guard, private URL, conversion distinction, deduplication, and the explicit public build whitelist. Browser and production release checks remain to be recorded below. A successful pixel event does not prove attribution to a particular paid member; first-party Stripe and VIP states remain the payment/access source of truth.

Release status: local implementation; deployment and live event receipt pending.
