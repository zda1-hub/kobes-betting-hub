# Free-pick X result posts and site reversal — October 26, 2026 MST

## Owner request and before state

The owner clarified that every verified free-pick win or loss should produce an X result post, and explicitly rejected the new results layout on `/free-pick`. The website change in PR #335 had added aggregate and individual graded results below the free pick. The X result scanner already published the October 24 McCaffrey win and October 25 Kessler loss as standalone posts, but it required a confirmed queue receipt for the original X pick. A free pick graded from the canonical Discord log without that receipt would remain at `awaiting_original_post` and never publish its result.

## Change

- Revert the PR #335 website/results-feed changes in `free-pick.html`, `free-pick.css`, `free-pick.js`, `bot/lib/free-pick-results.js`, `cloudflare/bettinghub-publisher.js`, and the localhost preview proxy. Keep the existing audit history and the separate ESPN grading fix from PR #337. The public free-pick page returns to its prior email-gate/current-pick layout; no checkout or membership files change.
- For results verified from October 26 at 20:45 UTC onward, `bot/lib/free-pick-result-replies.js` uses one deterministic queue ID derived from the pick ID. It still adds the original X link when a confirmed receipt is available, but absence of that receipt no longer blocks a verified result. The ID stays the same if the original pick receipt appears later. Earlier grades continue using their existing parent-based IDs, avoiding duplicate posts for the McCaffrey and Kessler results already published.
- The existing source verification, canonical free-pick channel filter, W/L/P/V labeling, queue idempotency, and failed/uncertain X-delivery handling remain in place. A pending or unverified outcome cannot be posted as a result.

## Verification and release

The X profile visibly showed the [Kessler loss result](https://x.com/kobesbettinghub/status/2114819481977438406) and [McCaffrey win result](https://x.com/kobesbettinghub/status/2114819476986134695) before this change. Focused result tests cover both outcomes without an original X receipt and stable ID after a receipt later appears. Focused bot tests passed 5/5 and publisher tests passed 28/28; syntax and public-build checks passed (113 explicit public entries). The localhost `/free-pick` page displayed the restored current-pick and email-gate layout with no new results section at 320px, 390px and 1280px. Its document width matched each viewport and the shared header stayed at top 0. A populated mobile screenshot was inspected. Live deployment IDs and release status will be appended after release.

## Live release and limits

PR #339 merged as `67c41a0c`. Render bot deployment `dep-dbfrs3ss728c739oiabg` reached live from that exact commit; the post-startup X result scan ran without a new duplicate McCaffrey or Kessler result. The public-site Worker deployed as version `2ce52487-89ad-4b75-85f0-79ad5ba4b793`, and the publisher Worker as version `4ce7b1ac-b4a9-4b1d-9a5e-5a6691879fac`, with existing variables retained. The live `/free-pick` page again showed only the prior current-pick/email-gate view, with no added results section. Live `/health` returned `ready`, `xConnected: true`, and `freePickReady: true`. The internal results endpoint retained aggregate 13 wins and 8 losses but no individual `recent` field; that feed is no longer rendered on the public free-pick page.

The existing X posts prove delivery for those two already-verified results. The new missing-parent path is covered by deterministic queue tests, but no new post-merge graded pick has exercised it in production yet. Older grades before the cutover retain the previous receipt requirement to avoid a retrospective X-post flood and duplicates. Future picks still require a confirmed Discord publication and source-backed final grade; an unverified or unresolved result is never auto-posted.
