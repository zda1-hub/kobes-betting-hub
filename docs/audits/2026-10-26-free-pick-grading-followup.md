# Free-pick grading follow-up — October 26, 2026 MST

## Request and before state

The owner requires each free-pick win and loss to enter the public record after verification. The Oct 24 Christian McCaffrey Under 15.5 Rush Attempts free pick and Oct 25 Walker Kessler Over 15.5 Points free pick were still pending despite public result discussion. The existing grader searched only the post's operating date. The McCaffrey game was on the next day. The manual free-pick indexer also wrote `NFL` metadata for Kessler's basketball points prop. The page therefore had no source-backed grade for either pick, despite displaying older verified wins and losses.

## Change

- `bot/lib/espn-grading.js` searches the following day's slate for a player-only pick only when the known sport had zero games on the operating date and the next-day game starts after publication. For an explicit two-team matchup, it accepts only a unique next-day match starting after publication. It also matches whole team aliases to avoid substring false positives such as `ATL` across `at Los Angeles`.
- The grader recognizes both `Rush Attempts` and `Rushing Attempts`. It corrects the old manual free-pick football metadata only for a clearly labeled points/rebounds/assists selection with an exact manual-pick identity, leaving the game/player/date uniqueness checks intact.
- `bot/lib/manual-free-pick.js` indexes future clearly labeled basketball player props as basketball rather than NFL.

## Verification and release

Focused tests passed: 29/29 for ESPN grading and manual free-pick intake. Real read-only ESPN grading with the two saved pick IDs and exact published selection terms returned McCaffrey `W`, 7 rushing attempts, from ESPN game `401873017`, and Kessler `L`, 2 points, from ESPN game `401909861`. This validates the grader logic; the saved production log and public page still need live verification after deployment. A full repository test run reported 913 passes and seven failures in unrelated play-evidence, writeup archive, legacy offer, backdrop and learning-guide tests. No code in those failing modules was changed.

## Live verification follow-up

PR #337 merged as `df3da0c3`. Render bot deployment `dep-dbfrkpfb9u1s739ldkmg` reached live on October 26 at 20:39:54 UTC. Its logs recorded automatic source-backed grades for Kessler (`L`) at 20:40:09 UTC and McCaffrey (`W`) at 20:40:19 UTC. The public results endpoint refreshed at 20:41:00 UTC.

The live `https://kobesbettinghub.com/free-pick` page was checked in a browser after the refresh. It displayed 13 wins, 8 losses, 29 awaiting verification, and 21 individual verified results. The two newest cards were the Oct 24 McCaffrey Under 15.5 Rush Attempts win (7 rushing attempts) and the Oct 25 Kessler Over 15.5 Points loss (2 points), each with an original Discord-post link. Future results enter the page automatically after a source-backed grade; the page shows the latest 30 individual grades while aggregate counts cover all tracked verified picks. Pending or untracked historical picks remain the limitation and are not represented as results.
