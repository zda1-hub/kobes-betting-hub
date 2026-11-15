# Missing private approval receipt — November 15, 2026

## Requested change and observed failure

The owner asked whether Kobe's pick approvals were stuck. The live `#pick-approvals` and `#exclusive-pick-approvals` channels had visible pending cards, and recent Kobe approvals had reached member channels. Render logs showed one concrete orphan: the pending packet `20261115-310-X` still referenced a private approval message that Discord returned as `10008 Unknown Message` during startup refresh. Repeated refreshes would leave that packet pending with no usable card.

## Repair

When Discord definitively reports that a pending exclusive approval message is missing, the bot now retires the old audit receipt, clears only that missing message reference, and marks the packet held for current-event recovery. The existing collector rechecks game timing and source terms before sending a replacement **private** approval card. It does not publish a member pick or retry uncertain Discord responses. A monitored terms card enters this recovery path only when it carries the explicit missing-message marker. Previously prepared Free Pick copy is cleared so Kobe must prepare and review it again.

## Verification and limits

The focused collector test checks that ordinary monitored terms do not enter recovery, a definitively missing card does, and rejected or started picks remain blocked. Production recovery still requires a deploy and a new Discord receipt; until that is observed, this repair is local only. Existing pending cards still require Kobe's decision. Cards without a clear source, market, or permitted odds stay held.
