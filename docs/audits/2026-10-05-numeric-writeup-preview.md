# Numerical free writeup preview — 2026-10-05

Requested change: Kobe asked for all relevant numerical stats in the public `#todays-writeups` preview, instead of vague descriptive categories.

Affected files: `bot/lib/free-writeup-board.js`, `bot/lib/free-writeup-board.test.js`.

Before: the board extracted only a narrow set of sentence patterns, capped results at three, and fell back to generic labels such as “usage and opportunity” and “recent production.” Today's two published writeups therefore displayed generic prose despite containing records, yards-per-game figures, and matchup rates.

After: the board extracts additional specifically labeled numbers from the source writeup, including conditional hit records, yards per game, tight-end yards allowed, red-zone rankings, and outside-zone yards per carry and success rate. It no longer caps source-backed stat items at three. It never copies player or team names into the stat column. When no safe numeric item is recognized, the column shows an em dash rather than an unsupported claim. The header identifies the column as numerical stats.

Verification: 11 local board tests pass. The new test uses the October 5 Kyle Pitts and Bijan Robinson source bullet formats and checks that their numbers appear without names or generic filler. The numbers are represented as attributed source-writeup claims; these tests do not independently verify the underlying sports statistics. Live board update remains to be checked after release.

Status: local worktree, not yet published at the time of this entry.
