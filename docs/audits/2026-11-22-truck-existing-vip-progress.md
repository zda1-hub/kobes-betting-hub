# Truck progress includes current paid VIPs — November 22, 2026

Requested change: the next Road to the Cybertruck card should reflect current VIPs, including those already paid before the wall launched. Today's 10 AM MST card had already posted at spot 0; do not repost it. The user clarified that the number, rather than member names, should appear.

Affected files: `pipeline/name-wall-sync.js`, `cloudflare/name-wall.js`, `bot/lib/truck-wall.js`, `truck.html`, and focused tests.

Before: the wall progress query excluded every subscription and paid invoice before the launch timestamp. After: progress counts distinct current active paid customers with a positive signed Stripe invoice and no refund or dispute, including pre-launch customers. Referral names and tiers still require post-launch qualified referrals. A pre-launch count cannot trigger retroactive X milestone posts. The pinned explainer and public page describe the updated scope.

Verification: focused wall/source/setup tests and the public `/truck` display should be checked after deployment. The signed-payment database showed 11 active paid customers when checked at 10:22 AM MST; one additional historically paid customer was `past_due` and is excluded. The user's 12-person estimate is not hardcoded.

Release state: local candidate; not published until merge, publisher Worker and Render cron deployment, a sync, and live page/card verification.

## Release follow-up — November 22, 10:31 AM MST

PR #508 merged as `34627b21c8c8f737fd92de2f6aabc69837ada96c`. The publisher Worker deployed as version `bb763fc1-8ab7-40dd-a0cb-fc70db6e0331`; the public-site Worker deployed as `87217823-b705-434e-8b80-fa97fb2c578a`. Render cron deploy `dep-dc1ibgvb9u1s738b1rb0` and bot deploy `dep-dc1ibgnb9u1s738b1p60` reached live on that commit. The 10:30 AM MST cron completed with `posted:0`, `truck-daily-2026-11-22: already_handled`, and `spot:11`. The public wall API returned `spot:11` with no referral names, and remote D1 showed no milestone rows, so no retroactive 10-spot post fired. The next scheduled daily card is November 23 at 10 AM MST; its actual count will be read again at posting time. The live public HTML serves the updated progress description.
