# Arbitrage example and Discord start-here — October 8, 2026

## Request and scope

The owner asked to add the concise betting arbitrage explanation and worked example to the homepage and guide, make betting arbitrage clear in the Discord start-here message, and publish the changes. The public site retains its existing card design and membership flow. The example is hypothetical; it does not use current sportsbook prices or promise a profit.

## Files and behavior

- `index.html`, `mobile-polish.css`: replaced the long homepage arbitrage card with a concise explanation and an accessible inline “See an example” disclosure. The example shows two hypothetical +110 sides at $95.24 each, a $190.48 total stake, a $200.00 payout on either side, and a $9.52 projected return before practical risks. The existing guide link remains.
- `guides/sports-betting-arbitrage-explained.html`: replaced the older $1,000 illustration with the same $190.48 example and explicit acceptance, market-rule, limit, and void conditions.
- `bot/lib/welcome.js`: future opt-in welcome DMs explicitly mention reviewed betting arbitrage alerts.
- `bot/index.js`: on production startup, the bot edits only its existing October 1 start-here post, replacing the vague “arbitrage” phrase with “betting arbitrage alerts.” It checks the guild, channel, message author, and exact old text before editing, so it does not create a duplicate or alter other posts.
- `render.yaml`, `bot/index.js`: align the configured Arizona arbitrage scan window and code fallback to 7 AM–6 PM MST, matching the owner’s earlier request and the homepage claim.

## Verification and release

- Local preview: the homepage disclosure opened and remained readable at desktop and 390px mobile widths; the guide displayed the matching figures. The original preview worktree remains local.
- On this release branch from current `origin/main`, `node --check bot/index.js`, the focused arbitrage monitor and public preparation tests (22 passed), the explicit public build (84 entries), and `git diff --check` passed.
- Two unrelated older bento tests still expect preexisting `.html` links and extensionless filesystem paths, while the current public builder intentionally rewrites links to clean routes. Those failures are not caused by this change.
- Release status: prepared; live publication and receipt to be appended after deployment.

## Live release receipt

- GitHub PR #196 merged to `main` as `5e5c445547c0ee20d3ce5090657d7b4648fc36f3`.
- Render background worker deployment `dep-db46ra1bgiqc738l6ehg` reached live. Its `ARBITRAGE_WINDOWS_ARIZONA` setting was updated to `07:00-18:00`.
- The existing Kobe Bot post in `#start-here` (`1555365075894927412`) was edited in place and visibly reads “betting arbitrage alerts.” No new post was created.
- Cloudflare Worker `kobes-betting-hub` deployed version `a12cf8de-7d5f-47aa-848f-1d6fa61f19a7` from the merged public whitelist build. A request to the custom domain confirmed `BETTING ARBITRAGE`, `See an example`, and `$190.48` on the homepage and the matching `$190.48` and `$9.52` figures on the guide.
- State: published October 8, 2026 MST. No remaining release blocker.
