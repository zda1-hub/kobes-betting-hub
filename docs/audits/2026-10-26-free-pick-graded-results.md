# Free-pick graded results — October 26, 2026 MST

## Request and prior behavior

The owner requested that every verified free-pick win or loss appear on the free-pick page, including days without a new pick. Previously the page showed only the current pick/email gate. The bot published an aggregate results snapshot every minute, but its individual records contained only selected recent wins. At 1:03 PM MST, the live free-pick results endpoint reported 12 verified wins, 7 verified losses and 31 pending picks; the public free-pick page showed none of that record. Pending outcomes are not wins or losses and must remain excluded until verified.

## Change

- `bot/lib/free-pick-results.js` now adds the latest 30 verified free picks in verification order, with each win, loss, push or void, its original Discord post, exact published selection/line/odds, recorded final outcome when available, and grading timestamp. An older game graded late rises to the top. Existing aggregate and wins-only fields remain compatible.
- `cloudflare/bettinghub-publisher.js` validates and serves the new individual-results field. It accepts the older snapshot while the bot deployment catches up and rejects unverified results and untrusted post URLs. The bounded payload limit increases from 20 KB to 40 KB so 30 full entries do not fail validation.
- `free-pick.html`, `free-pick.css` and `free-pick.js` add a public results section below the current free pick. It shows verified wins, verified losses, unresolved count and the latest graded entries. It polls the read-only results endpoint once a minute while visible and refreshes on tab return; failure states remain explicit. No email, payment, result-grade or betting outcome is created by the browser.
- `scripts/preview-site.py` adds a read-only proxy for the same results feed so the production page can be reviewed locally without a write operation.

## Verification and release

Focused bot and publisher tests passed locally on October 26 (2 and 28 tests), as did the existing four free-pick inline tests, JavaScript syntax checks and the 113-entry public build. A local-only fixture showed a loss and wins with a long selection at 320px, 390px and 1280px. The first 320px check found the update timestamp forcing 362px document width; mobile wrapping fixed it, and the next check measured exactly 320px. The 390px and 1280px documents matched their viewports; the shared header stayed at top 0, all three result entries rendered, and no browser warning or error was recorded. Screenshots were reviewed in the browser task. The fixture uses clearly labeled synthetic picks only in the localhost preview and is not in the public build.

Deployment and live verification are pending below; this entry does not claim publication yet. The per-pick feed is capped at the 30 most recently **verified** results while the totals cover the tracked log. Older posts may be absent from the log; pending rows are not assigned an outcome. The website sync follows verified grading, so it cannot display an unverified outcome merely because a game appears final.
