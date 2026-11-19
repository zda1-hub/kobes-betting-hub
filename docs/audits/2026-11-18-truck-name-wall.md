# Road to the Cybertruck name wall — 2026-11-18

## Requested change

Add a zero-start paid-referral name wall, `/truck` page, tier roles and channels, an in-server explainer, staff setup and removal commands, fraud-review flags, weekly leaderboard and X milestones. Keep payout, prices, VIP access and pick posting intact. Do not deploy or activate before review.

## Scope and behavior

- New files: `cloudflare/migrations/002_truck_name_wall.sql`, `cloudflare/name-wall.js`, `pipeline/name-wall-sync.js`, `bot/lib/truck-wall.js`, `bot/truck-wall-setup.js`, `truck.html`, `truck.css`, `truck.js`, photo and attribution.
- Existing interfaces: Cloudflare publisher routes, existing road-to-truck cron and command registry, public-site build whitelist. No checkout or payout code changed.
- D1 migration starts empty. `/truck-setup` creates the activation timestamp only when `NAME_WALL_ENABLED=true`; older referrals and memberships never enter the wall. Public progress starts at `spot 0 of 200`.
- The cron reads signed-webhook-derived referral, billing and membership tables. A referral qualifies after a successful first paid month with an active subscription and either a second successful payment or 30 days since first payment. Cancellations, refunds, review holds and self-referrals do not qualify. D1 keeps one attribution per customer.
- Public `/truck` returns only display names and tiers. Hidden names appear as `anonymous rider`; contact details do not enter D1. The photo credit names Mr.choppers and CC BY-SA 3.0.
- `NAME_WALL_ENABLED=false` disables wall sync, commands, Discord delivery and public live data. `ROAD_TO_TRUCK_ENABLED=false` independently stops the X and Discord scheduler, including milestones.
- The exact welcome line was added to open PR #493 because the welcome flow is not yet on `main`. This PR depends on that PR for the welcome hook.

## Verification

- `node --test bot/lib/truck-wall.test.js cloudflare/name-wall.test.mjs pipeline/road-to-truck.test.js cloudflare/road-to-truck.test.mjs`: 20 passed, 0 failed.
- `npm run build:site`: passed; `/truck` is in the public build whitelist.
- Populated local `/truck` preview checked at desktop, 390px and 320px. The 320px hero width was fixed and the mobile menu opened with its links visible.
- `npm test`: 1,280 total, 1,261 passed, 8 failed. The same 8 unrelated tests fail on clean `origin/main` (1,271 total, 1,252 passed, 8 failed). No new failures.
- `node bot/truck-wall-setup.js --dry-run`: zero writes. Full JSON output in [truck-wall-dry-run.json](truck-wall-dry-run.json), including role colors, channel permissions, empty wall, explainer and announcement preview.
- Local dry run cannot confirm live bot permissions because `DISCORD_TOKEN` and `DISCORD_GUILD_ID` are absent locally. The live setup checks Manage Roles, Manage Channels and Manage Messages and refuses to write when missing. Run the same dry run in a bot environment before go-live.

## Go-live steps, in order

1. Review and merge PR #493, then this PR. Deploy the public site, the publisher Worker and existing Render bot/cron with `NAME_WALL_ENABLED=false` and `ROAD_TO_TRUCK_ENABLED=false`. Apply `cloudflare/migrations/002_truck_name_wall.sql` to publisher D1.
2. In the shared Render `kbh-road-to-truck-controls` environment group and the publisher Worker, set `NAME_WALL_ENABLED=true`. Ensure the existing `ROAD_TO_TRUCK_SECRET` matches on both, and the bot has `TRUCK_PUBLISHER_URL`, `DISCORD_TOKEN`, `DISCORD_GUILD_ID`, `AUDIT_CHANNEL_ID` and `DATABASE_URL` where needed. Optional: `TRUCK_STAFF_ROLE_IDS` (comma-separated) and `ROAD_TO_TRUCK_PING_EVERYONE=true` (default false). No new paid service or new API key is needed.
3. Run `npm run truck-wall:dry-run` in the bot environment; confirm Manage Roles, Manage Channels and Manage Messages are true, the bot role is above staff/VIP and the four new roles, and the target announcement channel is correct. If anything fails, keep the flag off and fix it first.
4. A staff administrator runs `/truck-setup` once. It creates/reconciles roles and channels, pins the explainer, starts progress at zero and posts the one-time announcement. Rerunning reconciles existing resources without duplicate roles, channels, pin or announcement.
5. Check `/truck`, `/mytier`, `/wallhide`, the pinned explainer, channel visibility and the private admin log. Only after those pass, set `ROAD_TO_TRUCK_ENABLED=true` if the already-approved road-to-truck scheduler should run; this switch is independent of wall setup.

## Limits

- The local preview and tests are not live Discord verification. Permission and announcement-channel checks still require a bot-authenticated dry run.
- The explainer attributes the mid-2027 production timeline to Musk using “elon says”; source links sit beside the copy in code. `#road-crew` promises chat, truck updates and shoutouts, with no early-pick timing promise.
- The referral scan fails with a clear error at 2,000 post-launch rows rather than silently truncating; add pagination before that scale.
- At initial PR review, no public page, bot resources or scheduled posts had been deployed. After merge, `/truck` and the publisher were deployed with both switches false; the D1 wall tables remain empty.

## Live-guild preflight follow-up

After merging #493 and #497, the bot-authenticated dry run reported Manage Roles, Manage Channels and Manage Messages all true, bot highest role position 7, and a protected-role placement ceiling of 3. The original setup incorrectly treated the lack of four *empty* lower slots as a blocker. New roles can be inserted at positions 1–4, shifting existing roles up while preserving their relative order. The follow-up changes the setup to do that and verify the final hierarchy before creating channels or posting. No truck role, channel, pin or announcement was created during the preflight.
