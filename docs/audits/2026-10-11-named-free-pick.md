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

## Follow-up — released at 11:07 AM MST
- GitHub `main`: `bd8fb7391f67d8a0b2b30d5cfc44ded04c600cb4`, based on the latest deployed `b53787a`; only the four publisher/test files and this audit were included.
- Render deploy `dep-db5t0c0u01pc73f0okc0` is **live**. Bot login at 11:07:17 AM MST and Discord attribution readiness at 11:07:19 AM MST were verified in production logs.
- Current and date-specific Free Pick KV records now say **DeVaughn Vele Over 3.5 receptions** and point to corrected X post `2109342649693921335`, published at `2026-10-11T17:57:32.000Z` (10:57:32 AM MST), verified from the post's visible timestamp DOM.
- The operational D1 queue receipt now uses the corrected body/post ID. The original receipt was preserved in D1 under the same ID with `-superseded-20261011`, with its original time/body/post ID. Local before/after evidence and conditional SQL are saved under `docs/audits/evidence/2026-10-11-named-free-pick/`.
- The current public API was re-read and asserted against the exact pick ID, named selection, corrected X ID and published status. Existing Instagram Story key and published receipt remain intact. No free-pick publish endpoint or email outbox trigger was invoked, and no Instagram Story was reposted.
- Local execution note: Wrangler's SQL-file command completed the mutation but emitted output incompatible with a JSON-only parser. A separate read-only query confirmed both receipt rows before any retry; the mutation was not repeated.
- The old tweet's permanent deletion still awaits the action-time confirmation requested in chat. No deletion is claimed yet.
