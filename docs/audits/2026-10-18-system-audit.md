# System audit — October 18, 2026 MST

Requested: audit the current Hub for glaring issues and make focused fixes. Follow-up direction: keep the current public copy/design intact during the temporary promotion. The owner clarified that the $5 first-month offer is intended to end **October 22, 2026 at 10 AM MST**.

## Confirmed checks

- The production smoke script passed all five public checks: checkout Worker health, publisher health, current Free Pick API, Free Pick page, and its client asset. The current API entry is dated October 18 and names James Cook Over 93.5 Rush Yards. This proves public availability, not email delivery, grading, or a paid checkout.
- The sitemap's 18 public URLs plus membership and management aliases returned HTTP 200 or their intended redirects. The live $5 Join action reached Discord OAuth; identity authorization and payment were not completed.
- GitHub's most recent read-only production-health run passed: run 39178607833 (October 18 at 23:57 UTC).
- The homepage's expanded Kobe note and the post-unlock Free Pick CTA still refer to the regular two-day trial while the featured $5 offer has no trial. The FAQ distinguishes regular and limited offers. No copy edit was retained after the owner's instruction to keep the temporary presentation in place.

## Action required: $5 offer deadline

At the time of this audit, the live `/promotions/first20` endpoint reports `endsAt: 2026-10-19T17:00:00.000Z`, which is October 19 at 10 AM MST. `first20-feature.js` and the checkout Worker use the same cutoff. This conflicts with the owner's clarified October 22 deadline. **The live promotion has not been extended.** Do not advertise the later deadline or change the website timer alone.

The existing Stripe coupon is validated against its October 19 `redeem_by` and a 20-redemption maximum. Stripe's [coupon API](https://docs.stripe.com/api/coupons/create) does not allow editing that expiration after creation. A replacement coupon, a carry-forward of the existing redemption count, a coordinated Worker/site update, and a live checkout-status check are required to preserve the 20-member cap. This checkout change could not be made safely here: no Stripe credential or authorized Cloudflare deployment access was available in this checkout, and the prior remote D1 query returned authorization error 7403. The exact deadline and existing cap must both be verified in Stripe before release.

## Action required: paid access

GitHub Actions run [39180450311](https://github.com/zda1-hub/kobes-betting-hub/actions/runs/39180450311) reported 3 active/trialing subscription **records** without linked Discord users after the 30-minute grace window, out of 9 active/trialing records. The same count appeared in run 39172449000. Reconciliation was fresh and there were zero failed/stuck webhooks or referral safety holds. These counts do not establish three distinct paid people or the cause; review the affected accounts privately and help any eligible customer complete Connect Discord. Do not change billing or suppress the alert based on aggregate counts.

## Fixed locally: pick alarm was skipped

The membership alarm failed before the next step, so GitHub Actions skipped the separate private pick-operations check. `.github/workflows/membership-operations-alert.yml` now runs the pick check after a successful dependency install even when the membership check reports an exception, while retaining the overall failed run. `scripts/check-pick-operations.test.mjs` guards the workflow condition. Four focused tests passed locally. This change is **local only** until merged; no production run has yet proved the new step executes.

## Limits

The site and public API checks do not verify a completed Stripe payment, member role grant, automatic email delivery, or pick publication history. The private pick-operations state remains unknown until the independent alarm runs with production database access. No production site, Worker, Stripe, or member record was changed during this audit.

## Follow-up — independent alarm run, October 18 at 19:17 MST

PR #242 merged as `4bbe167`. Manual production Actions run [39189270296](https://github.com/zda1-hub/kobes-betting-hub/actions/runs/39189270296) proved that the pick-operations step now executes even when the membership step fails. The membership check again reported 3 unlinked active/trialing subscription records. The pick check failed safely after approximately 10 seconds without metrics; this does not establish a stuck pick or publication failure. A follow-up local change increases its read-only query window to 25 seconds and logs only a coarse error category, so the next run can distinguish timeout, schema, connection, or unknown failure without exposing private query details. Production verification of that follow-up is pending.
