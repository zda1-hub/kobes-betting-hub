# Kobe content handoff — November 9, 2026

This is a working checklist, not a live posting calendar. The owner confirmed Kobe is in California, so every proposed slot below uses **America/Los_Angeles** and follows daylight-saving changes. The owner selected **Thursday 3:00 PM Pacific** for arbitrage. The member-review slots still conflict; do not activate those slots until a single time is chosen. Count the existing automated Free Pick, Story, Reel, email and X deliveries toward the four daily slots; do not create duplicate publishers.

Production hold: the old automatic X result-reply switch was set to `false` on November 9 at about 5:18 PM Arizona time. Render deploy `dep-dbp65gm1egvs73b663m0` reached `live`; its startup logs no longer announce the automatic result-reply scan. The approval-card code in draft PR #373 is **not deployed**. Until it is reviewed, merged, configured and observed live, verified results can be graded but cannot be assumed to appear on X. A human may post only the exact verified result after Kobe approves that result and checks for an existing reply.

## Already working or implemented locally

| Workflow | Evidence and current boundary |
| --- | --- |
| Approved original Free Pick | Existing private pick approval, canonical Discord post, X text, public Free Pick page, premade Instagram Story and chat-card Reel, and an email delivery path. Each platform needs its own receipt; the source email does not itself approve a pick. A November 9 pick logged `Daily Picks bridge not configured`, so email delivery must be checked per pick rather than assumed. |
| Free Pick results | Existing ESPN grade and deterministic X reply under the original X post. This branch adds a **separate** private result card after a verified final. Kobe can approve, reject, or edit a short opener; the exact wager, grade and final stay locked. The existing automatic X scan is superseded only when `FREE_PICK_RESULT_APPROVALS_ENABLED=true` with an explicit cutover timestamp and private review channel. Instagram result publishing is not implemented: approved copy remains manual. No new result approval has been activated or deployed by this branch. |
| Reel visual | The existing chat-message card already resembles the supplied reference. This branch adds a 0.45-second fade in and 0.55-second fade out to the six-second vertical MP4. The supplied Instagram Reel was visibly inspected on November 9; the actual live reference showed a dark-to-readable transition. Local frame-brightness tests verify both fades, but a published Instagram comparison after deployment remains open. |
| Exclusive wins | Existing `data/recap-workflow.json` targets the private review channel and `1550535535041187920` as the exclusive-wins destination. November 8 review-card receipts were observed. Kobe's mobile ability to view the destination and a completed approval-to-destination receipt still need a live check; do not create a second channel. |
| Instagram Story link | Current Graph request creates a Story with `image_url`, `media_type=STORIES`, and `access_token`; it sends no link sticker. A URL printed on artwork is not clickable. A person must add and test the Discord link sticker in Instagram, or a separately supported integration must be verified before promising automatic tap-through. |

## Ready for owner review, not ready to publish

| Item | Destination | Schedule | Required approval and human step |
| --- | --- | --- | --- |
| Free Pick Reel fade change | Instagram Reel via existing publisher | On each newly approved pick, subject to the four-slot cap; no fixed time | Review a locally rendered real approved pick, merge/deploy the branch, then verify the next Reel receipt and visual fade. Do not backfill an old pick. |
| Free Pick result approval gate | Private Discord result-review card, then X reply | After official final and verified grade; no fixed clock time | Set the private review channel and cutover timestamp, deploy, verify Kobe's access, have Kobe approve each **result**. An original-pick approval does not approve its result. For Instagram, use the approved copy and a genuine result graphic through a human posting flow until its result publisher exists. |

## Awaiting verified content, schedule or manual app action

The following times are Pacific local time (`America/Los_Angeles`) exactly as written in Kobe's proposed table unless noted. On November 9, 2026 this is PST; the zone will switch to PDT seasonally. No item below has been scheduled or posted by this handoff.

