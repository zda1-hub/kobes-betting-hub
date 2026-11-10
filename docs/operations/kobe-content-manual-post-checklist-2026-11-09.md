# Kobe content handoff — November 9, 2026

This is the original content checklist. The approved-slot queue and its current operator instructions are in `docs/operations/kobe-approved-content-calendar.md`. The owner confirmed Kobe is in California, so every proposed slot below uses **America/Los_Angeles** and follows daylight-saving changes. Kobe asked to follow the calendar's times, and the owner confirmed **Thursday 3:30 PM Pacific** for arbitrage. When an item goes to both X and Instagram, target the **same calendar time** on both, then verify separate platform receipts. Count the existing automated Free Pick, Story, Reel, email and X deliveries toward the four daily slots; do not create duplicate publishers.

Live result gate: the old automatic X result-reply switch remains `false`. PRs #373 and #374 merged on November 9. Render deploy `dep-dbp6mai9lscs73at32vg` reached `live` at 5:54 PM Arizona time. The approval gate uses cutover `2026-11-10T00:49:23Z` and the existing private review channel. Startup logs confirm the five-minute scan and a read-only permission check for Kobe, the KBH owner and Kobe Bot. No new private result card, X result reply or Instagram result was observed during the startup check; a real officially graded result and a separate Discord approval are still needed to verify the full delivery path.

## Already working or implemented locally

| Workflow | Evidence and current boundary |
| --- | --- |
| Approved original Free Pick | Existing private pick approval, canonical Discord post, X text, public Free Pick page, premade Instagram Story and chat-card Reel, and an email delivery path. Each platform needs its own receipt; the source email does not itself approve a pick. November 9 read-only D1 receipts show both social emails and all 111 customer outbox rows sent. The `Daily Picks bridge not configured` log refers to a separate legacy bridge, not the customer email outbox. |
| Free Pick results | Existing ESPN grade and deterministic X reply under the original X post. The live gate creates a **separate** private result card after a verified final. Kobe **or the KBH owner** can approve, reject, or edit a short opener; the exact wager, grade and final stay locked. The old automatic X scan is off. The approved result also queues a 1080 × 1920 Instagram Story with its own receipt. The first real card and approved X/Instagram delivery still require observation. |
| Reel visual | The existing chat-message card already resembles the supplied reference. The deployed code adds a 0.45-second fade in and 0.55-second fade out to the six-second vertical MP4. The supplied Instagram Reel was visibly inspected on November 9; the actual live reference showed a dark-to-readable transition. Local frame-brightness tests verify both fades, but a published Instagram comparison remains open. |
| Exclusive wins | Existing `data/recap-workflow.json` targets the private review channel and `1550535535041187920` as the exclusive-wins destination. November 8 review-card receipts were observed. The separate writeup recap review channel was restored on November 9 at `1569551927115780187` after its prior ID was deleted; it retains Kobe and Kobe Bot access. Kobe's mobile ability to view the exclusive-wins destination and completed approval-to-destination receipts still need a live check; do not create a second exclusive-wins channel. |
| Instagram Story link | Current Graph request creates a Story with `image_url`, `media_type=STORIES`, and `access_token`; it sends no link sticker. A URL printed on artwork is not clickable. A person must add and test the Discord link sticker in Instagram, or a separately supported integration must be verified before promising automatic tap-through. |

## Live changes awaiting first delivery receipt

| Item | Destination | Schedule | Required approval and human step |
| --- | --- | --- | --- |
| Free Pick Reel fade change | Instagram Reel via existing publisher | On each newly approved pick, subject to the four-slot cap; no fixed time | Deployed; verify the next real Reel receipt and visible fade. Do not backfill an old pick. |
| Free Pick result approval gate | Private Discord result-review card, then X reply and Instagram Story | After official final and verified grade; no fixed clock time | X approval gate deployed and channel permissions verified. Instagram Story queue is implemented locally and awaits deployment. Observe the next real card, then have Kobe or the owner separately approve that **result**; check the X receipt, original-post reply, Instagram Story media receipt and visible Story. An original-pick approval does not approve its result. |

### Result-approval activation and live check

1. Verify the Render worker points at the intended GitHub branch and a persistent pick-log path. Confirm the existing X publisher URL, queue secret, reply start time, original-pick receipt, and Discord guild and Free Pick channel settings. Do not print secret values in logs or the handoff.
2. Use a private Discord review channel where Kobe, the KBH owner and Kobe Bot can read, and Kobe Bot can send and edit embeds. The bot checks these permissions before it posts a review card. Keep `FREE_PICK_X_RESULT_REPLIES_ENABLED=false` during the cutover; `render.yaml` also defaults it to false so a Blueprint sync cannot revive the old automatic flow.
3. After the merged bot build is live, set `FREE_PICK_RESULT_REVIEW_CHANNEL_ID` to that channel, `FREE_PICK_RESULT_APPROVAL_START_AT` to an explicit UTC cutover time, and `FREE_PICK_RESULT_APPROVALS_ENABLED=true`. The approval flow uses the existing X queue credentials while the old automatic-reply switch stays off.
4. Verify the startup log announces the approval scan. For the next officially graded Free Pick, confirm one private card with exact wager, grade, final and source evidence; confirm no public reply before approval. Either Kobe or the owner may edit the opener and approve or reject. Do not use a live result as a throwaway test.
5. After a real approval, check the deterministic X queue receipt and the public reply under the exact original pick; check a later scan does not duplicate it. If an X reply was posted manually during the hold, exclude that pick from the cutover or add its ID to `FREE_PICK_X_RESULT_REPLY_SKIP_PICK_IDS` before enabling the gate.
6. If any permission, source, queue or delivery check fails, set `FREE_PICK_RESULT_APPROVALS_ENABLED=false` and leave the old automatic-reply switch off. Investigate the existing receipt before retrying; use an approved, verified manual result only when its original post has no reply.

