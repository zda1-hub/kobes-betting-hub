# Kobe's Betting Hub — Launch Today

Use this page as the live checklist. Do every unchecked item in order. Do not post the comeback campaign until the payment and access tests pass.

## Already completed

- [x] Kobe Bot is deployed on Render and running continuously.
- [x] Discord slash commands are registered.
- [x] `/post-welcome-invite` posts to the configured welcome channel and pings the configured VIP role.
- [x] The public post is the full “I'M BACK 🔥” comeback campaign from Kobe's approved email.
- [x] The post has one `Join / rejoin VIP` button that opens `https://kobesbettinghub.com/join`.
- [x] The bot now acknowledges the command before posting, so the prior “application did not respond” warning is fixed.
- [x] The announcement is public in the server; the bot does not mass-DM members.

## 1. Verify the join page — 10 minutes

1. On a phone, open a private/incognito browser tab.
2. Go to `https://kobesbettinghub.com/join`.
3. Confirm the page loads on cellular data and Wi-Fi.
4. Confirm every offer, price, trial length, renewal price, and cancellation language matches the intended offer.
5. Tap each join option until the Stripe checkout page opens. Do **not** enter payment details yet.
6. Confirm the Stripe amount and recurring terms exactly match the join page.
7. Check that browser Back or the Stripe cancel control returns to the join page without an error.

Mark complete only after all seven checks pass.

- [ ] Join page and both checkout paths verified.

## 2. Verify paid-member access — 15 minutes

Use a trusted tester or a second Discord account. Only complete a real purchase if you are comfortable with the charge/trial; never use a member's account for testing.

1. Start one checkout from `https://kobesbettinghub.com/join`.
2. Complete the checkout and any Discord connection step.
3. In Discord, check that the test account receives the `VIP Member` role.
4. Confirm it can see the intended paid channels, including `#latest-release` and `#daily-recap`.
5. Confirm it cannot see staff-only channels.
6. Cancel the test membership/refund it if that was the plan.
7. Confirm a canceled/inactive account loses VIP access on the expected schedule.

- [ ] Payment successfully gives the right Discord access.
- [ ] Cancellation/access-removal behavior checked.

## 3. Make support ready — 5 minutes

1. Confirm `#support` exists and is visible to members.
2. Give the support owner permission to read and reply there.
3. Pin this message:

   `For payment or access help, open a message here. Never send card details, passwords, login codes, or crypto information.`

4. Send a test message from a non-staff account and confirm staff can see it.

- [ ] Support channel and owner confirmed.

## 4. Verify campaign claims — 10 minutes

Before publishing, Kobe must confirm the campaign is current and can be supported:

1. `77% ALL-TIME FOOTBALL WIN RATE` is backed by records.
2. `40% OFF YOUR FIRST MONTH — ONLY $19` matches the live checkout price.
3. `FOOTBALL STARTS NEXT WEEK` is still true on post day; update it if not.
4. `$5,000+ worth of value` is an approved claim.

If any item is not true, stop and revise the post before launching it.

- [ ] Kobe approved all campaign claims for today's date.

## 5. Publish the campaign — 3 minutes

1. In Discord, open `#welcome`.
2. Delete the old short welcome post so people do not see two different campaigns.
3. Run `/post-welcome-invite`.
4. Confirm the post contains the full “I'M BACK 🔥” message.
5. Confirm it pings `@VIP Member`.
6. Click `Join / rejoin VIP` once and confirm it opens `https://kobesbettinghub.com/join`.
7. Confirm the bot replies privately that the announcement was posted.

- [ ] Public comeback campaign posted and link tested.

## 6. Immediate launch follow-up — today

1. Watch `#support` for access or payment issues for the first hour.
2. Check Stripe for completed checkouts and failed payments.
3. Confirm new paid members have the VIP role and correct channel access.
4. Record questions or failures in this file under `Launch notes`.

- [ ] First-hour launch check completed.

## Launch notes

Add date, time, issue, and resolution here. Never paste tokens, passwords, card details, or private member information.

- [ ] No launch notes yet.
