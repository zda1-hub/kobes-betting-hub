# October 9 arbitrage scan coverage

Request: check whether the arbitrage feed is slow or limited, and improve valid alert coverage without inflating projected profit.

Live findings: the Render worker scanned four sport feeds about every six minutes from 7 AM to 6 PM MST. At 12:06 PM MST, the feed returned 115 events and one fresh opportunity above the configured 1% threshold. The feed reported 15,810 credits remaining out of a 20,000-credit monthly allotment. A positive gap below 1% did not trigger an alert. The configured example bankroll is $1,000, so a 1% edge displays about $10 projected profit; changing the example bankroll would change the dollar figure without improving the edge.

Affected files: `bot/lib/arbitrage-paper-monitor.js` and its tests. Before, if one book quoted the highest price on both sides, the scanner dropped the game even when another book formed a valid cross-book pair. After, it compares all cross-book pairs and selects the highest edge. The scheduling check now runs every 10 seconds so the existing five-minute scan interval does not round up to roughly six minutes. The Odds API is still called only when the interval has elapsed.

Verification: 19 focused monitor tests passed, including a new same-best-book case. No live provider response or member alert was fabricated.

Limits: the scanner currently covers head-to-head markets for four sports and the configured US books. It cannot create opportunities absent from those quotes. Adding spreads, totals, other sports, or more frequent provider calls consumes more of the 20,000 monthly credits and needs a quota budget and coverage check. Quotes must be recent and positive at approval; both sportsbooks can change odds or reject a wager. No profit is guaranteed.

Release: PR #204 merged as `be1a7ef` and Render deployment `dep-db4kef142hec73dm7dg0` reached live. A post-deploy scan at 12:59 PM MST covered the same four sports and 115 events, with no scan error; no qualifying edge was present in that scan. The new cross-book case was verified by the focused test, not inferred from that live scan.

Follow-up: at the owner's request, `FREE_RECAP_CHANNEL_ID` was set to an empty value in the live Render worker. Deployment `dep-db4kfgaj9qps73ct9kkg` reached live. This stops new posts to the free-pick recap channel because `publishDueFreeResults` returns when that channel is unset. It does not stop the free pick, website results, or separate private recap approvals.
