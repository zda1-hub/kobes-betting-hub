# Named free-pick correction — October 11, 2026

## Request and cause
The user identified a live X free-pick post that said only “Over 3.5 receptions -125,” then explicitly requested a corrected tweet and removal of the original. The saved approved packet `20261011-101-X` identifies **DeVaughn Vele**, with approved odds **-125**. The original X/site builders used raw selection text without its separately stored player name.

## Changes
- `bot/lib/free-pick-x.js`: use the existing canonical named wager formatter shared by Discord/Story; require the existing free-pick eligibility check before publishing. Preserve arbitrary approved odds and the 280-character limit.
- `bot/lib/free-pick-site.js`: include the structured player name in the website selection, without duplicating names already present.
- Corresponding tests verify separate player fields, missing-name rejection before an outbound request, complete approved evidence, and +350 odds acceptance.
- No typography, colors, artwork, card dimensions, billing or membership access changes.

## Verification and release state
62 targeted tests passed across free-pick X, website, delivery, Instagram Story and source-review suites. Player and approved wager terms were read from the production saved review packet through Render's authenticated Web Shell; no player or odds were guessed from the incomplete tweet.

The corrected tweet was published through the signed-in X interface and its visible body verified: https://x.com/kobesbettinghub/status/2109342649693921335 . The incomplete original is https://x.com/kobesbettinghub/status/2109318815162966259 . At this audit's creation, permanent deletion is at X's final confirmation dialog pending the action-time confirmation required by computer-use policy.

Code release and current website/receipt correction are pending. Follow-up evidence and actual release/deletion outcomes will be appended below. Existing Instagram Story assets and email delivery must be preserved; correcting text/receipts must not broadcast the free pick again.
