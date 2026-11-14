# Betting Hub Trends-tool: reconnect handoff

Prepared November 14, 2026. LOCAL ONLY. Not deployed, no Discord channels created, no data purchased, no live recommendations published. See `STATUS.md` for the reconciled state in the current checkout.

## Implemented and tested
- Pure historical analytics: over/under/milestone semantics, explicit push denominator, final participated games only, missing data excluded, duplicate rejection, season/L5/L10/L20 summaries, game-by-game values.
- American-odds implied probability and fail-closed qualification: roster/participation evidence, freshness, future game, valid available sportsbook market, -400 price floor, 80% season threshold and minimum 20-game season sample.
- Reliability-weighted historical score; explicitly not a next-game model probability.
- Combination duplicate/shared-game/shared-player warnings. No invented parlay payout or probability.
- Explicit dry-run-first additive Discord provisioning for requested isolated category and six channels including popular-trends. Verifies target guild ID. Never edits, moves, deletes, or changes permissions of existing channels.

Run `node --test bot/trends/*.test.js`.

## Not implemented / not live
Licensed provider ingestion, persistent database, interactive Discord commands and views, admin controls, automated publishing/edit/retraction, scheduled refreshes, injuries/lineups, all-sport statistics coverage and live model validation remain unfinished. This package is a tested foundation, not the requested complete platform. The sports enum is a schema vocabulary, not a claim of working sport coverage.

## Next integration steps
1. Reconcile this patch against the latest local Render/Discord checkout; preserve uncommitted work. Do not deploy an old clone wholesale.
2. Verify actual target guild and current bot identity/permissions. Review the new category's visibility before provisioning. Call provision first in dry-run mode. No registration or production change has occurred.
3. Verify existing paid sports-data subscriptions and redistribution rights. No API key is supplied in this artifact. BALLDONTLIE NBA GOAT and The Odds API are candidates; plans, coverage and rights must be checked before activation. Existing ESPN pipeline is not evidence of commercial redistribution authorization.
4. Implement one honest working NBA end-to-end slice first: authorized feed -> normalized game logs/rosters/markets -> persistence -> search and interactive alternate-line cards -> reviewed publishing. Do not expose nonfunctional commands.
5. Add remaining sports individually with coverage flags, verified roster/image licenses, and sport-specific settlement rules. No unlicensed logos/headshots.
6. Integration must append new commands to existing bot/commands.js. register-commands.js replaces command lists: never register the Trends commands alone over existing commands.
7. Freshness and minimum sample thresholds are deliberately conservative implementation defaults pending admin configuration, not an undocumented claim from the user's requirements. Missing feed data must say unavailable, not falsely claim no props qualify.
8. Before release: validate inputs, signed Discord interactions, access controls, database migrations, rate limits/retries, caching, idempotent post ledger and edit/retract handling; verify no existing marketing/billing/member flows regress.

## Safety and methodology
Research only: no sportsbook account connection or wagering. Historical success is not a prediction. No guaranteed/safe parlay labels. Accurate current data and license verification gate publishing. Fixture values in tests are synthetic and must never be seeded as production content.

## Midnight schedule addendum (design only)
The owner confirmed America/Los_Angeles on November 14. The scheduler remains inactive until licensed data, persistence, and publication checks are ready. Do not assume the Mac/Render host timezone. Existing public website MST display rules are separate from this analytics scheduling decision.

`bot/trends/schedule.js` computes the local service date, a stable daily idempotency key, catch-up need, and game-date inclusion. It is a pure planning module, not an installed timer. At midnight the service date is the local date just beginning. The UTC trigger varies with Pacific daylight saving; a fixed UTC cron is insufficient. A future minute-based worker can obtain a database lease on the date key and safely catch up after outages. Store completion only after successful preparation; use a separate per-market publication ledger for retries. Never replay expired games during catch-up.

Midnight preparation is NOT permission to publish yesterday's odds. Refresh authorized roster/participation, schedule, and current sportsbook market data immediately before every actual publication or edit. Re-run qualify immediately before send (current conservative odds max-age: five minutes); store source fetch timestamps, not the time the cached record was loaded. Late-opening markets can be checked later that service day; unavailable feed/markets must be labeled unavailable rather than "no qualifying props." When games begin or lines become unavailable, flag/retract corresponding recommendations. These worker/ledger behaviors are requirements, not implemented features.

ESPN and NBA websites are suggested sources, not verified licenses or data integrations. Do not enable commercial scraping or redistribute statistics/images based solely on public accessibility. Obtain provider rights, API access, permitted caching/redistribution and league coverage evidence first. The prepared calculations can consume authorized normalized records without coupling the system to an unlicensed source.
