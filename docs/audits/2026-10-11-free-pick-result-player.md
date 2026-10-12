# Free-pick result follow-up: omitted structured player

Requested: locate the X result follow-up while continuing creator research.

Before: the approved packet for `20261011-101-X` explicitly identifies DeVaughn Vele. Its single wager and canonical log both say `Over 3.5 receptions`, line `3.5`, odds `-125`, but the canonical selection omits the player. The public corrected X parent is `2109342649693921335`. Automatic grading repeatedly stayed pending because it could not match a player.

Change: a narrow helper restores an explicit structured full player name only when packet identity, single-wager scope, selection, line, odds and any known event/league/sport agree. It refuses conflicts and never reconstructs from prose. New publications retain that name; existing unnamed canonical rows are repaired before grading. All other terms, timestamps, approvals and receipts remain unchanged. Multi-wager holds remain enforced.

Files: `bot/index.js`, `bot/lib/canonical-pick-player.js`, its regression tests, and `bot/lib/wager-ledger.test.js`.

Verification: authenticated Render shell confirmed exact packet/log identity and matching terms on October 11. Official Saints final box score lists Vele with four receptions: https://www.neworleanssaints.com/game-day/2026/reg-week5/vikings-at-saints/box-score . Forty focused canonical-log, ESPN grading, recap-hold and wager-ledger tests passed. Latest GitHub base was verified as `e483135` before release.

Release: local verification complete; production deployment and actual follow-up receipt are pending. This does not claim a sent result post. Creator research continues separately.
