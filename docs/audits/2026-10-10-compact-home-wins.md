# Compact homepage wins card — October 10, 2026

Requested change: Kobe proposed a static 65% win percentage on the homepage with detailed results on the linked record page. The current published ledger has 538 wins and 481 losses, a 52.8% settled win rate, so 65% is unsupported and was not added.

Affected file: `index.html`. Before: the homepage tracked-wins card showed the verified win count, a horizontal rail of winning picks, controls, and two explanatory notes. After: the card retains the live verified win count, tracking-since note, and “See overall record” link while removing the visible rail and controls. The full outcome detail remains on `results.html`. `home-results.js` still fetches the live ledger for the summary.

Verification: inspected the live publisher `/api/results` payload on October 10 (538 wins, 481 losses, 21 pushes, 0 voids); checked markup and local preview. Limitation: a write-up-only win rate and a 65% figure need a defined cohort and supporting records. Status: local until release confirmation is appended below.

## Follow-up: historical write-up estimate

The user clarified that 65% refers to Kobe’s broader historical write-up plays, for which complete records are unavailable. The homepage card now shows “65% historical win rate” as a **Kobe-reported estimate**, with an immediate disclosure that complete historical records are unavailable and that the linked verified ledger is a separate, narrower dataset including losses. The visible homepage rail remains removed. Affected files: `index.html`, `landing-continuity.css`, and the homepage release test. This claim is not independently verified; if a documented write-up cohort becomes available, replace the estimate with its measured rate. Status: local pending release confirmation.
