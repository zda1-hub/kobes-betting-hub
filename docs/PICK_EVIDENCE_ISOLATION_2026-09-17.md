# September 17 — cross-play approval evidence incident

## Reproduction and cause

The owner screenshot shows Josh Allen/Bills passing analysis repeated on Jahmyr Gibbs rushing-attempt and DJ Moore receiving-yard approval cards. The collector copied parent `source_claims` and sometimes parent ESPN notes onto every split play. Those inherited bullets could satisfy the evidence minimum, preventing the intended missing-evidence research from running.

## Scoped correction

- Structured extraction now requires source claims on each individual play, with explicit player/market/matchup attribution. Prompt version is incremented so the old extraction cache is not reused.
- Split cards use only their own claims and research notes. Parent prose is not copied indiscriminately; old unscoped packets keep only unambiguous player-anchored facts. Repeated unanchored sibling prose is refused using an immutable pre-research snapshot.
- ESPN fills only missing evidence after isolation; complete usable source writeups do not trigger research. `Rush Attempts` is now recognized as rushing attempts.
- Each split packet records a versioned wager identity. Legacy or mismatched-scope saved cards cannot use unanchored inherited facts to authorize publication, and changed approval copies fail the existing copy-hash check.
- Startup refresh corrects undecided private cards in today's durable queue. Cards lacking enough verified research show only filtered facts with publishing disabled; Reject remains available. Decided/published cards are not rewritten.
- Exact wager terms, the existing pick-first/blank-line/bullet format, exclusive grouping, and approval/member-copy identity remain unchanged.

## Verification and rollout

Local release suite: **223/223 passed**, including six new regression tests reproducing the screenshot and checking isolated ESPN athlete/market requests, source-first behavior, stale-copy refusal, wager-header/hashtag exclusion, and matching approval/member rendering. No public fixture, payment, membership mutation, or credential change was made.

No database migration or environment change was required. Final commit `4d4b1066a58a1114e72acb525dd60e40701dfee6` is live through Render deploy `dep-dam5lbfqj5pc73e5smj0` (finished 21:25:39 UTC); startup registered commands and logged in as Kobe Bot. Direct Discord reads at approximately 21:27 UTC verified cards `20260917-019-02-X` (Gibbs) and `20260917-019-03-X` (DJ Moore): four correct-player/market ESPN facts apiece, no inherited Josh Allen/Bills passing prose, no repeated wager bullet, and matching saved approval-copy locks. Public read-only smoke passed 5/5. The next genuine Kobe approval remains the public content acceptance; transport success is not proof of factual correctness.

The final verification-record commit is documentation-only and uses Render's documented `[skip render]` phrase to preserve the verified running code without another unnecessary restart.

Rollback reference is pre-fix main `ec759fe843e5dde96187644330e16f913f0a9ac4`. It contains the contamination defect, so if operational rollback is necessary, hold affected publishing first; do not reactivate unsafe old approval cards.

## Launch-day read-only checks

- New starter membership is linked to Discord; its live membership role is present, and live-mode checkout/invoice/subscription webhooks processed successfully. Initial subscription-created `NO_DISCORD_LINK` precedes the successful Discord connection/role-grant event; it is not an unresolved failure.
- Today's canonical pick log contains three paid-channel publications but no Free Pick. The bot-to-site/X API audit contains no Free Pick calls today. Publisher D1 has no new X queue or outbound X audit rows today; the current public Free Pick API still reports September 15.
- Instagram connection table is empty. The separate `kobeslocks` connector is not authorized and has no public Story publishing route; do not claim Instagram is connected or posting.

Individual customer identifiers and credentials are deliberately omitted from this document.
