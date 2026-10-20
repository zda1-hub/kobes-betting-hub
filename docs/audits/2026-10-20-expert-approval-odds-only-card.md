# Expert approval odds-only card repair — October 20, 2026

## Request and observed defect

The owner showed an exclusive approval card attributed to Dan Gamble containing only `-115`, `-108`, and `-110` under an active `Post to #expert-picks` button. The live Discord message was `1562129550417199195` in `exclusive-pick-approvals` for packet `20261020-021-X`. Those prices did not identify any wagers, so the card did not meet the member-facing expert-pick format.

## Cause and changes

- `bot/lib/source-review.js`: the numeric fallback in `hasExplicitBettingMarket` accepted a bare negative price as a spread. Require an alphabetic selection and reject price-only terms before approval or Free Pick eligibility. Keep ordinary named sides, totals, and player props eligible.
- `bot/index.js`: startup refresh now revalidates pending terms-only cards. Invalid saved packets get a held notice with no publish controls instead of having their controls restored.
- `bot/lib/source-review.test.js`: reproduce the three-price card and a mixed valid/invalid card.
- Live Discord: replaced the malformed approval with a held notice and removed its controls. No member-facing post was made by this repair.

## Verification and limits

Focused source-review and collector tests: 60 passed. `bot/index.js` syntax check and `git diff --check` passed. The Telegram reader suite has 10 existing failures from its September 17 frozen fixtures; the same 10 failed on the unchanged base commit, so they are outside this repair. The latest 100 member-facing `#expert-picks` messages did not contain the malformed Dan Gamble odds-only card; this is a bounded check, not a complete historical audit. The original source image could not be recovered from the approval embed, so the actual wagers were not guessed or reconstructed. A new card requires a readable original source and complete terms.

## Follow-up: context-free exclusive total

The owner asked why no exclusives were appearing. At 12:33 PM MST, `#expert-picks` had zero October 20 posts. One new exclusive approval existed, but its entire member-facing wager was `Over 66.5 -110 (4 units)` with no game, team, player, or stat market. The live approval message `1562173337382420611` was changed to a held notice with no publish controls.

The first guard blocked price-only cards, but an otherwise complete extraction could still carry the matchup only in a hidden event field while the terms-only member card omitted it. `bot/lib/source-review.js` now holds context-free totals and generic ML/spread labels when the selection line itself does not identify the target. Existing complete matchup and player selections remain eligible. Focused source-review and collector tests: 61 passed; `git diff --check` passed. This does not reconstruct the original Telegram image or relax the strict better-than-`-200` odds rule.