## Awaiting verified content, schedule or manual app action

The following times are Pacific local time (`America/Los_Angeles`) exactly as written in Kobe's proposed table unless noted. On November 9, 2026 this is PST; the zone will switch to PDT seasonally. No item below has been scheduled or posted by this handoff.

| Day / proposed time | Content and asset | Destination | Approval, verification and human posting step |
| --- | --- | --- | --- |
| Mon 9:00 | Weekend profit/unit recap from complete verified ledger | X + Instagram Story | Kobe reviews all wins, losses, pushes, voids and units; prepare actual card and post only after record verification. |
| Mon 11:30 | Newly approved Free Pick and graphic/video | X + IG Reel/Story + Discord + email | Kobe approves canonical pick; check current exact line/odds and every platform receipt. Do not force an unapproved pick into the slot. |
| Mon 3:00 | Latest real arbitrage/EV opportunity | X + IG Story | Verify current opportunity; show percentage, total stake, potential return; hide sportsbooks, player names, legs and actual bets. Do not claim risk-free profit. |
| Mon 6:30 | Original member review/slip screenshot | X + IG Story | Calendar time confirmed; verify the specific screenshot, its context and permission for public use; preserve image bytes. |
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
| Thu **3:30 PM Pacific** | Latest real arbitrage/EV opportunity | X + IG Story | Owner confirmed the calendar's 3:30 PM Pacific slot. Apply Monday's privacy and odds checks. |
| Thu 7:30 | Original member review/slip screenshot | X + IG Story | Calendar time confirmed; verify consent and preserve screenshot unchanged. |
| Fri 9:00 | Bankroll education | X + IG Story | Factual, approved tip; respect 12-topic rotation. |
| Fri 11:30 | Newly approved Free Pick | Same Free Pick destinations | Same canonical approval and delivery checks. |
| Fri 3:00 | Weekend VIP slate tease | X + IG Story | Kobe selects real upcoming slate; show no private play terms or invented edge. |
| Fri 7:00 | Community hype/verified win recap or member review | X + IG Story | Calendar time confirmed; use complete verified record and consented original assets. |
| Sat 9:30 | Newly approved Free Pick | Same Free Pick destinations | Same canonical approval and delivery checks. |
| Sat 12:00 | Current matchup poll | Instagram native Story poll + optional X poll | Team manually adds the poll sticker and options after game check. |
| Sat 3:00 | Latest real arbitrage opportunity | X + IG Story | Apply privacy/odds checks and redact VIP bet details. |
| Sat 6:30 | Afternoon winning slips | X + IG Story | Only genuine settled slips with permission, complete context and no invented win claim. |
| Sun 9:30 | Newly approved Free Pick | Same Free Pick destinations | Same canonical approval and delivery checks. |
| Sun 11:30 | VIP full-slate tease | X + IG Story | Confirm slate exists; reveal no private picks, odds or bettor details. |
| Sun 3:30 | Live sweat/game poll | Instagram native Story poll + optional X poll | Team manually adds actual poll sticker; confirm live event. |
| Sun 8:30 | Complete Sunday recap/proof or member review | X + IG Story | Calendar time confirmed; complete grade audit and screenshot consent before posting. |

### Asset and access checklist

- **20 member screenshots** arrived in Kobe's email and were retained byte-for-byte only in temporary local review storage. None is approved for public use solely by being attached. Check each original for handles, personal information, date, outcome and permission; keep a used/unused rotation ledger. Do not use AI to alter the image or words.
- **Free Pick Story example** is an old PJ Washington wager, not a reusable current pick. Generate a fresh asset from the newly approved canonical pick.
- **24 video attachments** were listed in email, but the connected Gmail reader cannot download that MP4 MIME type. Obtain the files through an authorized accessible source before using or claiming inspection.
- **Poll example** is a static postgame Notre Dame–Miami graphic. A person must create the native Instagram poll; no interactive poll was verified from that image.
- **Promo Story example** has no tappable link in its pixels. A person must add the free Discord or verified current VIP destination as an Instagram link sticker and tap-test it. The offer, code and member-count claims remain on hold.
- **No manual item is fully ready to post** until its event/offer/result and asset are verified and Kobe approves the specific public message. The calendar times are resolved, but time alone does not approve content. Send completed assets to the owner for review; do not message Kobe from this workflow.
