# X pick throughput audit — 2026-09-13

Status: production diagnosis and fairness deployment complete. Commit `25a487b` is live; it made no public post or pick decision.

## Direct answer

Existing unanswered approval cards do not block new cards. Deduplication applies only to the same X post/current packet. The live worker delivered the Jaxson Dart card while older approvals still existed.

## Production evidence

The 11:36 Arizona Render cycle scanned all 38 enabled sources with 12 X intake workers and retained the six-call Luna run cap. Its terminal summary was:

- 574 candidate-like posts reached a deterministic decision path;
- 6 Luna extraction requests started;
- 388 candidates were deferred by the run-wide model-call cap and remain eligible for later intervals;
- 186 candidates were rejected by deterministic/model/event gates;
- 0 new approval packets were created in that cycle.

The same hour also recorded 14 otherwise-eligible split plays as `HELD_NOT_READY` because each had fewer than the required three clean, relevant breakdown points. This is a separate quality gate from extraction capacity.

## Root causes

1. Twelve workers make X fetching faster, but they do not increase the six paid Luna extraction slots.
2. Before this remediation, concurrent high-volume sources could consume multiple slots in one pass. Which source won a slot depended partly on request timing.
3. Source-local sorting preferred recognizable betting language, but did not prefer posts already containing enough statistical support to survive the three-bullet writeup gate.
4. The system intentionally holds thin picks instead of publishing invented support or a low-quality writeup.

## Deployed remediation

- Preserve the six-call run-wide spend cap.
- Default to one paid Luna extraction per source per run.
- Rotate the roster start by one 12-worker wave after every cycle so the same early accounts cannot repeatedly win the model budget.
- Within each source, prioritize explicit football picks with a selection line plus at least three numeric/statistical support lines, followed by bare terms and image-only candidates.
- Preserve deferred posts and all existing audit events; do not auto-publish anything.

Verification before deployment: focused collector suite 16/16; full repository suite 181/181. The first production cycle after deployment scanned from roster offset 0 and rejected 527 non-publishable candidates without a public post. Discord approval latency was then separately remediated through commits `78b9ad7` and `ff147a2`; the final Render deploy is `dep-dajfgctckfvc739pnomg` and its exact-main suite passed 126/126.

## Recommended next iteration

Do not simply raise the call cap. After one production observation window of the fairness change, compare: model calls, distinct sources selected, eligible cards, held cards, and estimated cost per ready approval. If the 14 thin candidates remain useful, add a separate private `NEEDS_WRITEUP` review state so Kobe may request an audited, on-demand writeup for a chosen candidate. Official OpenAI documentation confirms GPT-5.6 Luna supports Responses API web search and structured outputs, but web-search calls have an additional tool fee; that path needs explicit cost estimation and a click-triggered budget before implementation.
