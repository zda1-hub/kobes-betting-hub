# NBA approval intake priority — October 20, 2026

## Request and evidence

The owner reported slow pick approvals and almost no NBA cards on opening day. At about 11:40 AM MST, ESPN listed three NBA games for October 20. The private `#pick-approvals` channel contained two NBA cards: Karl-Anthony Towns over 4.5 assists (-139), already posted as a free pick, and Jayson Tatum over 5.5 assists (-140), still awaiting review. Production Render logs showed 39 enabled X sources, 15-minute rotating scans, four OpenAI extraction calls per run, repeated deferrals, and several holds for absent or disallowed odds or fewer than four evidence points. The bot and approval channel were reachable; this was not a Discord permission failure.

## Change

On an NBA game day, the X collector now examines text picks with basketball signals before football and other text picks **within each source's buffered posts**. ESPN's public NBA scoreboard controls this priority; if unavailable, existing ordering applies. This does not change the source roster, scan interval, four-call production limit, per-source limit, price threshold, event verification, evidence requirement, private approval routing, or Kobe's approval decision. It adds one public ESPN scoreboard read per collection run.

## Verification and limits

Focused collector tests cover NBA slate detection, fail-open behavior, basketball-first sorting, and preservation of existing pick gates. This is a throughput priority change, not an assurance of a high card count. A source without valid odds, a current exact event, and the required evidence still cannot enter approvals. Source-level rotation and the four-call cap remain material delays; increasing paid API throughput requires separate cost review. Deploy success must be followed by runtime logs and a real NBA approval receipt before calling the effect live.
