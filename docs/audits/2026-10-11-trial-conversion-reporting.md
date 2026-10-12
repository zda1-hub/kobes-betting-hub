# Trial conversion and current membership reporting — October 11, 2026

## Request and scope

Implement the narrow functional fixes identified during the acquisition/conversion audit: count actual inline membership openings, distinguish paid access from unpaid trials, separate paid recurring MRR from potential trial recurring value, and report verified two-day trial cohorts only after their actual trial end. Preserve the approved public presentation and existing private dashboard tokens/cards. No nurture campaign, email, billing/access change, deployment, or database migration application is part of this implementation.

## Before and after

- Homepage inline Join did not emit the existing join-page event. Each actual homepage membership opening now dispatches an opening UUID. Consented analytics records one `join_page_view` for that opening, with the existing session and attribution. Repeated clicks while already open do not dispatch another opening; Back followed by Join creates a new one. Initial direct `/join` and `/membership` arrivals retain their existing page tracking.
- Current `active`/`trialing` entitlements previously shared a paid label and estimated recurring MRR. The response retains the legacy entitlement field and adds paid-access, unpaid-trial, Stripe-trialing, and total-entitled counts. Active subscriptions contribute paid recurring MRR. Trialing subscriptions contribute potential trial MRR. A legacy starter with an observed positive payment remains paid access even while Stripe labels it trialing; its future recurring value remains potential. Plan labels alone do not identify an unpaid trial.
- Independent selected-date event totals previously produced a purported largest funnel drop-off. The dashboard now labels these as stage totals, without claiming an ordered cohort. It reports verified two-day trial starts, VIP activation, trials awaiting their end, ended trials, and first positive payments after the actual trial end. Only ended trials enter the trial-to-first-paid denominator; no ended trials produces an unavailable rate rather than zero. An ended trial without payment is descriptive, not a permanent failure claim.
- `trial_started` is emitted only after the existing Stripe-authoritative verified two-day monthly trial checks succeed. The event contains Stripe trial start/end and a stable subscription dedupe key. Unpaid/expired/mismatched checkout records do not emit a verified start or a payment event.
- Paid members requiring Discord/VIP setup and unpaid trials requiring setup are separate. Current live role checks override stale stored member labels when conclusive; unavailable role checks preserve uncertainty. Additive entitled pending/failed counts exclude historical associations and already recovered live VIP roles. Legacy association-count fields remain available.
- Role holders without recorded entitlement remain a review count because approved comps, staff, or other access may exist. No role is removed by this work.

## Affected files

- `analytics.js`, `membership-scene.js`: actual-opening event and consent-respecting deduplication.
- `cloudflare/kobes-checkout-worker.js`: verified starts, cohort summary, payment/status distinctions, MRR split and current VIP reporting.
- `pipeline/migrations/019_trial_conversion_reporting.sql`: retains every event name from migration 016 and adds `trial_started` to the exact `analytics_events_event_name_check` constraint, in a transaction; records the migration identifier.
- `admin-analytics.js`, `admin-analytics.html`: existing dashboard cards/tokens with corrected labels, stage totals and trial cohort panel, including loading/unavailable states. No stylesheet change.
- `index.html`, `join.html`, `membership.html`, `scripts/prepare-public-site.mjs`: cache-busted references to the changed analytics/membership scene code, preserving the remaining scripts, layout and public build whitelist.
- Focused regression coverage: `cloudflare/monthly-trial.test.mjs`, `cloudflare/trial-reporting.test.mjs`, `scripts/attribution.test.mjs`, `scripts/admin-date-filters.test.mjs`.
- `outputs/trial-reporting-audit-20261011/`: synthetic populated pending, mature and unavailable dashboard fixtures. Network access is blocked in the fixture; creator/retry actions are disabled. It contains illustrative counts, not production customer data.

## Verification

- 124 unique focused tests passed: 116 attribution, checkout, trial reporting, admin-date and campaign-link checks, plus eight public-build/disclosure checks. The final entitled-workflow regression and date-renderer rerun passed after the additional access label fix.
- Public whitelist build prepared successfully: 90 entries. No production deployment performed.
- `git diff --check` passed.
- Root agent performed actual browser verification on local preview port 4186: homepage Join → Back → Join preserved the inline URL/behavior at 1280px. Populated pending dashboard at 320px, 390px and 1280px fit the viewport; a hidden disclosure descendant was excluded from an initial containment false positive. Mature fixture showed four starts, three ended trials, two first payments and 66.7%; unavailable fixture explicitly showed unavailable data. No console errors were observed.
- Root saved pending screenshots in `docs/audits/evidence/2026-10-11-trial-reporting/pending-{320,390,1280}.png`; final screenshot review remains root-owned. The final access-field change alters counts only, not CSS or geometry.
- Browser localhost analytics intentionally avoids production event requests; the consent/deduplication/attribution POST behavior is covered by the focused VM tests. Production event receipt has not been verified.

## Limits and release status

Local only. Migration 019 has not been applied and must be applied before an authorized release starts writing `trial_started`. Earlier trials are intentionally not fabricated or backfilled; recorded cohort history begins when verified start events are available. Existing event-history pagination safety limits still apply and continue producing the existing completeness warnings. Consent-denied visitors are absent from site analytics; Meta ad clicks and consented site sessions remain distinct measurements. Cohort payments are observed through report generation, and billing retry/grace may produce later conversions.

