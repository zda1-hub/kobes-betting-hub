# KBH calendar handoff — November 10, 2026

All times here are Pacific. Existing approved Free Picks, their Instagram Story/Reel, and their X post count toward the four daily slots. A result needs its separate verified-result approval. The six education X/Story pairs in the production queue were already approved; do not queue copies.

## Caption edit path (local implementation, release pending)

The new `/edit-calendar-caption post_id:<cal-id> x_text:<replacement> reviewed:true` command is for Kobe or the KBH owner. It reads the current queued caption and asks the publisher to replace it with an optimistic compare-and-swap. The publisher accepts only posts with both X and Instagram states `approved`, no published IDs, and more than ten minutes before the slot. It rejects a stale read, a started X publish, an Instagram container, a held or published post, missing direct Discord link, or copy over 280 characters. The publisher rereads X copy after claiming the row, so an edit racing dispatch cannot publish stale text. The command is an explicit reviewer approval of the replacement text. It does not change the Pacific slot, ID, artwork, Instagram Story pixels, result approvals, or already published media. Native X scheduled posts are outside this publisher and must be edited in X's Scheduled UI. **This code is tested locally but not deployed or registered as a live slash command yet.**

## Prepared for private approval

The bot presents each of these exact captions and original 1080 × 1920 JPEGs in the existing private pick-approval channel. Only Kobe or the KBH owner can approve or reject. Approval queues an X post and an Instagram Story at the same Pacific slot; check each receipt independently with `/calendar-status`. The printed Discord URL in a Story image is not a tappable Instagram link sticker.

| Slot | Draft | Asset | Evidence |
| --- | --- | --- | --- |
| Tue Nov 10, 3:00 PM | Research checklist | `drafts/calendar/editorial-assets/research-checklist.jpg` | General process; NBA official injury reporting is available. No actual pick or status is claimed. |
| Wed Nov 11, 6:00 PM | Standard VIP offer | `drafts/calendar/editorial-assets/vip-standard-offer.jpg` | Live `/terms`: two-day standard monthly trial, then $32.99/month until canceled, payment method required, cancel before trial end to avoid charge. Recheck before approval. |
| Fri Nov 13, 3:00 PM | Weekend research preview | `drafts/calendar/editorial-assets/weekend-vip-prep.jpg` | General process; no unapproved slate or private play is revealed. |

The exact X captions and source links are in `drafts/calendar/editorial-drafts.json`. Every caption sends people to the direct free Discord invite. The private approval cards use the existing calendar publisher, so the current Free Pick publisher stays unchanged.

## Manual poll for Tuesday

`drafts/calendar/editorial-assets/bos-phi-poll.jpg` is a **static background only** for Tue Nov 10, 9:00 AM. The NBA schedule lists Boston at Philadelphia at 8:00 PM ET, which is 5:00 PM Pacific. Recheck the schedule before posting. In the Instagram app, add a real poll sticker with `Celtics` and `76ers`, and add/test the Discord link sticker if available. The text caption and source URL are in `editorial-drafts.json`. A static image without a poll sticker is not a native poll. It is not in the automatic queue.

On Nov 9, the owner requested the poll be scheduled. X's native composer disabled scheduling once poll options were added, so a one-time Codex heartbeat (`kbh-celtics-76ers-poll-at-9-am-pacific`) was created for Tue Nov 10 at 9:00 AM Pacific / 10:00 AM Arizona. It will verify the matchup/account/duplicates and attempt one native **X** poll, reporting the live URL only after publication. This is an execution task, not a scheduled X post or proof of publication. The Instagram poll remains a manual sticker action.

## Member reviews scheduled on X

The owner confirmed on Nov 9 that the member-review posts may be used. Two screenshots without earnings claims or full names were selected from Kobe's supplied originals, uploaded without edits, and scheduled on the signed-in `@kobesbettinghub` account. X's Scheduled list showed both entries. Their text links directly to the free Discord. These are X-only entries; no Instagram Story receipt exists for either. Matching 1080 × 1920 JPEG Story layouts, unchanged original PNGs, exact captions and app instructions are in `/Users/z/Downloads/KBH-member-reviews-Nov-2026/README.md`. The matching `bos-phi-poll-story.jpg` is there too. The artwork prints the Discord URL but cannot make it tappable; the native Instagram link sticker must be added and tested in the app. On Nov 9, the in-app browser showed login pages for both Instagram and Meta Business Suite, so no native sticker or Story schedule could be verified there. Do not use the existing X+IG calendar approval button for either review, because their X posts are already scheduled and that queue would duplicate them.

