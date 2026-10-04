# Public results recovery audit — October 4, 2026

Status: implementation and local verification complete for read-only public result reconstruction. No commit, deployment, external grading request or production mutation was performed by this change.

## Requested change and cause

The user requested the source of public wins and recovery of pending outcomes. Read-only source inspection found that `startPublicResultsSync` built its snapshot from canonical publication CSV rows alone. Multi-wager publications deliberately remain pending at the parent level to prevent their first wager’s result from representing the whole group. Recap grading saves independent child outcomes in `wager-results-DATE.json`; those child outcomes were not included by public sync.

A pure in-memory reproduction showed the omission: the grouped CSV parent produced zero settled outcomes and one pending entry, while its verified child records produced one win and one loss. This establishes the code-path defect, not how many production outcomes can be recovered. The separate `recap-audit-wagers-DATE.json` files are audit checkpoints and must not be substituted for canonical worker records without evidence reconciliation.

## Implementation

Affected files:

- `bot/lib/public-result-rows.js`: new read-only publication-to-wager resolver.
- `bot/lib/public-result-rows.test.js`: eight evidence and counting tests.
- `bot/index.js`: public sync imports the resolver and passes its rows to the existing snapshot builder.

The resolver walks every valid published operating date in the log. It reads the original source packet and existing canonical per-date wager ledger. A reconstructable multi-wager parent is replaced by its individual children; the parent is not counted alongside them. Each child reuses a saved result only when the exact published-terms fingerprint matches. Missing packets, unsafe groups, missing child records and mismatched fingerprints remain pending. Original verified single picks retain their canonical grade. A pending single may reuse its exact fingerprint-matched saved child grade while retaining the original single ID, so it still counts once. Public verification still requires a settled W/L/P/V outcome, a nonempty verification source and a valid verification timestamp.

The resolver does not import or call a grading provider, make network requests, create/checkpoint ledgers, update the CSV, send recaps or use an audit ledger. Invalid canonical ledger files fail closed and leave the existing sync error handler to report the failure. The separate free-pick-channel results path is unchanged.

## Verification

15 targeted tests passed, zero failed, across `public-result-rows`, `public-results`, `wager-ledger` and `free-pick-results`. The new tests cover independently verified W/L/P across mixed leagues; grouped parent replacement; old parent grades held when packet/group reconstruction is unsafe; fingerprint mismatch; missing canonical child evidence; all historical dates; original singles; invalid ledgers; unpublished rows; absent verification timestamps; unchanged in-memory fixtures; and no grading callback invocation. Existing ledger checkpoint and free-pick tests also pass. `bot/index.js` passed JavaScript syntax validation.

## Remaining recovery work

Live Render logs confirmed repeated multi-wager parent holds, unmatched events, unclear lines and unsupported/ambiguous league identities. The previous website snapshot contained 75 wins, 64 losses, 4 pushes and 295 unresolved publication entries; these publication entries are not necessarily individual wagers. Read-only Render access used the user-confirmed My Workspace (tea-da6egav10e5c73bdu0jg) and service srv-da6hvmijnfac73apb6v0. Direct SSH is unavailable because no authorized local SSH identity is configured.

The recovery scheduler now checks older unresolved outcomes after the regular recap grading pass, using the same in-process grading guard. Each pass selects at most 50 entries, rotates through historical dates, and stops starting provider checks after 60 seconds. It reuses the existing ESPN grading rules and cache. Source-backed single results update the canonical publication row; independent group results checkpoint in the existing per-date wager ledger. A private persistent last-run report and existing database grading audit retain original post references, exact selections, provider sources and unresolved reasons. This adds no email or Discord publication step. Changed-term fingerprints, missing original packets, unsafe groups, incomplete sources and unsupported markets stay unresolved. The current-day and previous-day workflow remains responsible for its existing dates.

Root ran 73 related tests across public reconstruction, historical recovery, ESPN grading, tennis and special markets, recap scopes, deduplication and ledger persistence: all passed. Bot entrypoint syntax and whitespace checks passed. Release status and actual production counts will be appended after deployment; local tests do not prove historical completeness.

Historical audit checkpoints, incomplete extraction, unsupported markets, missing original packets and conflicting terms still require careful reconciliation. No missing outcome is inferred as a win, and no production record total or recovered count is claimed by this local test run. Root reported production totals through logs, but this agent did not access production or independently verify those totals. Deployment and post-release evidence remain pending root completion.

