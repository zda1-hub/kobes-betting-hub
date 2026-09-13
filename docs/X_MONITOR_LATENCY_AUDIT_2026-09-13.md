# X monitor latency audit — 2026-09-13

Status: the approved production remediation is deployed and verified. Automatic public X/source publishing remains disabled.

Scope: read-only production Supabase audit review covering the 10:00 and 10:15 Arizona collection cycles on 2026-09-13. No Render, X, OpenAI, Discord, database, or production configuration was changed.

## Observed evidence

| Measurement | Result |
|---|---:|
| Enabled monitored sources | 38 |
| Bounded concurrent intake workers | 12 (code default and maximum) |
| Effective production collection interval | 15 minutes |
| New Luna extraction limit | 2 per collection run |
| 10:00 cycle X calls | 76; average latency 118 ms; maximum 275 ms |
| 10:15 cycle X calls | 38; average latency 168 ms; maximum 319 ms |
| Distinct posts deferred after the two cycles | 853 |
| Total `MODEL_CALL_LIMIT_REACHED` events | 994 |
| Luna extraction runs | 4 |
| Average Luna latency | 4,311 ms |
| Approval cards created | 0 |

The scanner itself is fast. The 12 intake workers overlap source requests, and the current-source X calls completed in hundreds of milliseconds. The bottleneck is the two-call extraction allowance combined with the rule that every media-bearing post is a model candidate. Deferred posts retain the old source cursor so they remain eligible, which causes the backlog to be reconsidered in later cycles and inflates audit events.

Of the four Luna runs, two were rejected after extraction. Two from `@proplockss` passed event gating but were held before Discord because a regular writeup must contain at least three clean, relevant breakdown points. The correct public result was therefore zero approval cards; transport was working, but candidate selection and card-readiness gates prevented delivery.

At two extractions per 15-minute cycle, 853 distinct deferred posts cannot drain during today's operating window. Raising only the model cap would spend more but would not solve the generic-media backlog.

## Recommended correction

1. Preserve the 12 concurrent source workers; they are not the bottleneck.
2. Rank deterministic text-identified picks first across the entire collection pass rather than letting the fastest source worker consume the model allowance.
3. Send media-only posts to Luna only when the source is explicitly configured for photo review or the caption contains a low-cost betting signal; audit the rest as low-priority filtered content.
4. Persist a bounded deferred queue separately from the source cursor so a single deferred post does not force a repeated full-day source scan.
5. After the selection fix passes tests, start with six Luna calls per 15-minute pass while retaining the existing 50/day, 500/month, $1/day, and $15/month hard stops.
6. Acceptance target: a new qualifying text or approved-photo-source pick reaches `#pick-approvals` during the same collection pass; no generic-media backlog is replayed; every provider and gate outcome remains attributable in Supabase.

## Production remediation and acceptance

- Zakai Martin explicitly approved the production code deployment and the bounded model-call cap increase from 2 to 6.
- Production `main` deployed exact commit `518161b97b8645631bf1412996d8a208f35f8d86` successfully on Render at 10:35 Arizona time.
- Startup confirmed 38 enabled X sources and 12 bounded intake workers.
- The live worker used exactly 6/6 permitted Luna calls; the independent 50/day, 500/month, $1/day, and $15/month hard stops remained unchanged.
- Deferred candidates fell from 476 on the first remediated startup that was still subject to the stale two-call Render override to 85 after the override was corrected to six, an 82% reduction.
- The first remediated production startup created one private review packet. The six-call verification cycle created none because its inspected items were rejected or held by the existing event and writeup-quality gates, not because of the model-call bottleneck.
- Generic media now requires a cheap betting-caption signal before Luna, except for dedicated `photo_review` sources; strong text candidates are prioritized and media-only intake is bounded per source.
- No automatic public source publishing was enabled or performed.