| Pacific slot | Original screenshot | X schedule receipt |
| --- | --- | --- |
| Tue Nov 10, 7:00 PM | `IMG_4793.png` (Donny/Jaywayyv on Kobe's work and writeups) | X UI showed Tue Nov 10, 8:00 PM Mountain Standard Time |
| Thu Nov 12, 7:30 PM | `IMG_4792.png` (vegas on Kobe's community support) | X UI showed Thu Nov 12, 8:30 PM Mountain Standard Time |

Review these against the four daily slots before adding anything else. Do not schedule screenshots with dollar-profit claims, a full name, a historical slip presented as current, or the `DEMO` image without resolving those specific issues.

## Still dependent on evidence or approval

- The next approved Free Pick follows the existing canonical Discord, X, Story, Reel, and email workflow. Check receipts; do not force a pick into a clock slot.
- Two newly graded Free Pick results reached private approval cards on Nov 9: `20261109-181-X` (card `1569557750831128647`) and `20261109-037-X` (card `1569568187391934618`). Both Render receipts said `AWAITING_APPROVAL`. Kobe or the owner must inspect each exact wager/final and approve or reject separately. Then verify each X reply under its original post and its Instagram Story receipt. The end-to-end path is not yet proven.
- Twenty original member screenshots were supplied. The owner confirmed review-post use on Nov 9; two low-risk originals are scheduled on X as above. The remaining screenshots still need individual context checks. Avoid large unsubstantiated earnings claims and private names.
- Arbitrage slots require a current verified opportunity close to posting time. Do not reuse yesterday's price or expose VIP legs.
- The live Render background worker was available at the Nov 10 05:21 UTC check. Its Nov 9 22:44 UTC startup receipt reported a scan of 106 events, one opportunity, private approval channel `1552534762021978202`, and VIP destination `1552408437999009983`. Later startup receipts at 03:33–04:48 UTC said `OUTSIDE_WINDOW`; the historical opportunity is not a current teaser. The scanner already runs every six minutes during its configured window and rechecks odds on approval. No public arbitrage teaser is queued.
- An exclusive-wins channel and private recap review cards exist. A Kobe approval-to-destination delivery receipt has not yet been observed. A full recap with pending results must wait for official grading.
- Render had several 512 MiB OOM failures earlier on Nov 9. Later repeated shutdown messages mostly coincide with successful deployments; the latest observed OOM was at 22:37 UTC. Check current service stability before treating the recurrence as fixed.
- Instagram Graph Stories still have no verified tappable Discord sticker. A person can add and tap-test it in the Instagram app.
- Kobe's Nov 9 email supplies video examples as Google Drive links, not attached MP4 bytes. The local `Kobe pick style.MP4` is a 14-second 1206 × 2622 HEVC/AAC reference. The current `bot/lib/free-pick-reel.js` outputs a six-second 540 × 960 fade reel. The live Instagram example and supplied Drive videos have not been visually compared to that output, so an exact style match is unverified. Keep the current approved Free Pick publisher working while that comparison is completed.

## Minimal app checklist

1. Tue Nov 10 at 9:00 AM Pacific: on the official KBH Instagram account, upload `bos-phi-poll-story.jpg`, add native Celtics/76ers poll and Discord link stickers, and test the link. The separate X poll task reports its own URL or blocker.
2. Tue Nov 10 at 7:00 PM and Thu Nov 12 at 7:30 PM Pacific: upload the two matching Story JPEGs from `/Users/z/Downloads/KBH-member-reviews-Nov-2026/` and add/test the Discord link sticker. The X counterparts are already scheduled; do not press the paired X+IG approval button.
3. Review each exact Free Pick result approval card. Its X reply and Instagram result Story remain held until the owner or Kobe approves. Check the two platform receipts separately afterward.
