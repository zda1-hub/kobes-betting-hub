# Truck progress includes current paid VIPs — November 22, 2026

Requested change: the next Road to the Cybertruck card should reflect current VIPs, including those already paid before the wall launched. Today's 10 AM MST card had already posted at spot 0; do not repost it. The user clarified that the number, rather than member names, should appear.

Affected files: `pipeline/name-wall-sync.js`, `cloudflare/name-wall.js`, `bot/lib/truck-wall.js`, `truck.html`, and focused tests.

Before: the wall progress query excluded every subscription and paid invoice before the launch timestamp. After: progress counts distinct current active paid customers with a positive signed Stripe invoice and no refund or dispute, including pre-launch customers. Referral names and tiers still require post-launch qualified referrals. A pre-launch count cannot trigger retroactive X milestone posts. The pinned explainer and public page describe the updated scope.

Verification: focused wall/source/setup tests and the public `/truck` display should be checked after deployment. The signed-payment database showed 11 active paid customers when checked at 10:22 AM MST; one additional historically paid customer was `past_due` and is excluded. The user's 12-person estimate is not hardcoded.

Release state: local candidate; not published until merge, publisher Worker and Render cron deployment, a sync, and live page/card verification.
