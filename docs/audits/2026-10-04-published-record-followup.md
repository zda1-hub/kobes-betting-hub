# Published-pick record and verification follow-up — October 4, 2026

User scope: count all Kobe-approved free and VIP picks that were actually published. User also requested clearing pending verification and guidance on bringing visitors back. The requested fabricated 65% homepage rate is not implemented; homepage and ledger continue using genuine verified results.

## Evidence before this change

Live feed at 13:25 MST: 286 wins, 259 losses, 11 pushes, 556 settled, 480 pending. The deployed historical recovery worker reduced its older queue from 271 to 254 unresolved wagers; 17 historical outcomes were recovered across its recorded passes. Compared with the previous 544-settled public snapshot, the deduplicated public total increased by 12. Attempt totals and public counts differ because identical calls are deduplicated per source/date.

400 live verification log entries were read privately. A deduplicated sample of 239 attempted wager IDs included 46 “No clear over/under line” failures on many straight spread/moneyline selections. ESPN scoreboard competitors include shortDisplayName, while final summaries can omit it; the resolver knew the team but settlement discarded that identity. Real same-day final-score checks demonstrate Florida ML W, Arizona State -5 W, NC State +3.5 L, South Carolina ML L and Virginia -10 L once exact competitor ID is retained. These read-only checks were not directly written into production results.

## Changes

- Grading carries the uniquely matched scoreboard competitor ID into final-summary moneyline/spread settlement. Missing, mismatched or duplicate IDs fail closed. Existing exact same-day event checks remain.
- Parser-only normalization accepts recognizable leading unit stakes, time stamps, explicit league labels and MAX WHALEPLAY/MAX BET wrappers. Explicit league labels restrict endpoints; conflicting labels/metadata remain pending. Published terms and result fingerprints are unchanged.
- Recovery resumes the saved queue cursor after restarts. Receipt writes use a temporary file and atomic rename, so a restart does not repeatedly begin at the same first batch.
- The public combined record now requires publication evidence, a matching Kobe approver ID, and a valid approval timestamp at or before publication. Discord server member search confirmed `kobe.kingston`/Kobe; bot accounts have different IDs. Rows approved by others, placeholder approvers and missing/invalid approval timestamps are excluded from this record. Both free and VIP destinations remain eligible. Existing exact-source verification and deduplication still apply after eligibility filtering.
- Runtime logs report eligible publication count and exclusion reasons, so eligibility is reviewable without exposing VIP wager content publicly.

Files: `bot/index.js`, `bot/lib/results-backlog.js`, `bot/lib/results-backlog.test.js`, `bot/lib/wager-terms.js`, `bot/lib/wager-terms.test.js`, `bot/lib/espn-grading.js`, `bot/lib/espn-grading.test.js`, `bot/lib/record-eligibility.js`, `bot/lib/record-eligibility.test.js`.

## Validation and limits

71 targeted tests passed, including restart continuity, same-day ambiguity, missing/duplicate team IDs, approval provenance, fingerprint integrity, public deduplication and unsupported-market holds. Syntax and whitespace checks passed. Some pending posts lack numeric lines or unique game identities; no date, opponent or outcome was invented to settle them. Source audit receipts remain private under the original workspace outputs directory.

## Returning visitors

The website email list contains only owner/test addresses, so it supplies no outside reactivation audience. Google Analytics visitor counts cannot be converted into an email list. Kobe can inspect available Meta website/engagement audiences and use a relaunch creative featuring the updated mobile experience and the $19.99 first-month offer ($32.99/month thereafter). Audience availability and the exact approved ad account have not been verified here; prior visits are not guaranteed to be matchable. Use tagged campaign links and measure paid memberships; confirmed Purchase delivery to Meta remains a separate unimplemented gap. No campaign, ad spend or outreach was launched in this pass.

Publication: release and production verification receipt to follow.
