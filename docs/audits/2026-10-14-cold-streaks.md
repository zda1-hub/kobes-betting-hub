# Cold streaks - October 14, 2026

Requested: complete the pending cold-streak report in the expert cheat-sheet approvals.

Changed bot/lib/expert-pulse.js and added bot/lib/cold-streak.test.js. Report now includes verified experts below 30% wins over the five completed MST days preceding the report date; W/L only, no zero-decision experts, exact 30% excluded. Lowest rate first, larger samples first on ties. Fewer than five settled decisions are explicitly marked small sample. Cold-only experts are included in review decisions and existing approval-gated publication; no automatic approval.

Validation: 17 focused tests pass, covering threshold boundaries, excluded grades, window, approval privacy and publication behavior. Deployment and Discord evidence pending below. No website, pricing or unrelated edits included.
