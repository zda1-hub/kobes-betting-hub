# Discord first-five membership offer — November 11, 2026

## Request and scope

The owner requested a $5 first month for the first five eligible KBH Discord members, renewing at the existing $32.99 monthly price. An earlier $5 first-20 promotion remains retired. X follows and post interactions are not eligibility conditions because X prohibits compensated or coordinated engagement.

## Changes

- `cloudflare/kobes-checkout-worker.js`: validates a new Stripe coupon for $27.99 off one invoice with a five-redemption cap against the active $32.99 monthly price. The normal Discord-first checkout checks existing server membership and rejects previously linked VIP customers before creating a discounted session. The legacy direct checkout cannot apply this deal. Existing trial, historical and referral offers remain separate.
- `membership.js`: on `/join?deal=discord-first5`, shows $5 today, $32.99 monthly renewal, no free trial, card requirement and redemption limit. Checks current offer status before enabling checkout and includes the deal code only for this CTA.
- `membership-scene.js`: changes the existing card's accessible checkout label for this deal so it does not announce a free trial.
- `index.html`, `join.html`, `membership.html`: bump membership script versions to avoid stale cached checkout behavior.
- `cloudflare/discord-first5.test.mjs`: verifies the open/filled coupon status and direct-checkout rejection.
- `scripts/membership-checkout.test.mjs`: verifies the promo terms and deal code on the Discord-first handoff.

## Verification and limits

The Cloudflare Worker test suite passed 222/222, the membership checkout test passed 13/13, and the public build prepared 117 entries. Local rendered screenshots at 320px, 390px and 1440px showed the existing KBH layout and readable offer text. A live 390px screenshot showed the active $5 CTA; the initial screenshot exposed stale trial wording in the status message, which was fixed and redeployed. The live site serves the revised script and the Worker status reports `open` with $5 first month, $32.99 renewal and a five-redemption limit. The Worker version is `e88d0a45-c2f8-4432-8751-9d9986504fa3`; the final site version is `85993cbe-52d8-491a-baf5-9b8bf59d82d8`.

The Stripe coupon was created in KBH's live Stripe account as `kbh_discord_first5_20261111`, $27.99 off once, 0/5 redemptions at setup. The five-use limit is Stripe's redemption cap; it does not count five distinct completed payments. No actual card charge or full Discord-to-paid purchase was made during verification. The promo has not been announced publicly.
