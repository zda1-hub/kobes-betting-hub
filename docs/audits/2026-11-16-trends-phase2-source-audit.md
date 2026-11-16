# Trends-tool phase 2 source audit — November 16, 2026

## Requested change

Replace paid NBA game data with ESPN JSON, add NFL, college football, college basketball and NHL game-log analytics, and publish to new VIP channels at $0 monthly data cost. Keep the current Trends-tool intact until five-player NBA parity and each sport's live test post pass.

## Current deployed state

- Render worker `kobes-betting-hub` was **live** at commit `04f63c3f82e03dcd4bd80df811c4da72bdab7353` when checked November 16. This audit made no deploy or Discord changes.
- NBA Trends references `BDL_NBA_API_KEY` for BALLDONTLIE completed player stats, active players, games and injuries (`bot/trends/bdl-nba.js`, `bot/trends/nba-auto.js`, `bot/trends/nba-board.js`). BALLDONTLIE NBA ALL-STAR is listed at **$9.99/month** and is the tier whose player game stats are available. The owner previously authorized and reported paying it; current subscription status and renewal are not verified from the provider account. No key value was read.
- Current prop quotes and the private arbitrage test reference `ODDS_API_KEY` for The Odds API (`bot/trends/odds-api.js`, `bot/index.js`). The owner previously reported a **$30/month** Odds API charge. Current subscription status and renewal are not verified from the provider account. No key value was read.
- `OPENAI_API_KEY` is configured for other pick-intake/extraction work in this project; the Trends math and the NBA feed do not use it. Usage-based OpenAI cost is outside this data-source swap. Discord token and Supabase/database secrets are infrastructure, not sports-data subscriptions.
- Render's current tool access lists the service and deploys but does not expose environment variable names or vendor billing. The key names above are confirmed from the deployed source, while whether each secret is currently populated is unverified.

## Source and rights check

