# Production membership candidate — 2026-09-13

**Base:** production `origin/main` at `0c35e46ae338b48638bbe21464d80c4dd76e02f0`  
**Branch:** `codex/membership-production-candidate`  
**Status:** frozen for review; not deployed and no production database or billing state changed.

## Included scope

- Discord-authenticated Stripe Customer Portal access.
- Checkout request idempotency and first-claim identity protection.
- Current Stripe subscription period/cancellation persistence.
- Daily Stripe → Supabase → Discord reconciliation already represented in the Worker source.
- Failed-payment event handling and durable refund/dispute entitlement blocks.
- Customer-specific, single-redemption retention coupon provisioning and redemption audit.
- Additive production migrations `007_service_role_rest_access`, `008_subscription_cancellation_fields`, and `009_membership_entitlement_blocks`.
- Production-locked migration runner with exact project, migration hash, encrypted transport, transaction, advisory lock, and post-apply verification guards.
- Consistent recurring-price, cancellation, refund-exception, and support disclosures on membership pages.
- Credential-free scheduled production health workflow.

## Verification

- Focused exact-main candidate suite: 154/154 passing.
- Production public smoke: 5/5 passing.
- `git diff --check`: passing.
- Existing production code and data were not mutated during candidate assembly.

## Production prerequisites

1. Record an encrypted logical backup or verified recovery checkpoint for Supabase project `mpajyubbnnsdpgdizvht`.
2. Run the migration tool in plan mode and review current ledger state, hashes, grants, RLS, and affected row counts.
3. Verify current Checkout Worker version and rollback version.
4. Verify production Discord application, guild, paid role, and role hierarchy by identifier only.
5. Verify the live Stripe account, monthly/starter price IDs, Customer Portal configuration, retention template coupon, and destination event set by identifier only.
6. Add production `STRIPE_PORTAL_CONFIGURATION_ID` and `STRIPE_RETENTION_COUPON_ID` only after the live-mode objects are approved and created.
7. Confirm the existing seven production Stripe events and deliberately add `invoice.payment_failed` if it is included in the approved release.
8. Obtain Zakai Martin's action-time approval naming the candidate commit, migrations `007`–`009`, Checkout Worker, Stripe configuration changes, and acceptance scope.

## Deployment order after approval

1. Apply only migrations `007`–`009`; verify before commit.
2. Deploy only the Checkout Worker candidate and verify `/health` plus its version ID.
3. Send a Stripe provider test webhook, then a duplicate delivery; verify one durable Supabase outcome and harmless idempotency.
4. Run a no-op/single-member reconciliation check; verify Discord and Supabase audit rows.
5. Deploy the matching public membership pages only after Worker acceptance.
6. Run the five production smoke checks.
7. With separate real-transaction approval, run one trusted non-owner acceptance membership through checkout, Discord link/role, paid-channel access, portal, and cancellation scheduling.

## Rollback

- Stop new invitations; do not delete customers, subscriptions, or audit rows.
- Roll the Checkout Worker back to the recorded prior version.
- Restore the prior public-site Worker version if the membership-page release is implicated.
- Do not reverse additive database migrations automatically; old code must remain compatible with the added grants/columns.
- Reconcile every event received during the incident window before reopening enrollment.
