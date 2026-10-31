# Free Pick X tone and restart — October 30, 2026 MST

## Request

The owner supplied a KBH X screenshot and asked that future Free Pick posts use its direct tone: lead with the exact play and odds, then short factual lines. The owner explicitly authorized resuming approved Free Pick posts on X. The earlier stop on automated result posts remains in force.

## Changed files and behavior

- `bot/lib/free-pick-x.js`: removed the generic “TODAY’S FREE PICK” and “QUICK BREAKDOWN” headings. The post starts with the approved wager terms, followed by up to three complete approved evidence lines prefixed with `- `. The existing tagged Free Pick link remains and the footer now says `21+ where permitted. Bet responsibly.` No evidence is clipped to fit 280 characters. This same caption is also sent to the website publisher.
- `bot/lib/free-pick-delivery.js`: a site/email delivery completed while X was disabled now receives a complete durable receipt, so switching X back on does not replay that older pick.
- `render.yaml`: records `FREE_PICK_X_SYNC_ENABLED=true` for future Blueprint reconciliation. `FREE_PICK_X_RESULT_REPLIES_ENABLED=false` stays unchanged.
- Focused tests were updated for the new copy and the no-replay behavior.

## Verification and limits

`node --test bot/lib/free-pick-x.test.js bot/lib/free-pick-delivery.test.js bot/lib/free-pick-site.test.js` passed 26/26. `node --check bot/lib/free-pick-x.js` and `git diff --check` passed. The publisher `/health` reported `ready`, `xConnected`, and `freePickReady` before release. Render's October 30 Free Pick receipt had `x: disabled`, so that pick is intentionally not backfilled. No new pick was posted during the test; the next newly approved pick is the first live end-to-end check.

Release status: local until merged and the Render environment switch is verified. Append the production receipt after release.

## Production release

PR #351 merged as `31b009f` on October 30 MST. Render deployed that commit as `dep-dbinpqu417fc73a55us0` (live), then the `FREE_PICK_X_SYNC_ENABLED=true` environment change deployed as `dep-dbinqdvlk1mc73f8buf0` (live). The separate result-reply switch was not changed and remains false in the Blueprint. The October 30 pick `20261030-026-X` received `site: published`, `x: disabled`, `email: sent`, `complete: true` after the code deploy; it was not replayed to X when the switch changed. A new approved Free Pick after this release is required to verify an actual X post URL and final provider receipt.
