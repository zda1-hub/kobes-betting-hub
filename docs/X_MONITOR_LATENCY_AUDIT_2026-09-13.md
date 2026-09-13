# X monitor latency audit — 2026-09-13

Status: production remediation approved by Zakai Martin, deployed and verified on Render. Automatic public X/source publishing remains disabled.

## Read-only production evidence

The 10:00 and 10:15 Arizona collection cycles showed:

- 38 enabled monitored sources and 12 bounded concurrent intake workers.
- 76 X calls at 10:00 (118 ms average, 275 ms maximum) and 38 at 10:15 (168 ms average, 319 ms maximum).
- 853 distinct deferred posts and 994 `MODEL_CALL_LIMIT_REACHED` events after the first two cycles.
- Four Luna extraction runs, averaging 4,311 ms, and zero Discord approval cards.
- Two extracted candidates passed event gates but were correctly held because they had fewer than three clean breakdown points.

This proved that X fetching and Luna latency were not the bottleneck. The old intake treated every media post as a model candidate, permitted only two model calls per 15-minute run, and left one-time rescan flags unset whenever any post was deferred. That caused handled media to be reconsidered and made the queue unable to drain.

## Approved remediation

- Preserve the 12 concurrent intake workers.
- Require a cheap betting-caption signal before generic media reaches Luna; retain image-only support for explicitly configured `photo_review` sources.
- Prioritize strong text picks, then caption-signaled media, then dedicated photo-review posts.
- Permit at most one weak media-only candidate per source per run; strong text picks do not consume that allowance.
- Mark one-time rescans complete even when another candidate is deferred, while retaining the old source cursor so the exact deferred post remains eligible.
- Increase the per-run Luna limit from 2 to 6.
- Preserve the existing hard stops: 50 requests/day, 500/month, $1/day, and $15/month.

## Cost projection

The first four production Luna calls on 2026-09-13 averaged 890 input tokens, 260 output tokens, and `$0.000490` estimated cost each; combined estimated cost was `$0.001959`.

At that measured size, a full two-call cycle is approximately `$0.00098` and a full six-call cycle is approximately `$0.00294`, an increase of about `$0.00196` per cycle. Across the configured five-hour window, the old per-run limit theoretically allowed 42 calls; the unchanged 50-request daily hard stop limits the new configuration to eight additional calls, approximately `$0.00392` at the observed average. The independent `$1` daily cost guard remains authoritative if image size or token use is unusually high.

## Verification

- Full launch-candidate branch suite: 177/177 passing.
- Hotfix rebased onto the exact production base: 121/121 passing.
- `git diff --check`: passing.
- Production `main` deployed exact commit `518161b97b8645631bf1412996d8a208f35f8d86` successfully on Render at 10:35 Arizona time.
- Startup confirmed 38 enabled X sources and 12 bounded intake workers.
- The live worker used exactly 6/6 permitted Luna calls; the independent daily and monthly limits remained unchanged.
- Deferred candidates fell from 476 on the first remediated startup that was still subject to the stale two-call Render override to 85 after the override was corrected to six, an 82% reduction.
- The first remediated production startup created one private review packet. The six-call verification cycle created none because its inspected items were rejected or held by the existing event and writeup-quality gates, not because of the model-call bottleneck.
- No automatic public source publishing was enabled or performed.

No public Discord, X, email, checkout, member, or billing action is authorized by this change.
