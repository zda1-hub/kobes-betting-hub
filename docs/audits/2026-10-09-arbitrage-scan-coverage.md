# October 9 arbitrage scan coverage

Request: check whether the arbitrage feed is slow or limited, and improve valid alert coverage without inflating projected profit.

Live findings: the Render worker scanned four sport feeds about every six minutes from 7 AM to 6 PM MST. At 12:06 PM MST, the feed returned 115 events and one fresh opportunity above the configured 1% threshold. The feed reported 15,810 credits remaining out of a 20,000-credit monthly allotment. A positive gap below 1% did not trigger an alert. The configured example bankroll is $1,000, so a 1% edge displays about $10 projected profit; changing the example bankroll would change the dollar figure without improving the edge.

Affected files: `bot/lib/arbitrage-paper-monitor.js` and its tests. Before, if one book quoted the highest price on both sides, the scanner dropped the game even when another book formed a valid cross-book pair. After, it compares all cross-book pairs and selects the highest edge. The scheduling check now runs every 10 seconds so the existing five-minute scan interval does not round up to roughly six minutes. The Odds API is still called only when the interval has elapsed.

Verification: 19 focused monitor tests passed, including a new same-best-book case. No live provider response or member alert was fabricated.

Limits: the scanner currently covers head-to-head markets for four sports and the configured US books. It cannot create opportunities absent from those quotes. Adding spreads, totals, other sports, or more frequent provider calls consumes more of the 20,000 monthly credits and needs a quota budget and coverage check. Quotes must be recent and positive at approval; both sportsbooks can change odds or reject a wager. No profit is guaranteed.

Status: local change pending publication.
