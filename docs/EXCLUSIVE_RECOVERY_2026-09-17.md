# Exclusive private-approval recovery — September 17

## Authorized scope and outcome

The owner requested today's clear exclusive picks in **private pick approvals**, not direct member publication. EZMSports is an enabled source. Across nine exclusive feeds the saved audit contained 53 posts and 35 candidate posts. Recovered **29 capper cards containing 54 source wagers** into approval channel `1539135477355905094`. Twenty-seven cards are newly recovered in this batch; two were recovered earlier.

Direct reads of all 29 private message IDs returned HTTP 200, the correct approval-channel ID, the exact capper-and-wager-bullets body (or its normal closed-card suffix), and no image. No added breakdown, invented odds, inferred opponent display, or automatic approval was used. The 15:06 MST snapshot showed **27 owner approvals and two still undecided**. All published decisions had the same configured Kobe approver identity; the operator did not click approve or directly publish.

Six candidate posts remain held, rather than filling the room with unusable cards: two lacked a full player identity and four lacked a distinct original capper. Non-pick posts and promotions are not approval candidates.

## Cause

- `Lions/Bills o54.5`, `Dodgers/Reds u10.0` and `White Sox ML` were missed by intake signals, rejected for omitted league labels, or delayed by a per-source extraction cap.
- Clear original bet terms were subjected to independent ESPN matchup verification intended for researched writeups.
- Overflow from a one-image intake slot was marked handled instead of deferred, hiding unevaluated older posts.
- The initial fast batch hit Discord HTTP 429 after 17 new successful sends. Ten explicit rejected sends remained reserved, not deleted or blindly recreated.

## Live behavior

`pipeline/exclusive-text.js` parses only a conservative capper-name + explicit-wager-lines shape for enabled `terms_only` feeds. All displayed wager text, prices and stakes remain verbatim. Unknown/prose/mixed promotional text falls back to normal source extraction; no guessed enrichment is substituted. Text fast-path work consumes no model call. Image extraction remains bounded, and overflow retains eligibility.

Exclusives use source-only human review: a current Pacific-day source, clear original capper, actual market, usable matchup context for generic totals, and player identity are still required. Missing independent league/opponent coverage no longer blocks clear exclusive terms. The regular-pick sport, event, roster, four-to-eight-bullet evidence, and copy-lock gates remain unchanged. Kobe's role authorization, workflow pause, audit claim and publication deduplication remain the final approval gate. Existing known event-start timestamps still block stale exclusive publication.

This is **not independent verification that source odds are currently available**. Kobe reviews the original wager terms before publishing.

`pipeline/discord-retry.js` waits the provider's bounded `retry_after` on explicit HTTP 429 only. Every retry is audited. Network, audit and 5xx uncertainty are never automatically retried. Recovery reserves a durable packet before sending; pending/uncertain attempts remain quarantined and deduplicated. Resuming a confirmed rate-limit reservation additionally requires positive audit evidence of only rejected 429 approval sends. All ten initial rate-limited reservations were successfully sent to private approvals using their original pick IDs; no reservations remain from this batch.

## Validation and rollout

- Exclusive source-term intake: `1d600cfda37638077b1a72ebb11ea76f83880adf`, Render `dep-dam66g17lnhs73cbg420`, live.
- Rate-limit handling and same-packet recovery: `279833b56598d7c5e721c038c6d0aa6f9cf2282e`, Render `dep-dam67qjncjis73cag29g`, live.
- Recovery quarantine hardening: `b076acf` (rollout evidence recorded in PROJECT_CONTROL.md).
- Full release suite: **240 passed, zero failed**.
- Production public smoke: **5/5 passed** after intake/rate-limit deployment.
- Direct private Discord acceptance: **29 cards, 54 wagers, zero content/channel/image mismatches**.
- No new model or X refresh calls were needed for the saved-post recovery. No billing, membership, tax, website or social-publishing setting was changed.

## Next routing decision

A separate `#exclusive-approvals` room is recommended for this volume, so exclusive cards do not bury regular writeups. It is only a proposal: current delivery still uses the existing pick-approvals channel until the owner authorizes a new channel and route.

## Rollback precautions

Do not delete durable recovered packets or reset collection cursors: Kobe may already have approved their cards. Retain pending/uncertain-send quarantine and existing source-post deduplication. Reverting to the old event/extraction gates will again suppress clear source-only exclusives and should require an explicit owner decision. Never replay this batch directly to the member-facing channel.
