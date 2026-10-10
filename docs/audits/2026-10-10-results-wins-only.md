# Winning plays page — October 10, 2026

Requested change: Remove the overall record, win-rate, and verified-settled cards from the results page. Show all verified winning plays and update the list with the daily results feed.

Affected files: `results.html`, `results.js`, `extras.css`, `index.html`, `bot/lib/public-results.js`, `bot/lib/public-results.test.js`, and `cloudflare/bettinghub-publisher.js`.

Before: the results page displayed the full record, win rate, settled count, and only the 50 most recent outcomes of every type in a fixed-height list. The homepage linked to it as a full tracked-picks ledger.

After: the page is titled “Recent winning plays,” the three summary cards are removed, and it displays only verified wins in a page-scrolling list. The daily publisher snapshot now includes all verified wins, not just the recent 50. The results page labels itself a wins-only highlight rather than a complete performance record. The homepage link and note identify the destination as winning plays. The existing full record and recent array remain in the private feed for other consumers.

Verification: focused public results and website release tests passed. The bot test confirms more than 50 wins are exported. Local preview and production behavior to be confirmed after deployment.

Limitation: until the newly deployed bot publishes a snapshot with the `wins` field, the page can show only wins found in the existing 50-item recent feed. The fuller list will appear on the next successful bot sync. The page omits losses and therefore must not be used to infer a win rate.

Status: local, pending publication.

## Publication confirmation

- PR #220 merged to GitHub main as `0b749d1`.
- Published the existing 85-entry public-site whitelist to Cloudflare site Worker version `ac4bde1a-63ac-41cc-b1a1-19fd0ba36ecd`. Published the compatible publisher Worker as version `547d22b0-dd4e-47df-9ed1-7c6fcb7075a1`.
- Render bot auto-deployed the merged commit and reached live status. The production results API returned 538 entries in the new `wins` field, all marked W, equal to the verified overall win count. The custom-domain results page returned HTTP 200 with the winning-plays heading and no summary-card markup.
- Follow-up: bumped the results page stylesheet version to ensure browsers load the natural-scrolling list style. Status: this final cache update is local pending deployment.
