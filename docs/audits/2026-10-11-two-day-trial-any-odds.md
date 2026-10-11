# Two-day monthly trial and unrestricted source odds — October 11, 2026

## Request and design contract
The user requested a $32.99 monthly membership with a two-day free trial in Stripe and on the website, and publishing picks regardless of source odds. The subsequent request explicitly preserves the same orange KBH membership artwork. Continue creator research separately; this release does not send outreach.

## Before and after
- New standard monthly checkout previously charged $32.99 immediately. Both the Discord-associated checkout and existing checkout endpoint now request a two-day Stripe subscription trial on the same recurring monthly price. Card collection remains required, and missing payment methods cancel at trial end.
- Verified completed two-day monthly trials now activate VIP immediately. Exact Stripe checkout/subscription identity, offer, price, amount, currency and trial dates are checked. Abandoned/unpaid/expired or mismatched trial checkouts remain ineligible.
- Trial activation does not record a payment, Meta purchase, or paid referral reward. The first actual paid invoice is recorded even when the trial already activated VIP. Referral qualification, seven-day hold, refunds, disputes and duplicate identity protections remain intact.
- Trial confirmation and welcome email distinguish $0 today from a paid membership. Website membership, landing offer, free-pick upsell, FAQ, terms and referral rules disclose the new trial and subsequent renewal.
- Membership artwork, CSS, palette, layout, six-month/annual and paid seven-day choices are preserved. Script version queries invalidate old offer copy across public pages. Retired first-month scripts no longer override the current offer.
- Removed approval-route and manual-channel ±200 odds restrictions. Manual published_odds is optional and has no artificial min/max. Existing approval, research, event/source verification, media and authorization safeguards remain.

## Affected files
Checkout worker and its tests; bot commands/index and odds tests; membership-scene.js, membership.js, site.js, free-pick.js, welcome.js; index/join/membership/free-pick/refer/FAQ/terms and public script-version references. Removed the obsolete writeup-odds helper/tests; replaced with coverage of actual command definitions and rendering. The public build remains the explicit scripts/prepare-public-site.mjs whitelist.

## Verification before publication
- 95 targeted checkout, signed webhook, identity, cancellation, referral, welcome, disclosure and any-odds checks passed.
- Broader bot/Cloudflare/membership checks: 522 tests, 518 pass, 3 skip, one existing failure. The failing archived-writeup redaction assertion expects “8 targets” but the current parser renders “targets: 8.” Reproduced the identical failure from clean origin/main 6572945; no related source was changed.
- Fresh isolated preview on 127.0.0.1:4182. Inspected populated membership at 320px, 390px and 1440px; checked annual toggle, Join/Back continuity and monthly trial action. No horizontal page overflow; trial button has 24px left/right text padding at all three widths; shared header top is 0. Local CTA explicitly confirms no checkout/charge was opened.
- Existing artwork files unchanged. No CSS or motion redesign. Screenshots in evidence/2026-10-11-two-day-trial/.
- Public build passed; git diff --check passed.
- The signed mocked trial lifecycle proves role grant, duplicate-event idempotency and cancellation removal; no real person was charged or enrolled for testing.

## Release status
Prepared locally from latest origin/main 6572945 in an isolated managed worktree. Publication and real Stripe checkout verification pending; append exact release results below.

## Published verification follow-up
- Checkout worker deployed to production: ecbeaae9-f401-4710-a18d-8b306413932c.
- Public site deployed from the explicit 90-entry whitelist: 89d0d4d9-60f3-4dbf-8546-9e65de42289a.
- Created one unpaid live monthly checkout through the existing public endpoint. In the actual Stripe-hosted page, verified “2 days free”, then $32.99 per month starting October 13, 2026; Stripe's read-only order summary confirmed live mode, USD and totalAmount 0. No email/card was entered, no trial was submitted, and no real subscription/customer charge was created. Closed the temporary checkout tab.
- Production smoke passed 5/5: checkout health, publisher health, current free-pick API, public free-pick page and client asset.
- Actual production /join displays the new trial terms alongside the unchanged orange KBH artwork.
- 95 affected-flow tests passed after the welcome confirmation wording fix. Trial confirmations explicitly say free trial/$0 today and do not claim a paid purchase.
- GitHub publication and Render bot restart pending at this point; append the final commit/deployment after verification.
