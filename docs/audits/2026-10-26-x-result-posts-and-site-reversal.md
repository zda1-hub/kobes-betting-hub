# Free-pick X result posts and site reversal — October 26, 2026 MST

## Owner request and before state

The owner clarified that every verified free-pick win or loss should produce an X result post, and explicitly rejected the new results layout on `/free-pick`. The website change in PR #335 had added aggregate and individual graded results below the free pick. The X result scanner already published the October 24 McCaffrey win and October 25 Kessler loss as standalone posts, but it required a confirmed queue receipt for the original X pick. A free pick graded from the canonical Discord log without that receipt would remain at `awaiting_original_post` and never publish its result.

## Change

- Revert the PR #335 website/results-feed changes in `free-pick.html`, `free-pick.css`, `free-pick.js`, `bot/lib/free-pick-results.js`, `cloudflare/bettinghub-publisher.js`, and the localhost preview proxy. Keep the existing audit history and the separate ESPN grading fix from PR #337. The public free-pick page returns to its prior email-gate/current-pick layout; no checkout or membership files change.
- For results verified from October 26 at 20:45 UTC onward, `bot/lib/free-pick-result-replies.js` uses one deterministic queue ID derived from the pick ID. It still adds the original X link when a confirmed receipt is available, but absence of that receipt no longer blocks a verified result. The ID stays the same if the original pick receipt appears later. Earlier grades continue using their existing parent-based IDs, avoiding duplicate posts for the McCaffrey and Kessler results already published.
- The existing source verification, canonical free-pick channel filter, W/L/P/V labeling, queue idempotency, and failed/uncertain X-delivery handling remain in place. A pending or unverified outcome cannot be posted as a result.

## Verification and release

The X profile visibly showed the [Kessler loss result](https://x.com/kobesbettinghub/status/2114819481977438406) and [McCaffrey win result](https://x.com/kobesbettinghub/status/2114819476986134695) before this change. Focused result tests cover both outcomes without an original X receipt and stable ID after a receipt later appears. Focused bot tests passed 5/5 and publisher tests passed 28/28; syntax and public-build checks passed (113 explicit public entries). The localhost `/free-pick` page displayed the restored current-pick and email-gate layout with no new results section at 320px, 390px and 1280px. Its document width matched each viewport and the shared header stayed at top 0. A populated mobile screenshot was inspected. Live deployment IDs and release status will be appended after release.
