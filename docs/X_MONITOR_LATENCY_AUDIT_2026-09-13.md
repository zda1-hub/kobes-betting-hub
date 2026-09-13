# X monitor latency audit — 2026-09-13

Status: production monitoring is running, but the current candidate backlog policy is a pick-approval launch blocker. No public post was sent during this read-only audit.

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

Production remediation requires an explicit production deployment/configuration approval. Until then, Kobe can still publish manually, but the automatic X-to-approval intake should not be represented as timely.
