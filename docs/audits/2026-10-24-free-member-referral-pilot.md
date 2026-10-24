# Free-member referral pilot — October 24, 2026

## Request

Let eligible free Discord members share a tracked $20 referral link without buying VIP, while protecting the Hub against self-referrals and premature or duplicate cash rewards. Preserve the existing VIP referral flow and public visual design.

## Affected files and behavior

- `pipeline/migrations/020_community_referral_pilot.sql` adds a verified-contact field, original free/VIP referrer kind, an operator-review record and a database constraint blocking a free-member payout state without review.
- `cloudflare/kobes-checkout-worker.js` issues one link to a verified Discord guild member after seven days and a US/21+ attestation. Free-member rewards require a new customer's first full $32.99 monthly payment, seven-day hold, payment/refund/dispute and identity checks, ready Stripe recipient and an authenticated admin review. The daily payout pass rechecks payment and identity before any transfer. A flag disables new free-member issuance without invalidating existing earned rewards.
- `refer.html`, `referral-production.js`, `referral.css` add the attestation and clear public rules while retaining the original page composition. The local preview cannot start OAuth or payouts.
- `admin-analytics.html`, `admin-analytics.js`, `admin-analytics.css` add the private review queue and recorded approval action.
- `bot/lib/referral-card.js` and `bot/index.js` keep the existing VIP card unless Render's separate `FREE_MEMBER_REFERRALS_ENABLED=true` switch is set. The free-member card then points to the attestation page. Do not enable that switch before the public flow is verified live.
- `pipeline/migrate-production.js` pins the migration checksum.

## Verification

- 115 focused checkout, referral payout, bot referral and migration tests pass. The new admin route test covers unauthorized access, an enriched private queue, unfinished hold, one successful approval and refusal to approve twice. Simulated payout tests prove an unreviewed free-member reward sends nothing; an approved reward still undergoes fresh checks and can pay at most once.
- Public-site build prepared 111 entries. Local browser inspection at 320px, 390px and desktop found no horizontal overflow and the referral controls stayed within the approved composition; the checkbox action was exercised. This is visual evidence for the logged-out preview only, not a live OAuth proof.
- Production Supabase ledger had no `020_community_referral_pilot` row and no new review columns before release. The additive migration was then applied in the production SQL Editor and its ledger row was observed at `2026-10-24 23:06:58.478955+00`; a fresh query found all four new reward columns. No production payout, free-member link or announcement was made.
- The complete repository test command could not provide a clean gate in this checkout: optional `discord.js` dependencies are absent and the existing sitemap test expects fewer URLs than the current public sitemap. Focused tests and build were run independently.

## Release sequence and limits

Apply migration, deploy checkout Worker with the flag off, deploy the public page and private dashboard, verify VIP referrals and the free-member flow with a real eligible test Discord account and no purchase, then enable issuance. Deploy the updated bot card only after live verification. Never represent preparation as a running program.

The controls reduce fraud risk; they cannot guarantee zero fraud or prevent a dispute after the seven-day hold. $20 is about 61% of the first $32.99 charge before fees and support. Monitor retained paid members and total reward cost before broad promotion.
