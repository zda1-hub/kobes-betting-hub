# Exclusive approval response repair — November 14, 2026

Requested change: the exclusive approval buttons left Kobe Bot thinking and one click showed “didn't respond in time.”

Observed: Render logs around 9:33–9:37 AM Arizona showed a burst of approvals, an expired Discord interaction on a repeat click, database connection timeouts, and a worker restart. Several posts completed; no uncertain approval was replayed. The first Free Pick from an exclusive was not established by those logs.

Changed: `bot/index.js` acknowledges each source-review click before checking the per-card processing guard, then gives an immediate visible progress receipt. Independent Free Pick research has a 45-second deadline and an explicit no-post timeout message. Optional writeup/expert display-board refreshes run after the canonical Discord post without holding the approval reply; their existing periodic refresh remains active.

Verification: `node --check bot/index.js` and 103 focused source-review/collector tests passed locally. No real pick was posted in testing. Confirm the next live approval click returns a final receipt; an upstream database outage can still delay required audit writes and must remain fail-closed.

Release status: local pending deployment.
