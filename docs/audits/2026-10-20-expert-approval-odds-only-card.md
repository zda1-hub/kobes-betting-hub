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
