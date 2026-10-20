# Arbitrage NBA coverage and empty-alert check — October 20, 2026

## Request

Explain why VIP members have not received arbitrage opportunities and extend the existing US scanner to NBA moneylines without materially increasing Odds API usage.

## Observed production state before the change

- Render worker `srv-da6hvmijnfac73apb6v0` scanned every five minutes from 07:00 to 18:00 MST.
- It scanned NFL, college football, MLB and NHL moneylines from configured US books. NBA was absent.
- Forty-two scan receipts between 07:00 and 10:30 MST on October 20 reported no opportunity meeting the configured 1% minimum edge. Some scans found one fresh mathematically positive cross-book price, but none reached 1%.
- The source Blueprint listed only NFL, college football and MLB, and omitted the interval setting; it did not match the live NHL/five-minute configuration.

## Change

- Added `basketball_nba` to `ARBITRAGE_SPORTS` and set `ARBITRAGE_SCAN_INTERVAL_MINUTES` to six minutes. This changes planned odds calls from roughly 48 to 50 per hour during the configured window (four sports every five minutes versus five sports every six minutes), excluding approval rechecks.
- Kept the live 1% discovery threshold, five-minute quote freshness rule, private approval and live recheck before member posting. No opportunity is fabricated or guaranteed.
- Render environment values were merged into the existing worker environment, triggering deployment `dep-dbbqbb3rjlhs73es2a40` from the already released application commit. The matching Blueprint values are recorded in `render.yaml` for future syncs.

## Verification and limits

- The Render deployment reached `live` at 10:33 MST. At 10:34 MST the monitor reported the expected private approval channel, VIP destination and `memberPostingEnabled: true`. At 10:36 MST the first post-deploy scan reported `basketball_nba`, `intervalMinutes: 6`, 130 events and zero opportunities meeting the 1% threshold. The feed reported 13,356 requests remaining.
- An optional expired-example archive channel no longer exists. The worker logged that live scans continue; it did not prevent the 10:36 scan.
- The current scanner uses `regions=us` and `markets=h2h` only. It does not provide Ontario bookmaker odds, point spreads, totals or player props. US arbitrage prices must not be represented as available to Ontario members.
- A 1% quoted edge is theoretical before stake limits, odds movement, taxes or account restrictions. A missing alert can correctly mean no qualifying cross-book prices were available.
