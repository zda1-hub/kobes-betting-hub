# Free-member referral pilot — October 24, 2026

## Decision and purpose

Current referrals are limited to Discord accounts with VIP access. That leaves the free Discord community unable to share a tracked, reward-eligible link. The proposed pilot lets an eligible free server member get a unique link without buying VIP. The referred friend's first completed $32.99 monthly payment after the two-day trial remains the qualifying event. A trial start alone never earns $20.

This is the implementation contract. Code is prepared behind the default-off `FREE_MEMBER_REFERRALS_ENABLED` switch. A code build or database migration alone does not open the program; record a separate live verification before announcing it.

## Member flow

1. From `/refer`, connect a Discord account with a verified email. The server verifies that the account belongs to the KBH Discord guild and is not blocked for an entitlement or fraud issue. A nonmember cannot create a link. No VIP purchase is required.
2. Issue one stable personal link for that Discord identity. Show it with a copy action and the exact qualification rule. Keep Discord membership and VIP access separate: receiving a link never grants VIP channels.
3. A new friend visits through that link, verifies their own Discord identity, and starts the existing two-day trial. Record link visit, checkout start, trial, first paid invoice and VIP activation as separate stages. Do not call a trial a paid referral.
4. After Stripe confirms the first $32.99 monthly charge, hold the $20 reward for seven days. Refunds, disputes, duplicate customers, shared payment credentials and matching Discord identities block or flag the reward.
5. The free referrer completes Stripe payout onboarding. Stripe holds the recipient details; KBH stores only the Stripe recipient ID and review status. No payout occurs just because a link exists, a trial starts, or a card is placed on file.
6. **Pilot control:** every free-member reward requires an explicit operator approval after the hold, charge recheck, Stripe recipient readiness and identity review. The automation must never send a free-member payout merely because a timer expired. VIP referral payouts retain their existing path.

## Review checklist before any free-member cash leaves

- Referred customer is new; checkout used the original referral code and a verified, different Discord account.
- Stripe shows the first monthly invoice actually paid for at least $32.99, with a captured successful charge, no refund, dispute, pending refund or elevated fraud status. Recheck immediately before sending.
- Seven full days have elapsed since that payment; reward has not been paid or claimed before. Use a durable idempotency key and keep an unknown provider result in a nonretryable reconciliation state.
- Referrer is the original, still-eligible Discord account, with verified email, current guild membership, and a Stripe recipient whose payout method and required verification are complete.
- Compare the referrer's verified email and any prior Stripe customer payment history with the buyer's email and card fingerprint. Matching or incomplete identity evidence means **manual investigation, not automatic approval**. Check shared device/network signals only as review flags because households can share them legitimately.
- Show the operator both the reward ID and the exact reasons for approval or hold. Record reviewer ID, time, decision and reason. A review action cannot skip the charge and payout rechecks.

## Financial and distribution limits

- $20 is about 61% of the first $32.99 payment; only $12.99 remains before payment processing, support and other costs. This pilot should be judged by retained paid members and reward cost, not link claims or trials alone.
- Start with the existing 21+ US eligibility language. Stripe payout onboarding and a clear eligibility attestation should gate cash eligibility; do not assume Discord itself verifies age or residence.
- A free referrer's public X endorsement with an incentivized link needs a clear compensation disclosure under X's paid-partnership rules. Do not ask members to spam identical replies, promise winnings or hide the payment condition.
- The owner may pause issuance of new free-member links if fraud or economics fail; already earned eligible rewards still require review and fulfillment under the published terms.

## Implementation contract

- Keep the existing VIP member referral flow and approved `/refer` visual design intact. Add a separate, feature-flagged free-member path; default off until verified.
- Reuse Discord OAuth and Stripe payout onboarding. Add a referral-only profile state that **never grants or removes a VIP role**. The checkout and reward record must retain the original referrer identity and code. Do not reuse a creator VIP trial as a free-referrer shortcut.
- Add a nonretryable `REVIEW_REQUIRED` state for all free-member rewards and an authenticated, audited operator review action. No direct transition from a free-member hold to Stripe outbound payment without that action.
- Add migration and tests for guild eligibility, denied/blocked accounts, one-code-per-identity, new-customer qualification, duplicate/self-referrals, first paid invoice versus $0 trial, refunds/disputes, recipient readiness, race conditions and no-VIP-role side effects.
- Verify logged-out, free-member, VIP, blocked, Stripe-pending and link-ready browser states at 320px, 390px and desktop widths. Preserve header, orange member card, referral bill, CTA fit and existing membership checkout behavior. Record audit evidence.
- Deploy database migration before worker/site changes; verify on production with an internal test account and no real purchase or payout. Only then enable free link issuance and make one Kobe Bot announcement. Monitor link claims, referred visits, checkout starts, trial starts, paid first months, rewards held, rewards approved and cash paid separately.

## Go/no-go

Do not enable this pilot unless the operator review action and no-auto-payout guard have passed tests and live read-only verification. Do not describe fraud prevention as absolute. A verified payment can still be disputed later, so hold and review lower risk rather than eliminate it.
