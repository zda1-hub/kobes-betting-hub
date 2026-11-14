# Trends-tool integration status — November 14, 2026

## What is in this checkout

- Integrated Dot's tested calculation, fail-closed qualification, combination warning, Pacific daily-plan, and additive Discord provisioner modules into `bot/trends/` without changing existing bot commands or channels.
- Named the tool **Trends-tool**. The proposed category stays `📊・LINEMATE ANALYTICS` per the supplied specification. Discord channel names cannot contain spaces, so the requested “popular trends” channel is `popular-trends`.
- Added a read-only current alternate-prop odds adapter for The Odds API. It requests one event at a time, sends the API key in a header, and keeps the bookmaker's actual price and update time. It does not fetch until invoked with a configured key.
- Added a read-only NFL historical game-log adapter for nflverse weekly player stats. It joins to completed regular-season schedules and ignores missing stats. No roster or injury status is inferred from those logs.
- Added a popular-card builder that refuses to format a card without at least five distinct, measured KBH searches for the exact combination, same-book current lines, verified availability, and sourced game logs. It displays sample counts, not a 100% certainty claim or made-up parlay payout.
- The owner confirmed the midnight planning timezone as **America/Los_Angeles**. The planner remains disabled and makes no posts.

## Verification

- `node --test bot/trends/*.test.js`: 21 tests pass (including Dot's original 14).
- A read-only fetch of the 2026 nflverse release and schedules returned 137 completed regular-season games and eight completed rows for an example player on November 14. This confirms a current file exists; it does not verify game results or a current player roster independently.
- A Node `fetch` smoke attempt from this local runtime failed with `ERR_SSL_WRONG_VERSION_NUMBER`. The Python read-only source check succeeded. The adapter's mocked endpoint test passes, but the Node runtime must be tested in the actual hosting environment before activation.
- No production data, Discord server, database migration, or automated post has been changed.

## Free-source and rights findings

- [The Odds API free tier](https://the-odds-api.com/) currently lists 500 credits per month, all sports and markets, but not historical odds. Event-level alternate player props can consume credits quickly across four leagues and many games. The existing KBH Render configuration references an `ODDS_API_KEY`; its plan, remaining credits, and reuse permission have not been checked. No new subscription was purchased.
- [The Odds API terms](https://the-odds-api.com/terms-and-conditions.html) permit some commercial display and derived analysis, but prohibit selling the provider's data as the primary product or raw feed. Because a paid Trends-tool could resemble a data product, obtain a provider interpretation before member-facing redistribution.
- [nflverse's licensing statement](https://github.com/nflverse) says most `nflverse-data` releases are CC BY 4.0 with attribution, while underlying third-party rights remain the user's responsibility. The 2026 weekly player stats and completed-game schedules were fetched for local research only; commercial publication still needs a source-rights review and visible attribution.
- ESPN/NBA public pages are not licensed commercial data feeds merely because they are accessible. The existing ESPN trends path is separate and must not be silently promoted as Trends-tool coverage.

## Remaining before release

1. Verify the correct KBH Discord guild, bot permissions and whether new channels should be public or private. Run the provisioner in dry-run mode, then create the category only after visibility is explicitly set. Existing channels, roles and permissions must remain untouched.
2. Confirm current odds API plan/quota and provider redistribution rights. Select licensed current roster, injuries, lineup and player-game-log sources for each sport. Only NFL historical stats have a tested free adapter so far; NBA, MLB and NHL still lack approved production game-log feeds.
3. Add a durable database for normalized data, observed KBH searches, source timestamps, per-market publication receipts, and daily idempotency. Never synthesize popularity or use test fixtures in production.
4. Build interactive search, player/team analysis, alternate-line comparison, and bet-builder views only for verified coverage. The popular card formatter is not a live search tracker or publisher.
5. Add the midnight Pacific worker with a database lease, retries and late-market checks. Recheck current market, participation, roster and injuries just before every post or edit; retract unavailable or started props. Do not enable automatic posts before these checks work end to end.

This is a functional local research foundation, not a completed or deployed member-facing Trends-tool.
