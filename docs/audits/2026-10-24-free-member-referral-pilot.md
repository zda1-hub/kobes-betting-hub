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

The planned order was migration, checkout Worker with issuance off, public page and private dashboard, live verification, then the issuance and bot switches. A real eligible free-member OAuth session was unavailable during this rollout; see the follow-up for the precise live checks and remaining limit. Never represent preparation as a running program.

The controls reduce fraud risk; they cannot guarantee zero fraud or prevent a dispute after the seven-day hold. $20 is about 61% of the first $32.99 charge before fees and support. Monitor retained paid members and total reward cost before broad promotion.

## Production rollout follow-up — October 24, 2026

- PR #325 was merged into `main` at `9fdc624f2217c7b87ad844bad32f0856962908f3`. Render auto-deployed that commit successfully before the bot switch was enabled.
- The checkout Worker was deployed with the switch off, then the public-site Worker published the changed referral and private dashboard assets. After the production migration and live page checks, Cloudflare production variable `FREE_MEMBER_REFERRALS_ENABLED` was set to `true` using the dashboard's deploy action. Its production settings visibly show `true`; the resulting checkout Worker health endpoint returned HTTP 200. `wrangler.jsonc` now declares the same production value so a future source-based deployment preserves the setting; staging retains its default-off state.
- Render's existing `kobes-betting-hub` background worker was the only service in the connected workspace and was running the same merged commit. Its `FREE_MEMBER_REFERRALS_ENABLED` variable was merged without replacing other variables. Redeploy `dep-dbejn7vb9u1s739uvbj0` finished `live`; logs show `Logged in as Kobe Bot#1343` and `Referral information card receipt: {"status":"UPDATED","messageId":"1550997694372118529"}`.
- In the live `#💸・refer-and-earn` channel, Kobe Bot's existing card now states that seven-day free-server members and VIPs can connect for one link, no VIP purchase is needed to share, and free-member rewards need manual approval after a full $32.99 month and seven-day hold. The public `/refer` page loads with the US/21+ attestation and current terms. The referral login starts Discord OAuth; the private community-review endpoint returns HTTP 401 without an admin session.
- No real free-member OAuth callback, referred checkout, Stripe renewal, payout recipient setup or payout was performed during the smoke test. Those paths have focused automated tests but remain unverified end to end with a real eligible free-member account. The program is live for issuance, with financial release still held for authenticated manual review and guarded payout checks.
