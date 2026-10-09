# October 9 pick approval

Request: prioritize Kobe's ability to approve picks sent to the approval channel.

Finding: Render logs show Kobe successfully published pick `20261009-073-X` at 10:27 AM MST. Pick `20261009-099-X` failed at 10:30 AM MST because the bot imposed a VIP odds range of -200 to +200. This was an eligibility rule, not an account permission failure.

Affected files: `bot/index.js`; removed unused `bot/lib/writeup-odds.js` and its tests.

Before: a paid approval or manual VIP writeup with missing odds or odds outside -200 to +200 was blocked after Kobe selected it. After: Kobe can publish those picks to VIP when the existing market, writeup, upcoming-event, and exact-copy checks pass. The bot does not invent or change published odds.

Verification: `bot/index.js` syntax check passed. Focused approval access, routing, and source review suite passed (43 tests). The broader bot and pipeline suite has unrelated failures in Telegram reader and archive tests in this worktree; those do not exercise this change.

Status: local change; not yet published.
