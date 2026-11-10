# Approved KBH content calendar

The active schedule uses `America/Los_Angeles`, including daylight saving. The 28 weekly slots are coded in `bot/lib/marketing-calendar.js`. Thursday arbitrage is **3:30 PM Pacific**. X and Instagram Story receive the same target timestamp and keep separate receipts.

## What runs automatically

- The seven Free Pick slots are reserved for the existing canonical pick approval and delivery path. The calendar never fabricates a pick, duplicates that publisher, or backfills a missed slot.
- The four Instagram native poll slots require a person to choose a current matchup and add the poll sticker in the Instagram app. A static image is not called an interactive poll.
- The other 17 slots become scheduled **only** when Kobe or the KBH owner uses `/approve-calendar-post` with the exact X copy, an approved 1080 × 1920 JPEG, an internal source/consent reference, and the rights confirmation. The command is available up to 14 days ahead and closes 10 minutes before the slot. Arbitrage closes its early submission window 45 minutes before the slot so odds can be rechecked.
- That approval uploads one immutable JPEG to the existing publisher and reserves one X delivery and one Instagram Story delivery. Both workers check every five minutes. The existing Free Pick Story/Reel publisher remains in place. A failed or uncertain calendar delivery is **held** for inspection and is not blindly retried.

## Operator steps

1. Check the exact facts, settled record, current offer, member consent and image rights for the selected slot. Keep private VIP play details out of public art. This is especially important for arbitrage, member reviews and win claims.
2. In KBH Discord, Kobe or the owner runs `/approve-calendar-post`. Pick the dated Pacific slot, paste the exact X copy, attach the approved vertical JPEG, and provide a source/consent reference. The command's confirmation is the approval for that specific public content.
3. The private reply shows the deterministic calendar ID and UTC time. Before the slot, `/calendar-status` should show `X approved; IG approved`. Afterward, check **both** receipts independently for `published` and inspect the public X post and Instagram Story. `held` means investigate the existing post before any retry.
4. For native polls, add the actual Instagram poll sticker and options manually. For a tappable Story destination, add and tap-test the Discord link sticker in Instagram. Pixels showing a URL are not a link.

The weekly pattern has no more than four proposed content slots per day, counting the existing Free Pick slot and native polls. The scheduler does not release unapproved content to fill a slot. It does not generate or publish member reviews, odds, profit claims, or VIP screenshots on its own. An approved calendar Story displays the provided artwork; it cannot attach a native poll or clickable link sticker through the current Graph integration.

The next three education slots have exact X copy and original 1080 × 1920 Story JPEGs prepared in `drafts/calendar/README-2026-11-10.md`. They are ready for item approval; their presence in the repository is not a queued or published receipt.

At dispatch, both calendar publishers count confirmed Free Pick Reel or X receipts and already published calendar slots for the Pacific date. A calendar slot is held once four such slots have been used. This is a best-effort cap on the connected publishers; manually posted content or a Free Pick approved later in the day can change the total. Inspect the day before approving more content.