## Follow-up — consistent counting and bounded historical recovery

Root authorized and began a separate historical recovery worker, then delegated its safety review and tests to this agent. Added/updated files: `bot/lib/results-backlog.js`, `bot/lib/results-backlog.test.js`, and the public resolver/test files above. Root owns the scheduler wiring in `bot/index.js`.

Public rows now use `distinctCapperWagers`, grouped by operating date and the same normalized source identity as capper recaps. Identical reposted wager terms count once per source/day; independently changed terms remain distinct. Conflicting settled grades for identical calls remain pending rather than favoring a win. Rows missing verification metadata are normalized to pending before deduplication, so an invalid earlier grade cannot suppress a valid later receipt.

Historical recovery selects a rotating bounded subset of unresolved older entries, permits existing provider grading only for selected entries, and stops starting further grading after a 60-second deadline. The batch limit must be an integer from 1 through 100 and the cursor a nonnegative integer. A selected source single may grade its one canonical `-W001` child; selecting a grouped publication never implicitly enables all siblings. Missing/unsafe source packets are held even if an older row claims individual scope. Exact-term fingerprint mismatches remain held rather than automatically regraded. Ordinary standalone picks update through the supplied canonical updater. Successful reconstructed child outcomes checkpoint through the existing wager-ledger implementation. A local report records attempts and cursor progress; this worker does not send recap messages or approve Discord cards.

32 targeted tests passed, zero failed, covering public reconstruction, bounded recovery, existing public/free-pick results, wager-ledger safety and capper deduplication. Nine new backlog tests cover single-child aliasing, sibling bounds, missing/unsafe packets, historical cutoff/cursor rotation, verified-pick skipping, the deadline, rejection of unverified provider results, input-budget validation, and changed-term holds. Two additional resolver tests cover copied-call deduplication and conflicting grades. The backlog module passed JavaScript syntax validation.

All provider responses in these tests were local mocks, and all written ledger/report fixtures were temporary test directories cleaned after execution. No production record was edited by this agent. Root must verify scheduler serialization, production provider access, deployment and actual recovered totals separately. The deadline bounds new grading starts, not the duration of a provider request already in progress. Unsupported markets and incomplete/conflicting evidence may legitimately remain pending.

## Production verification — 12:34–12:37 PM MST

Source commit `376bdce` was merged through PR #128 into GitHub main as `c5e8652cf9e41bc161d4c7cd66044ed7336ef738`. Render deployment `dep-db1ak0qvcj2c73a29o50` became live at 12:33:51 PM MST. Public sync confirmed success, and both the live homepage and results page were refreshed and checked.

The live feed generated at 12:34:54 PM MST reports **278 wins, 255 losses, 11 pushes, 0 voids; 544 settled and 492 unresolved individual wager entries**. Before the fix it reported 75 wins, 64 losses, 4 pushes; 143 settled and 295 unresolved publication entries. Grouped publications can contain several wagers, so the old pending count cannot be compared directly with the corrected individual-wager count. The total record now includes 401 more verified outcomes than the old display. This combines previously saved canonical evidence and newly recovered results, with consistent repost counting; it is not a claim that 401 outcomes were newly graded today.

The first historical recovery pass logged 271 older unresolved wagers, 34 provider checks and five newly verified outcomes (two wins, three losses). It recovered Jake Bennett over 16.5 outs (18 outs; win), Phillies -1.5 (5–2; win), Kumar Rocker over 3.5 strikeouts (3; loss), Anthony Kay over 3.5 strikeouts (3; loss), and a first-five under 4.5 (9; loss). Private production audit receipts retain every original Discord post and ESPN result reference. Remaining checks in that pass included unmatched events, ambiguous same-day league/event identities, unsupported exact player stats, unclear markets and a multi-leg settlement hold. Publication dates can differ from actual game dates; the recovery does not guess a later matchup or alter the original terms to force a grade.

The published record combines official logged free picks and curated VIP expert picks. It is not represented as Kobe's personal betting-account record. Older unlogged posts, missing original packets and unresolved wagers are not silently counted. The bounded historical worker continues through the existing bot schedule; complete historical reconciliation remains unconfirmed.

Screenshot evidence is saved locally at `outputs/results-recovery-2026-10-04/live-record.png`. The website layout, buttons, billing integrations and public frontend source were unchanged by this backend recovery release. This production receipt is a documentation-only follow-up on the release branch so that recording evidence does not restart an in-progress historical recovery pass.
