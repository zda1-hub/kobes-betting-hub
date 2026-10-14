# Cold streaks - October 14, 2026

Requested: complete the pending cold-streak report in the expert cheat-sheet approvals.

Changed bot/lib/expert-pulse.js and added bot/lib/cold-streak.test.js. Report now includes verified experts below 30% wins over the five completed MST days preceding the report date; W/L only, no zero-decision experts, exact 30% excluded. Lowest rate first, larger samples first on ties. Fewer than five settled decisions are explicitly marked small sample. Cold-only experts are included in review decisions and existing approval-gated publication; no automatic approval.

Validation: 17 focused tests pass, covering threshold boundaries, excluded grades, window, approval privacy and publication behavior. Deployment and Discord evidence pending below. No website, pricing or unrelated edits included.

Live verification: main commit 0dd1226; Render deployment dep-db7pk3cs728c73dfo6cg live October 14 at 8:05:23 AM MST. Opened the actual expert-cheat-sheet-approvals channel (1555357708780183612), review message 1555362704783319101. Its edited 8:05 AM card shows the new Cold streak section, including Your Daily Capper 0-3 and Betting with Bush 0-2 with small-sample labels. Current review counts 60 approved, 0 rejected, 25 pending. Screenshot cold-streak-discord-20261014.png. Newly qualifying experts remain pending Kobe's approval; no decisions or public pick publication were performed manually.
