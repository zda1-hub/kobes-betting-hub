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

## Follow-up: X reply routing found after live publication

PR #249 merged and Render automatically graded the pick as a win, then published [X result 2112039454168752133](https://x.com/kobesbettinghub/status/2112039454168752133). The live X page showed **“Replying to @kobesbettinghub”**. The earlier statement that the publisher created a standalone post was incorrect: `cloudflare/bettinghub-publisher.js` added `reply.in_reply_to_tweet_id` for `result-x-*` IDs. That Worker had not changed in PR #249. This follow-up removes that reply field while retaining the deterministic ID and the existing no-automatic-retry guard for uncertain result delivery. The published reply remains on X; [today's standalone result](https://x.com/kobesbettinghub/status/2112040109533241709) was published separately instead of requeuing the already published receipt.

The October 22 coupon still showed 0/20 uses when the promotional copy was prepared, so the [new offer post](https://x.com/kobesbettinghub/status/2112040174964158523) uses the verified deadline and 20-use cap without saying three remain. All 29 publisher tests pass, including result payload checks. The publisher Worker release remains to be recorded below.

## Standalone publisher release

PR [#250](https://github.com/zda1-hub/kobes-betting-hub/pull/250) merged as `bd85391`. The production `bettinghub-publisher` Worker deployed from matching source with `--keep-vars` as version `be359d68-ca58-4d83-ab6a-e0234ac968fc`, 100% active. Its live `/health` returned `ready`, `xConnected`, and `freePickReady`. The already published result was handled by the separate [standalone post](https://x.com/kobesbettinghub/status/2112040109533241709); no duplicate queue request was made. Future results still require an approved Free Pick, a confirmed original X receipt, and a uniquely verified final grade. A test and deployment cannot prove an unseen future X delivery; the next actual result receipt should be checked when it occurs.
