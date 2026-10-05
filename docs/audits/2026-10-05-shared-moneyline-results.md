# Shared moneyline result recovery — 2026-10-05

Requested change: resolve published shorthand such as `Bills/Rams ML` as two separate team selections so the results workflow does not hold the entire source post as an unclear matchup or parlay.

Affected files: `bot/lib/wager-ledger.js`, `bot/lib/wager-ledger.test.js`.

Before: one lossless source play with a shared `ML` suffix created one child wager. The grading parser could not identify a single event for two teams in separate games, leaving that entry pending.

After: only the exact `Team/Team ML` or `Team/Team moneyline` form, with no explicit parlay or teaser and no shared event, line, odds, or units, creates two child wager entries. Each retains a reference to the original selection and receives its own stable ledger ID. The existing grader must still match each team to exactly one final game on the operating date. No shared price or stake is assigned to either child, so no return-on-investment figure is invented. Explicit parlays and other slash notation remain unchanged.

Verification: 40 local tests passed across wager reconstruction, ESPN grading, and recap approvals. The new test checks exact split terms, unique IDs, missing odds/stakes, and the explicit-parlay and priced-wager exclusions. These are mocked/local tests; live provider results and Discord delivery are not verified by this audit.

Limitations: this narrow repair does not resolve all pending October 4 wagers. Source posts without lossless terms, ambiguous event identity, or unsupported market settlement continue to require review. Kobe's approval remains required before a private recap is posted to VIP.

Release status: PR #149 merged at 2026-10-05 18:33 UTC. Render deploy `dep-db1uqo7avr4c73a1ks9g` reached `live`; the worker logged in as Kobe Bot. At 18:34 UTC the October 4 final recap still had 41 unresolved entries, so this specific shorthand fix did not complete the full backlog.

## Follow-up: verified partial approval cards

Requested change: make timely verified results available for Kobe's review while unrelated wagers remain unresolved.

Affected files: `bot/lib/recap-approvals.js`, `bot/lib/recap-approvals.test.js`.

Before: if one capper recap card included any pending pick, its approval button was disabled and no verified pick on that card could reach VIP.

After: the original full card remains private and disabled; a separate, explicitly marked `VERIFIED PORTION ONLY` card includes only rows with verification receipts. Kobe may approve that exact partial card. The published body excludes unresolved wagers and says it is not final. The existing full-card key remains unchanged, preserving prior receipts and review history. A later final recap may separately supersede a partial post when all results settle.

Verification: 14 focused recap-approval tests passed, including a simulated private review and Kobe-only publication proving the unresolved selection is absent from the VIP payload. Live delivery and Kobe's approval are not inferred from tests.

Release status: PR #150 merged at 2026-10-05 18:40 UTC. Render deploy `dep-db1uu1s9v7es73ft1f60` reached `live`. At 18:41 UTC the worker reported 14 new verified-only October 4 approval cards in the private exclusive recap channel. These were not sent to VIP; Kobe must approve each exact card. The full October 4 recap still reported 41 unresolved entries, so a complete final recap remains held.

## Follow-up: X image-only intake

Requested change: queue more qualifying X source picks for Kobe while preserving the existing approval-card format and review gates.

Affected runtime setting: Render worker `X_MONITOR_MAX_MEDIA_ONLY_PER_SOURCE_PER_RUN`, raised from its code default of `1` to `3`. No source roster, card renderer, publication rule, or secret was changed.

Before: the 18:41 UTC scan created five review packets but deferred three media-only candidates while using zero of four extraction calls. Each source admitted only one such post per scan.

After: Render deploy `dep-db1v0o4s728c73aer6p0` reached `live` at 18:46 UTC. Its first scan checked 39 enabled X sources and queued four new approval cards. It deferred one later media-only post after a source used all three slots; that post remains eligible for a later pass. The existing exact-term and Kobe approval checks remain active.

Verification: Render deployment and worker logs. This confirms private cards were queued, not that Kobe approved them or that they were sent to members. The 15-minute scan interval and four extraction-call limit remain in place.
