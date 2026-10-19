# Retire the $5 first-month promotion — October 19, 2026

## Request and scope

The owner asked to restore the website without the $5 promotion and verify padding and responsive fit. This release returns the homepage and membership scene to the existing two-day trial and $32.99 monthly plan. The approved KBH artwork, blue actions, plan toggle, referral flow and longer-term plans remain in place.

## Before and after

- Before: the live `/join?deal=first20` page displayed a limited-offer banner and `Start for $5`; the homepage and ordinary membership arrivals also featured that promotion. The checkout Worker accepted eligible first20 requests, and the publisher could add the offer to emails.
- After: remove the banner script and promotional CSS from the public build. `/join`, `/membership`, and old `?deal=first20` links show `Start 2 days free` and `2 days free, then $32.99 billed monthly until canceled`. The checkout Worker returns `retired` for the promotion and rejects new discounted preparations, direct sessions and previously prepared Discord associations before creating a Stripe session. Promotion-only email outbox entries are skipped; ordinary subscriber emails use the standard trial terms.
- The old Stripe coupon is retained as a historical billing record. The application no longer creates new checkout sessions with it. Existing already-created Stripe Checkout sessions were not inspected or expired in this release.

## Affected files

- Public route HTML: `index.html`, `join.html`, `membership.html`.
- Public behavior and styling: `membership.js`, `membership-scene.css`, `hub-slip-backdrop.js`; removed `first20-feature.js` and `offer-cta.css` from the explicit public build whitelist in `scripts/prepare-public-site.mjs`.
- Services: `cloudflare/kobes-checkout-worker.js`, `cloudflare/bettinghub-publisher.js`.
- Billing and publisher regression checks: `cloudflare/first20-launch.test.mjs`, `cloudflare/bettinghub-publisher.test.mjs`, `scripts/membership-checkout.test.mjs`; removed the obsolete banner test.

## Verification before publication

- Focused checkout, membership and publisher tests: 39 passed. `node --check` passed for the changed JavaScript. The public build prepared 98 whitelisted entries; `git diff --check` passed.
- Rendered the built local homepage and direct membership route at 320px, 390px and 1440px. No horizontal page overflow; the header was first, at top 0, and the ticker began at its bottom after scrolling to page top. The promo banner count was zero and visible page text contained no `$5`.
- Membership button text range stayed inside its symmetric 24px horizontal padding at all three widths. The 320px `Back to the Hub` action, menu and Discord icon fit in the compact header. The annual toggle updated its checkout target, `What's included` opened, and the primary action showed the local preview message without starting checkout. No page errors were observed.
- The approved orange member-card artwork, orange/black longer-run poster and blue CTA treatment match the pre-change composition. The specific visible change is the removal of the promotion above the card; no global typography or palette reset was made. Evidence: `evidence/2026-10-19-retire-first20/before-live-join-390.png`, `join-{320,390,1440}.png`, and `home-{320,390,1440}.png`.
- No real Stripe payment or Discord authorization was completed. Live service and custom-domain checks are pending deployment.

## Publication status

Published from merged PR [#253](https://github.com/zda1-hub/kobes-betting-hub/pull/253), commit `932897d`, with `--keep-vars`. The checkout Worker deployed first as version `5512e8d5-ed6a-46e5-aade-7f0beaf0b2b8`; the publisher followed as `eaeb8ecd-daf5-43cc-ba9e-3a0f83eef7a9`; the public site followed as `b65f87a9-f6c8-4b3a-a323-60943a8fa438`. Existing bindings, secrets and schedules were preserved.

- Live `GET /promotions/first20` returned `{ "state": "retired", "ready": false }`. Live `POST /checkout/prepare` for `first_month_back` plus `first20` returned HTTP 400 without a checkout URL.
- The publisher `/health` returned `ready`, `xConnected`, `freePickReady` and `socialEmailReady`. No promotional email was sent for verification.
- Fresh custom-domain browser checks on `/` and `/join?deal=first20` at 320px, 390px and 1440px showed no visible $5 copy or promo banner, no horizontal page overflow, header at top 0 and ticker immediately below it. The old promotion URL displayed `Start 2 days free` with `data-checkout="monthly"` and no deal attribute. No page errors were observed.
- The live 390px member-card image loaded and the full membership screen visually matched the local proof; the original orange artwork, action padding and poster composition remained intact. Live evidence: `evidence/2026-10-19-retire-first20/live-home-390.png` and `live-join-390.png`.
- A completed real checkout was not attempted. The historical Stripe coupon and any Stripe Checkout session created before retirement were not deleted or expired; the app rejects new discounted preparations and associated checkouts.