| Day / proposed time | Content and asset | Destination | Approval, verification and human posting step |
| --- | --- | --- | --- |
| Mon 9:00 | Weekend profit/unit recap from complete verified ledger | X + Instagram Story | Kobe reviews all wins, losses, pushes, voids and units; prepare actual card and post only after record verification. |
| Mon 11:30 | Newly approved Free Pick and graphic/video | X + IG Reel/Story + Discord + email | Kobe approves canonical pick; check current exact line/odds and every platform receipt. Do not force an unapproved pick into the slot. |
| Mon 3:00 | Latest real arbitrage/EV opportunity | X + IG Story | Verify current opportunity; show percentage, total stake, potential return; hide sportsbooks, player names, legs and actual bets. Do not claim risk-free profit. |
| Mon 6:30 **or 5:00** | Original member review/slip screenshot | X + IG Story | Resolve conflict with the later 5:00 instruction; verify the specific screenshot, its context and permission for public use; preserve image bytes. |
| Tue 9:00 | Current real matchup question | Instagram native Story poll + optional X poll | Team posts manually in Instagram and adds the actual poll sticker/options. The supplied Notre Dame–Miami image is an example, not an interactive poll or a current matchup. |
| Tue 11:30 | Newly approved Free Pick | Same Free Pick destinations | Same canonical approval and delivery checks as Monday. |
| Tue 3:00 | Real behind-the-scenes research | X + IG Story | Kobe selects a current, non-VIP-revealing source and approves copy/asset; person verifies what is visible before posting. |
| Tue 7:00 | Original member review/testimonial | X + IG Story | Verify screenshot, context and marketing consent, then post unchanged. |
| Wed 9:00 | Midweek bankroll check | X + IG Story | Use real data or plainly labeled general education; Kobe approves. The source graphic's profitability claims need revision before reuse. |
| Wed 11:30 | Newly approved Free Pick | Same Free Pick destinations | Same canonical approval and delivery checks. |
| Wed 2:30 | Educational betting tip | X + IG Story | Use one of the 12-topic rotation only after factual review; avoid promises of profit or universal rules. Keep a rotation ledger so all 12 run before repeats. |
| Wed 6:00 | Current VIP access CTA | X + IG Story | Verify live offer and checkout terms. The supplied promo artwork says `VIP20`, `20% off`, `1,300+ active members`, `24/7 handicappers`, and `limited time`; these claims are **unverified**. Do not use that graphic until each is proven or replaced. For Story, a person adds and tests the actual link sticker. |
| Thu 9:00 | Current game pick'em | Instagram native Story poll + optional X poll | Team manually adds poll sticker/options after matchup check; static artwork alone is not a poll. |
| Thu 11:30 | Newly approved Free Pick | Same Free Pick destinations | Same canonical approval and delivery checks. |
| Thu **3:00 PM Pacific** | Latest real arbitrage/EV opportunity | X + IG Story | Owner resolved 3:00 versus 3:30 as 3:00 Pacific. Apply Monday's privacy and odds checks. |
| Thu 7:30 **or 5:00** | Original member review/slip screenshot | X + IG Story | Resolve review-time conflict; verify consent and preserve screenshot unchanged. |
| Fri 9:00 | Bankroll education | X + IG Story | Factual, approved tip; respect 12-topic rotation. |
| Fri 11:30 | Newly approved Free Pick | Same Free Pick destinations | Same canonical approval and delivery checks. |
| Fri 3:00 | Weekend VIP slate tease | X + IG Story | Kobe selects real upcoming slate; show no private play terms or invented edge. |
| Fri 7:00 **or 5:00** | Community hype/verified win recap or member review | X + IG Story | Resolve conflict with later review instruction; use complete verified record and consented original assets. |
| Sat 9:30 | Newly approved Free Pick | Same Free Pick destinations | Same canonical approval and delivery checks. |
| Sat 12:00 | Current matchup poll | Instagram native Story poll + optional X poll | Team manually adds the poll sticker and options after game check. |
| Sat 3:00 | Latest real arbitrage opportunity | X + IG Story | Apply privacy/odds checks and redact VIP bet details. |
| Sat 6:30 | Afternoon winning slips | X + IG Story | Only genuine settled slips with permission, complete context and no invented win claim. |
| Sun 9:30 | Newly approved Free Pick | Same Free Pick destinations | Same canonical approval and delivery checks. |
| Sun 11:30 | VIP full-slate tease | X + IG Story | Confirm slate exists; reveal no private picks, odds or bettor details. |
| Sun 3:30 | Live sweat/game poll | Instagram native Story poll + optional X poll | Team manually adds actual poll sticker; confirm live event. |
| Sun 8:30 **or 5:00** | Complete Sunday recap/proof or member review | X + IG Story | Resolve time/content conflict; complete grade audit and screenshot consent before posting. |

### Asset and access checklist

- **20 member screenshots** arrived in Kobe's email and were retained byte-for-byte only in temporary local review storage. None is approved for public use solely by being attached. Check each original for handles, personal information, date, outcome and permission; keep a used/unused rotation ledger. Do not use AI to alter the image or words.
- **Free Pick Story example** is an old PJ Washington wager, not a reusable current pick. Generate a fresh asset from the newly approved canonical pick.
- **24 video attachments** were listed in email, but the connected Gmail reader cannot download that MP4 MIME type. Obtain the files through an authorized accessible source before using or claiming inspection.
- **Poll example** is a static postgame Notre Dame–Miami graphic. A person must create the native Instagram poll; no interactive poll was verified from that image.
- **Promo Story example** has no tappable link in its pixels. A person must add the free Discord or verified current VIP destination as an Instagram link sticker and tap-test it. The offer, code and member-count claims remain on hold.
- **No manual item is fully ready to post** until its event/offer/result and asset are verified and Kobe approves the specific public message. Member-review slots also need the 5:00-versus-table-time conflict resolved. Send completed assets to the owner for review; do not message Kobe from this workflow.
