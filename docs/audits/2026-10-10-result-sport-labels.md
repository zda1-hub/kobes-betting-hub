# Winning-pick sport labels — October 10, 2026

Request: remove incorrect “Sport not confirmed” labels from obvious WNBA/baseball winning picks.

Cause: 305 of 538 entries in the inspected public feed had blank sports. The existing public metadata mapper recognized only a small group of teams. The client rendered the literal fallback for every blank entry, including Liberty/Dream and Guardians selections.

Change: expand recognized professional team names and WNBA matchup pairs in result-metadata.js. Liberty/Dream, full Atlanta Dream/New York Liberty names and Wings/Valkyries now map to WNBA. Guardians, Brewers, Astros and other identifiable baseball teams map to Baseball; full Anaheim Ducks, Winnipeg Jets and other hockey names map to Hockey. Keep ambiguous “Liberty”, “Ducks” and “Jets” without guessing. Results rendering omits absent sports while retaining source/line/odds. No wager, result grade, verified receipt, published selection, timestamp or API storage is changed. This is a public client release; no publisher/backend deployment or archive backfill.

Affected files: result-metadata.js, results.js, public HTML asset versions using these scripts (including homepage, results and recaps), scripts/result-metadata.test.mjs.

Team reference checks: [WNBA teams](https://www.wnba.com/teams), [MLB teams](https://www.mlb.com/team), [NHL teams](https://www.nhl.com/info/teams/). Tests cover recognizable names, ambiguous abbreviations and preservation of wager/verification identity.

Verification: seven targeted metadata/public-result tests pass; relevant scripts/Cloudflare suite passes (300 total, 289 passed, 11 retired skips). Actual populated preview tracker at 390px shows WNBA on Liberty/Dream, no placeholder, no page overflow. 62 inspected feed entries change their displayed sport label; this includes existing league labels normalized to sport names, not only previously blank fields. Evidence: outputs/audit-2026-10-10/view-continuity/tracker-sport-labels-390.png in the primary workspace. Existing design-release audit remains at 2026-10-10-view-continuity-motion.md.

Remaining limit: ambiguous school names and abbreviations still require source context; the UI omits the empty metadata field. The recorded API source is preserved.

Publication and live follow-up recorded below.

Published public-only Cloudflare version `e9405879-88b7-4f26-9feb-be3ca4233ce9`. Live populated tracker confirms Liberty/Dream displays WNBA, no “Sport not confirmed” placeholder, 30 wins, header top 0 and no overflow. Preview populated tracker also checked at exact 320px and 1440px. Live evidence: outputs/audit-2026-10-10/view-continuity/live-sport-labels-mobile.png in the primary workspace.