The current dashboard response preserves existing field names and adds new fields; corrected paid-MRR semantics are intentional. Current status, plan label, paid-access history and recurring MRR are separate concepts. The live rolling-seven-day observation of 214 sessions, 84 join views, 15 offers, 10 Discord events, 10 checkout starts and one $10 first payment remains period totals, not an ordered trial conversion rate.

No emails were sent, no DNS/database/billing/access settings were changed, and unrelated audit/evidence files were preserved.

## Production follow-up — October 11, 4:41 PM MST

The user restored Supabase sign-in in Arc. Read-only production preflight found27 existing event names, zero unexpected names, zero omitted names and migration019 not applied. Applied the reviewed transaction, then a read-only query confirmed migration_recorded=true and verified_trial_event_allowed=true. Screenshot: evidence/2026-10-11-trial-reporting/migration-confirmed.png. No customer data, roles, billing or outreach changed.

Released the current GitHub-base checkout (HEAD19d61bc exactly matched origin/main) with retained live variables. Checkout Worker version cb003dca-63b1-4fd6-b92e-447a496d97d8; public whitelist build90 entries; public Worker version305518b6-6fbb-4812-8bf5-bbfeb5d1d33a. Actual live dashboard confirmed10 paid-access entitlements, zero unpaid trials, $296.91 paid recurring MRR and $32.99 potential trial recurring MRR from the legacy paid starter still in Stripe trialing status. Current three paid-without-Discord/VIP checks remain visible. No ended recorded two-day trial cohort exists yet, so no conversion rate is invented. Older trial starts remain excluded from prospective cohort history.

Live subscriber-service counts remain unavailable; this is still under investigation. Instagram/Meta/X tracking remains visible, with consented site sessions explicitly separate from Meta ad clicks. Current paid-access status is not the same measure as collected cash or monthly recurring revenue.

Final repeat mobile390 screenshot review showed the local fixture correctly contained after viewport reflow; the earlier clipped screenshot was captured during viewport reflow, not accepted as final visual proof. Browser interactions continue against production after release.

Operational follow-up: subscriber-stat retrieval now exposes only a bounded service status (unconfigured, authentication_failed, endpoint_missing, timeout, service_unavailable or available). No secret, headers, remote error body or subscriber data is included in the diagnostic. Seven focused trial-reporting tests pass, including service authentication, missing endpoint, timeout, success and non-blocking behavior. Checkout diagnostic version aa8e42a4-611d-4153-8c74-f06a3d6e4b8b. Live reason verification remains in progress.

## Subscriber-service release follow-up — October 11, 5:06 PM MST

Live bounded diagnostics identified endpoint_missing, not an inferred password failure. Redeploying current publisher code alone did not resolve the call. Cloudflare's same-zone Worker routing documentation requires a service binding for calls to another workers.dev Worker (https://developers.cloudflare.com/workers/configuration/routing/custom-domains/). Added PUBLISHER_SERVICE to the checkout Worker, retained the existing bearer authorization, and bound staging only to the staging publisher. No endpoint authorization or public exposure was broadened; no credentials were read or rotated.

The subscriber pending count now includes only pending/sending messages, excluding skipped unsubscribed entries. Thirty-one focused publisher/trial-reporting tests passed, including a skipped outbox row, private service binding, retained bearer header/date range, and no fallback network call when bound. Publisher version bc68cb92-5b92-44fc-8380-c2f4fd8cc4a3 and checkout version8c089455-7297-420f-aebb-be6211f454f7 are deployed with existing vars/bindings preserved. Actual live refresh confirmed the unavailable warning disappeared:5 active subscribers,3 selected-seven-day opt-ins,4 recorded form completions with pick available and12 provider-accepted pick emails sent. Sent is not a verified inbox-delivery claim. Pending total remains live; no automated email was triggered by this reporting check.

User asked whether a nonmember can receive a creator referral link. Verified existing createCreatorInvitation, creator activation, referralOwnerForCode and creator identity checks: creator codes are separate from active-member codes. Dashboard already exposes name/email invitation and tracked creator rows. User created his own invitation; no duplicate created, no OAuth login followed for the invitee, no payout/account/billing change. Screenshot creator-invite-panel.png contains only blank fields and explanatory context; private rows excluded.

Live subscriber panel screenshot live-subscriber-desktop.png records the restored aggregate counts and zero pending emails at an observed1000pxviewport. A new production viewport override attempt did not affect the authenticated existing tab; this screenshot is explicitly desktop evidence, not390px proof. Narrow320/390populated local dashboard fixtures were previously checked separately. No additional CSS change was made in this operational binding repair. A fresh production tab did not inherit the existing tab's authenticated session and was closed without extracting authentication data.

## Final responsive proof follow-up

Added responsive.html as a local-only iframe harness because the existing production browser tab did not respond to viewport overrides. Actual iframe layout viewports were independently observed:320px/320document,390px/390document,1280px/1280document. Overwrote the earlier provisional pending320/390screenshots with settled trial-cohort renders; mature1280shows4starts/3ended/2paid/66.7%, and unavailable390shows unavailable data without a fabricated rate. These are synthetic layout tests with blocked network sends, not production totals. Production subscriber-desktop proof remains separate. No public CSS or approved visual identity changed.

Release source validation: final combined checkout/monthly-trial/trial-reporting/attribution/admin-date/campaign-link/publisher run passed139tests. Private Supabase console screenshot and provisional pending1280capture remain local and are excluded from GitHub publication. All committed proof uses aggregate/synthetic data or blank form fields.
