# Membership test-clock audit — 2026-09-13

Status: staging retention renewal and terminal cancellation sequence passed. Per-customer repeat-offer behavior still requires an authenticated Customer Portal acceptance test.

Scope: isolated Stripe test mode, Supabase staging project ctqmksvfqrysomvckqrm, Discord staging guild 1548568770123927562, and the staging Checkout Worker. Production, live Stripe data, real customers, real money, public Discord/X, and email were not changed.

## Verified evidence

| Control | Evidence | Result |
|---|---|---|
| Original terminal cancellation | Subscription sub_1UF8Y4E6p9BmPii37J9VhpeS; event evt_1UFAQCE6p9BmPii3yw1gVYX1 | Supabase canceled; webhook PROCESSED/ROLE_REMOVED; Discord role DELETE HTTP 204 |
| Fresh simulation | Test clock clock_1UFAPBE6p9BmPii34X93rbeb; customer cus_VFfml7z9hBMSMK; subscription sub_1UFATvE6p9BmPii3SBESa2O0 | Stripe test subscription active through 2026-10-13T10:12:53Z |
| Fresh entitlement grant | Event evt_1UFATxE6p9BmPii35o31amyx | Webhook PROCESSED/ROLE_GRANTED; Discord role PUT HTTP 204 |
| Dedicated test identity | Discord user 832944927884312606 | Reassigned only after terminal cancellation; STAGING_TEST_IDENTITY_REASSIGNED audit row written |
| Entitlement schema | Migration 009_membership_entitlement_blocks | Applied successfully in staging |
| Billing exception code | Commit e31e234966aae3b721bc75dc0c2853632a9d7110; Checkout Worker 531ee711-60a1-4429-9147-6595ed13eb5a | Health HTTP 200; six expected encrypted secret names preserved; cron and payouts disabled |
| Stripe destination | we_1UF61QE6p9BmPii30UGuNEMO | Eight selected events, including invoice.payment_failed |
| Retention offer | Coupon VJxmdXFz; portal config bpc_1UF9gPE6p9BmPii3pI6NPPAn | 75% off once; visible in the test Customer Portal configuration |
| Discounted renewal | Invoice in_1UFFj1E6p9BmPii37FBFrhWg | Paid $8.25 in test mode; discount then disappeared and the following invoice preview returned to $32.99 |
| Fresh terminal cancellation | Subscription sub_1UFATvE6p9BmPii3SBESa2O0; event evt_1UFFqTE6p9BmPii3UWYNvLwv | Stripe and Supabase canceled; webhook PROCESSED/ROLE_REMOVED; Discord role DELETE HTTP 204 / SUCCEEDED |
| Automated regression | Full repository suite | 162 passed, 0 failed; diff check passed |
| Non-public pick path | Controlled fixture | Luna-shaped extraction, ESPN validation, approval/public copy equality, canonical log, grade, recap, X copy, and Trends passed without public posting |

## Billing-exception behavior verified in staging

- Refund and dispute-created events resolve the invoice/subscription, persist an entitlement block, remove the staging Discord role, and write membership plus API-call audit rows.
- Later subscription updates and scheduled reconciliation preserve the block and cannot silently re-grant access.
- A failed invoice on an active subscription retains access; a past-due subscription loses access. Automated recovery coverage verifies that a later eligible active update restores the role.
- Reconciliation counts every ROLE_REMOVED outcome as a role removal rather than a missing-link result.

## Retention result and remaining caveat

The upcoming invoice changed from $32.99 to $8.25. Advancing the test clock created and paid that $8.25 invoice. Stripe then showed no coupon and previewed the next renewal at $32.99, proving that one application affects one invoice. Period-end cancellation was then advanced through its terminal event, and Supabase plus Discord recorded the expected cancellation and role removal.

This proves the discount amount, one-invoice duration, return to full price, no-refund period-end cancellation, terminal persistence, and entitlement removal. It does not by itself prove that the same member cannot accept a new portal retention offer in a later cancellation session. That remaining control requires an authenticated Customer Portal repeat-acceptance test or the independently persisted per-member redemption guard already promoted with the production Worker.

The isolated fixtures remain canceled so the evidence stays inspectable. Audit rows must be preserved; fixture deletion is optional cleanup and requires separate approval.

## Remaining production acceptance

1. Kobe completes the intended live Customer Portal cancellation.
2. Reconcile Stripe, Supabase, and Discord and verify paid-through access.
3. Monitor the later terminal event and expected role removal.
4. Do not change the other live subscription until the duplicate memberships are identified.
