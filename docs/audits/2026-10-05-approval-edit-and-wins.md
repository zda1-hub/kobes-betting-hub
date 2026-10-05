# October 5, 2026 — approval editing, exclusive wins access, numeric writeup preview

## Requested

- Make expert trend approval easier to review and edit approval messages before publication.
- Restore the exclusive wins destination.
- Show relevant numerical stats in today's public writeup preview without generic situational prose.

## Changes and current behavior

- `bot/index.js`: emailed Trends approval cards now have an Edit text control. Kobe's edited body replaces the pending private preview before a separate Post Trends click. The original destination remains locked. Stale edit forms, other guilds, other channels, non-approvers, and Discord mentions are rejected.
- `bot/lib/expert-pulse.js`: manually submitted expert cards now allow Kobe to edit their note before approval; the approved VIP card uses that revised note. Verified expert records remain generated from the graded ledger and cannot be manually changed through this control.
- `bot/lib/free-writeup-board.js`: public card evidence is condensed to numerical values, stat names, units, sample sizes, and ranks. Vague descriptions and forecasts are not added. Player/team names remain hidden; the full writeup stays in VIP.
- Existing Discord channel `🏆・vip-expert-wins` (`1550535535041187920`) already contained the exclusive recap history and is the configured destination in `data/recap-workflow.json`. It was renamed `🏆・exclusive-wins`, preserving its channel ID and history. Render logs showed `Missing Access` on October 5. The existing Kobe Bot account was restored to that private channel with View Channel, Send Messages, Embed Links, and Read Message History. No member access was broadened and no duplicate wins channel was created. `bot/lib/welcome.js` now uses the restored name as its fallback label.

## Verification

- Focused board and expert pulse tests: 26 passed.
- `bot/index.js` syntax and `git diff --check` passed.
- Discord settings showed the channel remained private, VIP retained access, and Kobe Bot gained the four posting permissions. A new approved recap has not been sent as a permission test; publication still requires Kobe's approval.

## Limitations

- Existing recap cards expose an editable Kobe note, and normal writeup cards expose evidence editing. Structured wager terms, graded results, live arbitrage quotes, and auto-generated expert records remain locked to prevent a member-facing post from diverging from its source. A blanket free-form editor across every approval type is not yet implemented.
- Emailed Trends cards posted before this code release retain their old button layout until requeued or manually refreshed.
- Numeric writeup values are extracted from source writeups; they are not independently verified by the preview renderer.

## Release

Local branch only until PR merge and Render deployment are confirmed below.
