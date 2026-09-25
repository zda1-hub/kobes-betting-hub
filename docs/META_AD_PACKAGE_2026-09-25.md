# Meta vertical ad package — draft, 2026-09-25

Status: creative preparation only. No ad has been launched or purchased. Obtain Meta's applicable gambling/gaming written permission and confirm legal targeting before launch; use the stricter of Meta’s minimum age and each permitted location’s legal age. Do not imply that this is ordinary sports content to evade review.

## Creative 1: Show the work
- Format: 9:16, 15 seconds, captions and safe margins for Reels/Stories.
- 0–3 s visual: quick scroll through a generic game slate, no sportsbook logos or fake balances. On-screen: “A pick needs a reason.”
- 3–9 s visual: a real, redacted Kobe writeup card revealing sections “matchup,” “line,” and “risk.” Voice: “See the reasoning behind each play, with the line and timing in context.”
- 9–15 s visual: verified results page, including wins, losses, pushes, and pending. Voice: “Review the record. Decide for yourself.” CTA: “Explore Kobe’s Betting Hub.”
- Primary text: “Sports analysis with full writeups and a tracked record. Explore the free community and review results before deciding whether VIP is for you. 21+ where legal. Betting involves risk.”

## Creative 2: Results without cherry-picking
- Format: 9:16, 15 seconds.
- 0–3 s: “Wins are easy to post. What about every result?”
- 3–10 s: screen recording of the real results page; show win, loss, push, and pending labels without inventing numbers. Voice: “Our results page shows the full verified record available in the tracker.”
- 10–15 s: “Read the record. Then read the analysis.” CTA: “See results.”
- Primary text: “Look at the tracked record and the reasoning behind published plays. No outcomes are guaranteed. 21+ where legal.”

## Creative 3: How an arbitrage window works
- Format: 9:16, 20 seconds; educational framing.
- 0–5 s: two different prices on opposite sides of a generic two-outcome market. “Sometimes prices briefly disagree.”
- 5–13 s: simple graphic showing both stakes and the same projected return on either outcome; use a clearly labeled hypothetical example, never a fabricated live line.
- 13–20 s: odds timestamps move; text: “Both sides must be placed at the quoted prices. Odds can change before either bet is accepted.” CTA: “Learn how it works.”
- Primary text: “A time-sensitive odds discrepancy can create a positive-return opportunity only if both sides are locked at the stated prices. Learn the mechanics and risks. 21+ where legal.”

## Higgsfield workflow
1. Make a product profile from approved brand assets and the live site. Check every extracted claim, because the site includes old proof and dynamic results.
2. Choose Tutorial or UGC for the analysis concept; use a custom shot list for the results concept. Keep all result captures as real screen recordings. Do not generate fake winning slips, testimonials, or numbers.
3. Generate 9:16 draft clips without publishing. Add final text, logo, captions, 18+ and risk line in an editor; review on a phone at full size.
4. Export three hooks per concept. Hold the footage constant while testing a hook, and hold the hook constant while testing a CTA. Review accessibility, landing-page match, and Meta policy before upload.

## Measurement and launch gate
- Existing Pixel ID is present in `meta-pixel.js`; PageView and InitiateCheckout are implemented. A confirmed Purchase event is not implemented there. The internal analytics ledger does record authoritative Stripe `payment_completed` events.
- Before spend: implement and test a deduplicated Meta Purchase event from a confirmed Stripe payment, verify event value/currency and consent handling, and check Meta Events Manager diagnostics. Do not fire Purchase from a redirect alone.
- Use UTM source=meta, medium=paid_social, campaign/ad identifiers, then compare landing visits, checkout starts, confirmed payments, refunds, and VIP activations in the internal dashboard. Evaluate creative after a meaningful sample; do not optimize on clicks alone.
- Launch requires Meta permission, appropriate jurisdiction/age review, user approval of final creative and budget, and a working purchase event.

Sources checked: Meta Community Standards gambling permission (https://www.facebook.com/help/477434105621119); Meta/Facebook responsible gambling operator guide (https://assets.ctfassets.net/j16ev64qyf6l/38YGDeAUw7DX5F1eiLCbfx/2e2ab1c8ec3ca175de0b3155ac9c601b/Facebook_Operator_Guide__FINAL.pdf); Higgsfield Marketing Studio (https://higgsfield.ai/marketing-automation).
