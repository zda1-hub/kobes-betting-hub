# Daily delivery reliability — 2026-10-05

- Requested change: Ensure the expert trend review and morning recap checks work every day.
- Affected files: `bot/index.js`, `bot/lib/recap-delivery-status.js`, and its test.
- Before: The 7:30 AM check called the private recap missing whenever the final recap was still waiting for verified results, even if Kobe's provisional private review had already been queued.
- After: The check reads the dedicated morning review receipt. It separately reports unresolved final results and a failed final email. It never treats pending outcomes as wins or losses.
- Verification: Three focused Node tests passed and `bot/index.js` passed a syntax check. Render logs show the private morning review queued in five parts at 6:02 AM Arizona on October 5, while the expert sheet refreshed with 44 pending approvals. The old check generated a false missing-recap alert at 7:31 AM.
- Limitation: A queued receipt proves the worker accepted the email, not inbox delivery. The final recap remains pending because 41 results need individual verification.
- Status: Local change; not published.
