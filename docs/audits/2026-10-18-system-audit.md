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

### October 18 follow-up: deadline extension in progress

The owner clarified the end as **October 22, 2026 at 10 AM MST** and requested that the existing signed-in dashboards be used. The production Kobesbettinghub Stripe account (`acct_1U5a7sE6p9BmPii3`) showed the October 19 coupon at **0/20 redemptions**, with no customers currently redeeming it. A replacement coupon `kbh_first20_20261022` was created there: $27.99 USD off once, 20 maximum redemptions, and October 22 at 10 AM PDT (the same UTC instant as 10 AM MST). No payment or subscription was created. The old coupon remains active until the coordinated cutover is verified.

The candidate changes only the first-20 dates and coupon ID in `cloudflare/kobes-checkout-worker.js`, `cloudflare/bettinghub-publisher.js`, `first20-feature.js`, `membership.js`, and their focused tests. The other offer and site design are untouched. All 68 focused checks passed. Local `/join?deal=first20` showed the October 22 date and preserved the $5 action at 320, 390, and 1440 pixels, with no horizontal overflow; the primary action stayed preview-only on localhost. **This entry records a local candidate and Stripe coupon creation, not a live deadline extension.** Before release, recheck the old coupon count, deploy checkout Worker and public site, verify live offer/checkout status, then retire the old coupon to prevent two active discounts. Append the release receipt below.

## Action required: paid access

GitHub Actions run [39180450311](https://github.com/zda1-hub/kobes-betting-hub/actions/runs/39180450311) reported 3 active/trialing subscription **records** without linked Discord users after the 30-minute grace window, out of 9 active/trialing records. The same count appeared in run 39172449000. Reconciliation was fresh and there were zero failed/stuck webhooks or referral safety holds. These counts do not establish three distinct paid people or the cause; review the affected accounts privately and help any eligible customer complete Connect Discord. Do not change billing or suppress the alert based on aggregate counts.

## Fixed locally: pick alarm was skipped

The membership alarm failed before the next step, so GitHub Actions skipped the separate private pick-operations check. `.github/workflows/membership-operations-alert.yml` now runs the pick check after a successful dependency install even when the membership check reports an exception, while retaining the overall failed run. `scripts/check-pick-operations.test.mjs` guards the workflow condition. Four focused tests passed locally. This change is **local only** until merged; no production run has yet proved the new step executes.

## Limits

The site and public API checks do not verify a completed Stripe payment, member role grant, automatic email delivery, or pick publication history. The private pick-operations state remains unknown until the independent alarm runs with production database access. No production site, Worker, Stripe, or member record was changed during this audit.

## Follow-up — independent alarm run, October 18 at 19:17 MST

PR #242 merged as `4bbe167`. Manual production Actions run [39189270296](https://github.com/zda1-hub/kobes-betting-hub/actions/runs/39189270296) proved that the pick-operations step now executes even when the membership step fails. The membership check again reported 3 unlinked active/trialing subscription records. The pick check failed safely after approximately 10 seconds without metrics; this does not establish a stuck pick or publication failure. A follow-up local change increases its read-only query window to 25 seconds and logs only a coarse error category, so the next run can distinguish timeout, schema, connection, or unknown failure without exposing private query details. Production verification of that follow-up is pending.

## Follow-up — pick backlog surfaced, October 18 at 19:19 MST

PR #243 merged as `2e2d2f1`. Manual production Actions run [39189431732](https://github.com/zda1-hub/kobes-betting-hub/actions/runs/39189431732) completed the private query. It reported 65 approval cards in `APPROVED_PENDING_PUBLICATION` and 65 publication rows in `PUBLISHING` older than five minutes, with 2,364 cards still pending approval. In the last 26 hours it also counted 30 published picks and zero unresolved publication failures, failed recaps or network errors. The matching 65 counts suggest a shared stranded lifecycle, but the aggregate report does not prove which cards correspond or whether Discord received them. No card was republished or changed. A new read-only age breakdown will determine whether the backlog is recent or historical and whether any stranded rows already have Discord message receipts; this is local until merged and run.

## Follow-up — root cause and prevention, October 18 at 19:22 MST

PR #244 merged as `7d6b65f`; manual production run [39189646637](https://github.com/zda1-hub/kobes-betting-hub/actions/runs/39189646637) found that 63 of the 65 stranded publication rows are older than 24 hours and 2 are from the last 24 hours. The oldest is September 20. None of those `PUBLISHING` rows has a Discord message ID in the audit database. The most recent 26-hour window also contains 30 successful published picks. The alert therefore identifies a historical reconciliation backlog plus two recent incidents, not proof that all publishing has stopped.

The two recent Render approval traces for pick IDs `20261018-084-X` and `20261018-089-X` show an approval audit followed by `Pick ID ... was not found in pick-log.csv`. The CSV helper read, modified and rewrote the whole file for each simultaneous approval without serializing writes; concurrent calls could overwrite one another. The local fix serializes all append/retry/update operations for each log path and writes each complete CSV through a same-directory temporary file and atomic rename. A 24-approval regression test then updates all 24 Discord references and verifies no row is lost. Three focused pick-log tests passed. This prevents the observed in-process race on the current single-instance Render Worker; it does not reconcile the 65 existing audit rows or prove whether the two recent picks reached Discord. Do not retry either pick before checking the destination channels for an existing post.
