# $5 first-month dedicated link — October 14, 2026

Request: fix, deploy and test the $5 deal tonight for tomorrow's launch. Follow-up scope: use a dedicated link and preserve the existing website rather than redesigning it.

## Result and offer

Public link: https://kobesbettinghub.com/join?deal=first20

- $5 for the first month, then $32.99/month until canceled. No free trial on this offer.
- Opens October 15, 2026 at 12:00 AM MST (`2026-10-15T07:00:00Z`).
- Ends October 19 at 10:00 AM MST (`2026-10-19T17:00:00Z`), or after 20 coupon redemptions.
- Does not stack with referral offers. Stripe's coupon cap is a redemption limit, not a claim that 20 unique people have joined.
- Ordinary `/join`, `/membership`, homepage membership and referral arrivals retain their existing offers. No CSS, artwork, header, layout or motion changes.

## Before and after

The retired first-month-offer guard rejected `first20` before its separate launch checks. The older dates also opened a day early and closed ten hours early. The public membership scene had no dedicated first20 entry.

The corrected guards recognize only the exact `first_month_back` + `first20` combination and enforce the approved server-side window. The query-string variant changes the existing primary action and terms, carrying the real promotion key through the existing Discord-first association and Stripe checkout. A read-only, rate-limited `/promotions/first20` response validates the actual Stripe monthly price and coupon. Before opening, the button is disabled and refreshes status every 30 seconds. Exhausted/ended offers clearly fall back to the regular two-day trial; unavailable configuration fails closed.

Stripe's live coupon `kbh_first20_20261015` was created and visually verified in the authenticated Kobesbettinghub account: $27.99 USD off **once**, maximum 20 redemptions, expiry October 19 at **10:00 AM PDT** (the same UTC offset as MST on this date). The Worker requires that exact expiry and a $32.99 USD monthly price. It reads this provisioned coupon and does not create coupons from public requests. No subscription, payment or VIP grant was created during provisioning.

## Files

- `cloudflare/kobes-checkout-worker.js`: window, retired-guard exception, Stripe price/coupon validation, bounded availability endpoint.
- `membership.js`: dedicated-link presentation, availability gate, exact checkout payload and sold-out/ended fallback.
- `index.html`, `join.html`, `membership.html`: membership script cache version only.
- `cloudflare/first20-launch.test.mjs`, `cloudflare/monthly-trial.test.mjs`, `cloudflare/kobes-checkout-worker.test.mjs`, `scripts/membership-checkout.test.mjs`: boundary, configuration, checkout, signed-webhook and UI-flow coverage.

## Verification and release

- 150 focused tests passed across checkout, monthly trials/paid first20 activation, referral payout safety, reporting, membership UI and portal behavior.
- Includes exact opening/closing boundaries; missing/wrong/exhausted coupon; wrong renewal price/currency; no free trial for first20; first20 metadata through Discord; no referral stacking; duplicate signed payment event does not grant VIP twice; scheduled-to-open refresh; and explicit regular-plan fallback.
- Public whitelist build prepared successfully: 93 entries. Only four public assets changed on upload: `index.html`, `join.html`, `membership.html`, `membership.js`.
- Rendered populated local 320px, 390px and 1440px states inspected. Primary text/arrow and compact header controls fit. Measured document widths match 320/390 and header top is 0. Local action remains preview-only, without a checkout or charge.
- Production link rendered its scheduled, disabled state after the actual Stripe preflight became ready. Exact live 390px iframe viewport measured 390px document width and header top 0; optional tracking declined. Browser viewport override on the direct production tab measured 520px despite a requested 390px, so that provisional capture was replaced with the measured iframe capture.
- Live `GET /promotions/first20`: `state=scheduled`, `ready=true`, `firstMonthCents=500`, `renewalCents=3299`, `currency=usd`, `limit=20`, with the exact UTC start/end above.
- Live prelaunch `POST /checkout/prepare` rejects with HTTP 400, `The limited $5 offer is not open.` The previous erroneous retired-offer response is gone.
- Checkout Worker final version: `cd110ca4-6dff-4d7a-91c2-87939b1bb264`. Public Worker version: `0c877835-1081-45a7-ab3e-af0c9c384349`. Deployment used the latest GitHub base `2fbd9cc`, existing service binding and schedules, and `--keep-vars`; both approved dashboard admin IDs remain configured. Secrets were retained, not read or rotated. Publisher/bot/backend files outside checkout were not deployed.
- `git diff --check` passed.

Evidence: `evidence/2026-10-14-first20/offer-{320,390,1440}.jpg`, `live-scheduled-390.jpg`, `stripe-coupon-confirmed.png`, and `live-readiness.json`.

## Limits

No real customer purchase, card charge, subscription or live VIP grant was made tonight. The promotion is intentionally closed before midnight; opening and paid activation were exercised with controlled-clock and signed-webhook fixtures, while price/coupon configuration and the prelaunch gate were checked live. A real paid customer's completed transaction remains future evidence.

The broader unchanged bento-release suite also reported two pre-existing failures: an outdated expectation of 14 `figure.review-card` tags (the latest base has zero of that exact markup) and a wins-motion frame fixture. `proof.html`, `home-results.js` and that suite are unchanged. These failures are not represented as passing or repaired by this release.