- ESPN Fan Support points to [Disney's US Terms](https://disneytermsofuse.com/english/). Those terms describe access as personal and noncommercial and prohibit business use and automated extraction without permission. Publicly reachable JSON and image URLs therefore do **not** establish permission for an automated paid-member Trends feed or commercial use of ESPN logos/headshots. No ESPN calls, parity run, member posts or live switch were made.
- [BALLDONTLIE NBA pricing](https://nba.balldontlie.io/) says free keys exclude Game Player Stats. A $0 BALLDONTLIE downgrade would remove the current NBA history needed for hit rates.
- [The Odds API terms](https://the-odds-api.com/terms-and-conditions.html) allow derived analytics and commercial display within their terms, but the current plan has a reported monthly charge. Cancelling it could also disrupt the separate arbitrage feature and is outside this request.
- A potential free commercial source, [Big Balls Sports Data](https://bigballsdata.com/about), advertises commercial use of its free tier. Its [NBA player game-log documentation](https://bigballsdata.com/docs/nba-player-stats) currently lists completed coverage only through 2025–26, not the current 2026–27 season. Its [changelog](https://bigballsdata.com/whats-new) says new free keys are limited to one declared sport and existing free keys lose temporary all-sport access November 24. Its November 11 entry also corrects earlier claims that player props were free; those require Edge. It cannot supply the requested durable four-sport free feed or an equivalent verified current NBA replacement today.
- [CollegeBasketballData terms](https://collegebasketballdata.com/terms) permit commercial use subject to quota, but this alone does not verify required player-game and current-prop coverage or solve the other sports.

## Verification and release decision

Five-player NBA L10 parity is **not run**; no authorized, equivalent $0 current-season feed was confirmed. Per-sport real-log tests and test-channel then live-channel posts are **not run**. The requested footer, channels, command options and schedules are **not deployed**. Existing production NBA/NFL Trends behavior was left unchanged. No paid plan was cancelled. The phase-2 $0 monthly data-cost target is **not met**; the reported current sports-data subscriptions total $39.99/month, pending provider billing confirmation.

## Unresolved input

Use a data source with explicit commercial rights, current-season per-player game logs, current availability, and enough free quota for the requested automatic cadence; or obtain ESPN's written permission for this specific commercial automated use. Verify an equivalent source against five real NBA players before any production switch. Logos and headshots need their own commercial-use rights.

## Revised November 16 scope and partial deployment

The owner then narrowed the request: preserve NBA, BALLDONTLIE and The Odds API; add NFL, CFB and CBB using nflverse and CFBD/CBBD only; no ESPN, NHL or scraping. The earlier section above is historical context.

- NFL game-log parsing now supports passing, rushing, receiving, receptions, rushing plus receiving, and touchdowns. The new provider computes season/L5/L10/L20, opponent, home/away, and alternate thresholds from completed nflverse games. The existing NFL auto-publisher still scans only the current Odds API alternate markets it already supports. Its content now includes the requested nflverse attribution and research footer. A real Josh Allen 2026 passing log check matched the direct calculation: over 199.5, 8/9 in the latest nine completed games. This is a calculation check, not a qualified current prop or Discord post.
- A separate Cloudflare D1 college cache module was added. It accepts only final CFBD/CBBD games, stores normalized player logs, reserves each upstream request atomically against a shared 900-call monthly ceiling, and reads `CFBD_API_KEY` only from Wrangler. The authenticated endpoints were deployed in Cloudflare Worker version `321f06c2-7536-4065-893c-0e295039dbca`. Public health returned ready; the unauthenticated status endpoint returned 401. The key is absent from production Wrangler secret names, so no college API request or live-log verification occurred. No college member feed is enabled.
- Focused Trends/college tests passed 90/90, including normalized stat math and the 900-call guard. Full `npm test` still exits nonzero in unrelated legacy tests. NFL/college test-channel and live-channel posts, college slash commands and daily auto-posting are not complete. No paid plan was changed. Added monthly data subscription cost is $0; current CFBD/CBBD usage is 0 calls, since the key is absent and no request was made.
- The Discord client showed the existing private NFL channel and the analytics category. It created only the requested new `🏈・cfb-high-hit-rates` (`1571961347892183166`) and `🏀・cbb-high-hit-rates` (`1571961526397702324`) channels there. Both displayed as private and listed VIP, Website VIP, and Kobe Bot. The category's current visible name is `📊・Trend ANALYTICS`, so no category rename was attempted. No test/live trend card was posted.

## Follow-up: cross-sport popularity, college commands and disposable NFL proof

The owner asked to proceed without `CFBD_API_KEY`. The private popular-trends scheduler now selects a measured exact-member combination from NBA or NFL, prioritizing the eligible sport with the larger same-day slate. NFL combinations require current exact quotes at one sportsbook, fresh nflverse game-week roster and injury releases, completed-game samples, and the existing descriptive rate checks. A shared daily receipt prevents separate NBA and NFL popular posts on one day. Five distinct KBH members must still request the exact combination; no sportsbook-wide popularity, combined price or parlay probability is inferred. College will not enter this publisher until real college logs, current player markets and availability rules pass a test-channel check.

The new `/prop`, `/player`, `/matchup` and `/ladder` commands have CFB/CBB sport options. They are VIP-only and currently return `College data coming soon` while Wrangler lacks `CFBD_API_KEY`. With a key, they read only cached completed-game logs; `/matchup` explicitly labels its team comparison as historical coverage, not a verified upcoming fixture. College read endpoints accept the bot's existing publisher secret, while only the existing Trends queue secret may trigger a refresh. The source API key remains in Wrangler only.

A new private `🧪・trends-test` Discord channel (`1571966609881309375`) was created in the existing analytics category with Kobe Bot access. The admin-only `/trends-test-nfl` action can select a real upcoming NFL quote and verified player, send a clearly labeled disposable TEST card, fetch it to verify delivery, delete it, and record the deletion. It may bypass the normal hit-rate threshold and 90-minute window for this private proof; it does not relax quote freshness, player identity or injury checks. Until an actual run returns `verified_deleted`, no end-to-end production proof has occurred.

The focused Trends and college suite passed 97/97. A successful build or synthetic send test does not establish a real NFL Discord receipt, real CFB/CBB source parity or any college live post. Added monthly data cost remains $0 and the key remains absent, so college upstream calls remain 0.

The live NFL proof then selected Kimani Vidal from a current quote and sent TEST message `1571968094161862787` to `🧪・trends-test`. The bot fetched and matched the content and called delete. Discord's visible channel showed no remaining public TEST card, but a cached post-delete fetch caused the first audit receipt to say `needs_cleanup`. The reconciliation fix uses an uncached Discord fetch and never sends another test card; its live result must be checked before marking the receipt verified deleted.
