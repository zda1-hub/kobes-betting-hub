# Trends-tool integration status — November 14, 2026

## Live Discord setup and next release candidate

- Created the private `📊・LINEMATE ANALYTICS` category in the KBH guild (`1215407647155683358`). Its six private channels are `popular-trends` (`1571283801592827945`), `🏀・nba-high-hit-rates` (`1571285528882450623`), `🏈・nfl-high-hit-rates` (`1571285640409256056`), `⚾・mlb-high-hit-rates` (`1571285735867424931`), `🏒・nhl-high-hit-rates` (`1571285798827851887`), and `🔎・prop-search-engine` (`1571285899717771365`). Each was created with the existing VIP and Website VIP roles. The new channels contain no trend posts.
- `/trends-nfl` is live in `🔎・prop-search-engine`. It requires a VIP role or administrator access and privately returns completed-game season/L5/L10/L20 counts with source attribution. The user-entered threshold is not represented as a live sportsbook line, recommendation or probability. Render deploy `dep-dbsdptm7bikc73f08qpg` reached live and a Discord command run returned the sourced Josh Allen result privately on November 14.
- This branch adds free nflverse current-roster and injury-report context, two optional alternate threshold comparisons, and recent game-by-game values. The new code is not yet deployed. A missing or stale injury report remains unknown; no game-day availability is inferred. No NBA/MLB/NHL search or automatic trends publisher is exposed.
- The NFL sample minimum was corrected from 20 to 8, because a 20-game current NFL season sample would exclude all regular-season players. This only affects the draft qualification calculation; it does not turn on automated posts.
- The 2026 nflverse stats, schedule, roster and injury releases were fetched read-only on November 14. A local end-to-end check of Josh Allen over a *user-entered* 225.5 passing-yard threshold yielded 6/8 completed-game hits; the roster feed showed BUF/QB/ACT from week 10, while his current injury status remained unknown because no matching report row was present. The price and game-day availability were not verified and this sample was not posted as a recommendation.
- `node --test bot/trends/*.test.js`: 27 pass on this branch. The prior full `npm test` run had 1,113 pass and 8 failures in untouched ESPN/source recovery and public-site tests; review before release. A local Node network fetch failed TLS in the workstation environment; the live Render command successfully fetched nflverse stats and schedules.

## What is in this checkout

- Integrated Dot's tested calculation, fail-closed qualification, combination warning, Pacific daily-plan, and additive Discord provisioner modules into `bot/trends/`. The private category and six channels above have since been created.
- Named the tool **Trends-tool**. The proposed category stays `📊・LINEMATE ANALYTICS` per the supplied specification. Discord channel names cannot contain spaces, so the requested “popular trends” channel is `popular-trends`.
- Added a read-only current alternate-prop odds adapter for The Odds API. It requests one event at a time, sends the API key in a header, and keeps the bookmaker's actual price and update time. It does not fetch until invoked with a configured key.
- Added a read-only NFL historical game-log adapter for nflverse weekly player stats. It joins to completed regular-season schedules and ignores missing stats. No roster or injury status is inferred from those logs.
- Added a popular-card builder that refuses to format a card without at least five distinct, measured KBH searches for the exact combination, same-book current lines, verified availability, and sourced game logs. It displays sample counts, not a 100% certainty claim or made-up parlay payout.
- The owner confirmed the midnight planning timezone as **America/Los_Angeles**. The planner remains disabled and makes no posts.

## Verification

- The initial foundation had 21 passing tests (including Dot's original 14). The live slice had 24; this branch has 27.
- A read-only fetch of the 2026 nflverse release and schedules returned 137 completed regular-season games and eight completed rows for an example player on November 14. This confirms a current file exists; it does not verify game results or a current player roster independently.
- The local Node `fetch` attempt failed with `ERR_SSL_WRONG_VERSION_NUMBER`, while the Python read-only source check succeeded. The deployed Render runtime returned the historical NFL search result; roster and injury fetches must be verified after this branch is deployed.
- Only the newly requested private Discord category/channels have been created in the server. No existing channel, production data, database migration, or automated post has been changed.

## Free-source and rights findings

- [The Odds API free tier](https://the-odds-api.com/) currently lists 500 credits per month, all sports and markets, but not historical odds. The existing KBH arbitrage monitor logged 5,880 used and 14,120 remaining at 2026-11-14 21:26 UTC, consistent with a 20,000-credit monthly plan. Trends-tool has not spent this quota. Event-level alternate props would draw from the same shared balance; reserve monitoring capacity before enabling them. No new subscription was purchased.
- [BALLDONTLIE's NBA table](https://docs.balldontlie.io/) says its free tier includes teams, players and games but excludes game player stats, injuries, and player props. It cannot supply NBA hit rates on the free plan.
- [The Odds API terms](https://the-odds-api.com/terms-and-conditions.html) permit some commercial display and derived analysis, but prohibit selling the provider's data as the primary product or raw feed. Because a paid Trends-tool could resemble a data product, obtain a provider interpretation before member-facing redistribution.
- [nflverse's licensing statement](https://github.com/nflverse) says most `nflverse-data` releases are CC BY 4.0 with attribution, while underlying third-party rights remain the user's responsibility. The 2026 weekly player stats and completed-game schedules were fetched for local research only; commercial publication still needs a source-rights review and visible attribution.
- ESPN/NBA public pages are not licensed commercial data feeds merely because they are accessible. The existing ESPN trends path is separate and must not be silently promoted as Trends-tool coverage.

## Remaining before release

1. Deploy this branch and verify the new roster/injury context and alternate threshold output in the existing private search command. Existing channels, roles and permissions remain untouched.
2. Confirm provider redistribution rights for the paid Trends-tool use case. Select licensed current player-game-log sources for NBA, MLB and NHL; BALLDONTLIE free NBA does not include player stats. Keep the existing Odds API quota reserved for arbitrage until a Trends-tool budget and consumption gate are in place.
3. Add a durable database for normalized data, observed KBH searches, source timestamps, per-market publication receipts, and daily idempotency. Never synthesize popularity or use test fixtures in production.
4. Add verified game-day participation and current odds to NFL, plus player/team matchup analysis. The new comparisons are historical threshold comparisons only. Add durable search telemetry before calling any combination popular. Build bet-builder views only for verified coverage. The popular card formatter is not a live search tracker or publisher.
5. Add the midnight Pacific worker with a database lease, retries and late-market checks. Recheck current market, participation, roster and injuries just before every post or edit; retract unavailable or started props. Do not enable automatic posts before these checks work end to end.

This is a private Discord shell and a live NFL historical research command, not a completed multi-sport Trends-tool. The automated publisher remains off.
