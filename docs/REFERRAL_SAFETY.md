# Referral payout safety

The reward remains $10 for an eligible new US member (21+), after their first
successful $32.99 monthly referral payment and the existing seven-day hold.
Starter payments, free invoices, and long-term plans are not qualifying events.
No program can guarantee prevention of every coordinated fraud attempt.

## Automated protections

- Attribution is unique per Stripe customer, subscription, and first paid invoice.
- Migration 010 adds uniqueness per referred Discord identity, qualifying charge,
  and hashed Stripe card fingerprint. Voided claims retain their identities.
- Customer/subscription/currency, captured payment, card identity, refunds,
  disputes, risk signals, and referrer payment history are verified before claim.
- Shared cards, incomplete evidence, elevated risk, and duplicate identities are
  held for review. A hold is not a finding of fraud (families can share cards).
- A conditional database update claims one reward for exactly one processor.
- Payment status is checked again after the claim, immediately before transfer.
- Unknown provider outcomes and interrupted claims are never automatically retried.
- Refund events cannot reset an in-flight/sent payout into a retryable status.
- Provider receipts are retained even when a concurrent refund flags review.
- Requests have 15-second deadlines. Only fingerprint hashes, not card details,
  are stored with referral rewards. Existing server-only RLS/grants remain in force.

## Manual review / reconciliation

Review `REVIEW_REQUIRED`, `PAYOUT_UNCERTAIN`, and legacy `PAYOUT_FAILED` rewards
in the restricted operations database. Do not broadly reset them to HOLDING,
clear payout timestamps, or execute this processor to test a real cash payment.

For an unknown attempt, check Stripe Global Payouts using the reward ID in
metadata and the idempotency key `kbh-referral-<reward UUID>`. If a transfer exists,
record its exact receipt and retain any refund/dispute review flag. Stripe's
idempotency retention is not an indefinite duplicate-payment guarantee.
If the provider result cannot be established, leave the reward held.

False-positive identity/card holds need an evidence-based owner decision; there is
no public endpoint that clears holds. A refund after a completed transfer can
still cause loss and requires manual recovery/review. Different real identities,
different cards, wallet fingerprint variation, and collusion remain residual risks.
Review the first rewards and provider balance before promoting referrals broadly.

## Verification

The isolated safety suite covers concurrent processing, repeat payouts, $10/zero
invoices, currency/customer/subscription mismatch, card reuse, refunds before and
after claim, disputes, missing identity, provider permission errors, incomplete
history, unknown payout responses, audit failure, and refund/provider races.
All fake transactions use `.invalid` database addresses and dummy credentials.
Deployment verification must be read-only; no real referral transfer is needed.
