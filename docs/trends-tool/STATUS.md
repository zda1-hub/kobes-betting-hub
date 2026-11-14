# Trends-tool integration status — November 14, 2026

## Live Discord setup and release candidate

- Created the private `📊・LINEMATE ANALYTICS` category in the KBH guild (`1215407647155683358`). Its six private channels are `popular-trends` (`1571283801592827945`), `🏀・nba-high-hit-rates` (`1571285528882450623`), `🏈・nfl-high-hit-rates` (`1571285640409256056`), `⚾・mlb-high-hit-rates` (`1571285735867424931`), `🏒・nhl-high-hit-rates` (`1571285798827851887`), and `🔎・prop-search-engine` (`1571285899717771365`). Each was created with the existing VIP and Website VIP roles. The new channels contain no trend posts.
- Added `/trends-nfl` as a private, historical NFL player-stat search in `🔎・prop-search-engine`. It requires a VIP role or administrator access, uses a full player name, stat, side and user-entered threshold, and returns completed-game season/L5/L10/L20 counts with source attribution. It does **not** represent the supplied threshold as a live sportsbook line, recommendation or probability. This command is in the branch pending deployment.
- The bot has not yet been deployed or the command verified in the live Discord application. No NBA/MLB/NHL search or automatic trends publisher is exposed.
- The NFL sample minimum was corrected from 20 to 8, because a 20-game current NFL season sample would exclude all regular-season players. This only affects the draft qualification calculation; it does not turn on automated posts.
- The 2026 nflverse source files were fetched read-only on November 14. A local end-to-end check of Josh Allen over a *user-entered* 225.5 passing-yard threshold yielded 6/8 completed-game hits, with source and date attached. The price, roster and injury status were not verified and this sample was not posted.
- `node --test bot/trends/*.test.js`: 24 pass. `npm test`: 1,113 pass, 8 fail in existing unrelated ESPN/source recovery and public-site tests; review before release. A local Node network fetch still fails TLS in this workstation environment, so hosting-runtime fetch must be checked after deployment.

## What is in this checkout

- Integrated Dot's tested calculation, fail-closed qualification, combination warning, Pacific daily-plan, and additive Discord provisioner modules into `bot/trends/`. The private category and six channels above have since been created.
- Named the tool **Trends-tool**. The proposed category stays `📊・LINEMATE ANALYTICS` per the supplied specification. Discord channel names cannot contain spaces, so the requested “popular trends” channel is `popular-trends`.
- Added a read-only current alternate-prop odds adapter for The Odds API. It requests one event at a time, sends the API key in a header, and keeps the bookmaker's actual price and update time. It does not fetch until invoked with a configured key.
- Added a read-only NFL historical game-log adapter for nflverse weekly player stats. It joins to completed regular-season schedules and ignores missing stats. No roster or injury status is inferred from those logs.
- Added a popular-card builder that refuses to format a card without at least five distinct, measured KBH searches for the exact combination, same-book current lines, verified availability, and sourced game logs. It displays sample counts, not a 100% certainty claim or made-up parlay payout.
- The owner confirmed the midnight planning timezone as **America/Los_Angeles**. The planner remains disabled and makes no posts.

## Verification

- The initial foundation had 21 passing tests (including Dot's original 14); the release candidate has 24.
- A read-only fetch of the 2026 nflverse release and schedules returned 137 completed regular-season games and eight completed rows for an example player on November 14. This confirms a current file exists; it does not verify game results or a current player roster independently.
- A Node `fetch` smoke attempt from this local runtime failed with `ERR_SSL_WRONG_VERSION_NUMBER`. The Python read-only source check succeeded. The adapter's mocked endpoint test passes, but the Node runtime must be tested in the actual hosting environment before activation.
- Only the newly requested private Discord category/channels have been created in the server. No existing channel, production data, database migration, or automated post has been changed.

## Free-source and rights findings

- [The Odds API free tier](https://the-odds-api.com/) currently lists 500 credits per month, all sports and markets, but not historical odds. Event-level alternate player props can consume credits quickly across four leagues and many games. The existing KBH Render configuration references an `ODDS_API_KEY`; its plan, remaining credits, and reuse permission have not been checked. No new subscription was purchased.
- [The Odds API terms](https://the-odds-api.com/terms-and-conditions.html) permit some commercial display and derived analysis, but prohibit selling the provider's data as the primary product or raw feed. Because a paid Trends-tool could resemble a data product, obtain a provider interpretation before member-facing redistribution.
- [nflverse's licensing statement](https://github.com/nflverse) says most `nflverse-data` releases are CC BY 4.0 with attribution, while underlying third-party rights remain the user's responsibility. The 2026 weekly player stats and completed-game schedules were fetched for local research only; commercial publication still needs a source-rights review and visible attribution.
- ESPN/NBA public pages are not licensed commercial data feeds merely because they are accessible. The existing ESPN trends path is separate and must not be silently promoted as Trends-tool coverage.

## Remaining before release

1. Deploy the bot release candidate, verify command registration and exercise `/trends-nfl` as a VIP member or administrator in the new search channel. Confirm live nflverse HTTPS fetch; the local Node runtime has a TLS failure. Existing channels, roles and permissions remain untouched.
2. Confirm current odds API plan/quota and provider redistribution rights. Select licensed current roster, injuries, lineup and player-game-log sources for each sport. Only NFL historical stats have a tested free adapter so far; NBA, MLB and NHL still lack approved production game-log feeds.
3. Add a durable database for normalized data, observed KBH searches, source timestamps, per-market publication receipts, and daily idempotency. Never synthesize popularity or use test fixtures in production.
4. Extend the NFL historical search to licensed current roster/injury/odds, player/team analysis and alternate-line comparisons. Add durable search telemetry before calling any combination popular. Build bet-builder views only for verified coverage. The popular card formatter is not a live search tracker or publisher.
5. Add the midnight Pacific worker with a database lease, retries and late-market checks. Recheck current market, participation, roster and injuries just before every post or edit; retract unavailable or started props. Do not enable automatic posts before these checks work end to end.

This is a private Discord shell and a functional NFL research release candidate, not a completed multi-sport Trends-tool. The automated publisher remains off.
