# Longer membership plans — September 17

## Verified live configuration

Real Stripe account: `acct_1U5a7sE6p9BmPii3`.

| Offer | Stripe price | Charge and renewal |
| --- | --- | --- |
| `six_month` | `price_1UGnd2E6p9BmPii3AnQTurPH` | $134.99 immediately and every six months |
| `annual` | `price_1UGo02E6p9BmPii3eP8kKQRy` | $194.99 immediately and every year |

Both are recurring with no trial or extra starter charge. Existing $10/7-day
and 2-day free introductory offers still become $32.99/month. Existing customers
were not migrated. Server-owned prices prevent customer-supplied amount/price
overrides. Missing prices fail closed. Referral links remain monthly-only.
Monthly cancellation coupons are not offered to longer plans. Stripe Tax was
not changed.

Six monthly payments total $197.94, saving $62.95: **Nearly 2 months free**.
Twelve monthly payments total $395.88, saving $200.89: **Over 6 months free**.
Comparisons exclude introductory offers. All plans have the same member access,
activated after completed checkout and Discord connection.

## Acceptance evidence

- Both live website buttons opened actual Stripe Checkout with the correct
  price/cadence. No Subscribe button was pressed and no payment was submitted.
- Regular Arc screenshots verified visible plan cards, orange Manage membership
  link and a bordered referral panel. The old links inherited black-on-black
  text; explicit contrast and keyboard focus styling fix that problem.
- Manage membership opened `/cancel`; referral opened `/refer`.
- Pricing anchors account for the shared sticky header. Connect Discord only
  appears on a valid successful checkout return.
- Checkout Worker: `76d4ffc3-d7ed-471f-ac94-2412055b8ce5`.
- Static website Worker: `e6c1d259-b1f0-4a0a-ae87-038a41bda41f`.
- Release tests: 254 passed; public smoke checks: 5 passed.

## Private exclusive batch

The operator's pasted list was delivered as **44 capper-grouped private cards /
139 exact wager lines**. Discord readback verified every original description
with zero mismatches, excluding appended approval-status footers. At that
readback 39 cards had Kobe's completed approval footer. The import itself made
zero member-channel publications.

KimsPicks' unspecified Red Sox wager and NazEaster's bare team/price entries are
held for missing market clarification; do not infer moneyline. Different units
on the repeated DommyLocked wager were preserved as supplied.

The first import exited before sending because of an incorrect transport import.
The retry used the existing audited, explicit-429-only Discord retry transport;
the permanent import fix ships in this release. Stable content IDs and durable
pre-send reservations prevent uncertain duplicate replay.
