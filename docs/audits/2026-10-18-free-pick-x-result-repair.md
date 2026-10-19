# Free Pick X result repair — October 18, 2026 MST

Requested: post the verified result of every Free Pick to X as a separate post, and investigate why the October 18 James Cook result was missing.

## Evidence and cause

- The approved October 18 pick `20261018-216-X` was published to Discord, the public Free Pick page, and [X](https://x.com/kobesbettinghub/status/2111902695283912932) before the game. The X result path was enabled in production and scanned every 30 minutes.
- Render logs show ESPN grading held the pick while the game was live, then held it after the final with `No supported, exact player-stat match was found.` The result therefore remained pending and was intentionally excluded from the X queue.
- ESPN's final event `401873005` names the player **James Cook III** and labels the field `rushingYards`; the approved pick names **James Cook** and says **Rush Yards**. The grader required identical compacted names and only recognized the phrase `rushing yards`, so it missed both legitimate variants.
- The [Bills' official recap](https://www.buffalobills.com/news/bills-33-raiders-30-final-score-recap-highlights) reports 22 carries for 95 rushing yards. This clears the published over 93.5 line. The live ESPN summary also reports the event final and 95 `rushingYards` for James Cook III.
- The current October 22 Stripe coupon showed 0/20 redemptions at review time. A claim of “only three remaining” is unsupported and must not be posted.

## Change

`bot/lib/espn-grading.js` now uses the existing strict player-name matcher for an omitted official suffix and recognizes `Rush Yards` as the same explicit rushing-yard market. The matcher still requires a unique athlete and exact event; ambiguous names remain pending. `render.yaml` now records the enabled Free Pick X and result-post switches so a later Blueprint sync does not revert them to false. The result publisher creates a standalone X post under a deterministic per-pick ID only after canonical grading records a verified final result; it does not use X's reply target.

## Verification and release status

The focused ESPN grading test includes the October 18 wording, 95-yard box-score field, and ambiguous-name hold. A read-only run against the live ESPN summary returned `GRADED`, `W`, `James Cook III: 95 rushing yards`, and event `401873005`. Focused result-queue tests passed. The production bot's automatic deploy and a confirmed X result-post receipt remain to be checked after merge.
