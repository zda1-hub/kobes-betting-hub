# Membership test-clock audit — 2026-09-13

Status: staging controls deployed; terminal role removal and fresh role grant verified; retention invoice sequence prepared and awaiting action-time financial confirmation.

Scope: isolated Stripe test mode, Supabase staging `ctqmksvfqrysomvckqrm`, Discord staging guild `1548568770123927562`, and Checkout Worker staging. Production project `mpajyubbnnsdpgdizvht`, live Stripe data, real customers, real money, public Discord/X, and email were not changed.

## Verified evidence

| Control | Evidence | Result |
|---|---|---|
| Original terminal cancellation | Subscription `sub_1UF8Y4E6p9BmPii37J9VhpeS`; event `evt_1UFAQCE6p9BmPii3yw1gVYX1` | Supabase `canceled`; webhook `PROCESSED/ROLE_REMOVED`; Discord role DELETE HTTP `204` |
| Fresh simulation | Test clock `clock_1UFAPBE6p9BmPii34X93rbeb`; customer `cus_VFfml7z9hBMSMK`; subscription `sub_1UFATvE6p9BmPii3SBESa2O0` | Stripe test subscription active through `2026-10-13T10:12:53Z` |
| Fresh entitlement grant | Event `evt_1UFATxE6p9BmPii35o31amyx` | Webhook `PROCESSED/ROLE_GRANTED`; Discord role PUT HTTP `204` |
| Dedicated test identity | Discord user `832944927884312606` | Reassigned from the terminal customer to the fresh simulated customer only after terminal cancellation; `STAGING_TEST_IDENTITY_REASSIGNED` audit row written |
| Entitlement schema | Migration `009_membership_entitlement_blocks` | Applied successfully in staging; adds `entitlement_blocked`, reason, and timestamp fields without destructive changes |
| Billing exception code | Source commit `e31e234966aae3b721bc75dc0c2853632a9d7110`; Checkout Worker `531ee711-60a1-4429-9147-6595ed13eb5a` | Health HTTP `200`; six expected encrypted secret names preserved; cron and payouts remain disabled |
| Stripe destination | `we_1UF61QE6p9BmPii30UGuNEMO` | Eight selected events, adding `invoice.payment_failed` to checkout/subscription/invoice/refund/dispute coverage |
| Retention offer | Coupon `VJxmdXFz`; portal config `bpc_1UF9gPE6p9BmPii3pI6NPPAn` | `KBH 75% Retention — One Invoice`, 75% off once; visible in the test Customer Portal cancellation configuration |
| Automated regression | Full repository suite | 162 passed, 0 failed; `git diff --check` passed |
| Non-public pick path | Controlled end-to-end test fixture | Luna-shaped extraction, ESPN validation, approval/public copy equality, canonical log, grade, recap, X copy, and Trends all passed without sending a public post |

## Billing-exception behavior now staged

- `charge.refunded` and `charge.dispute.created` resolve the invoice and subscription, persist a durable entitlement block, remove the staging Discord role, and write membership plus API-call audit rows.
- Later `customer.subscription.updated` events and scheduled reconciliation preserve the block and cannot silently re-grant access. Persistence uses insert-if-absent plus a Stripe-fields-only patch so a concurrently written block cannot be cleared.
- `invoice.payment_failed` persists the current Stripe subscription and audits the event. An `active` subscription retains access; a `past_due` subscription loses access. The business grace-period policy is still an owner/legal decision before production.
- Reconciliation counts every `ROLE_REMOVED*` outcome as a role removal rather than a missing-link result.

## Prepared retention test

The exact one-time coupon is selected in the update form for `sub_1UFATvE6p9BmPii3SBESa2O0`, but the final **Update subscription** control has not been submitted. Stripe test-clock advancement is also unexecuted. Those UI actions can create simulated invoices and therefore require a fresh action-time financial confirmation even though no real money can move.

After confirmation, execute and retain this sequence:

1. Submit the staged coupon update and verify the upcoming invoice is approximately `$8.25`.
2. Advance the test clock past the first renewal; retain the paid discounted invoice and `invoice.paid` webhook evidence.
3. Verify the following upcoming invoice is back to `$32.99`, proving `duration=once`.
4. Attempt a second cancellation offer. If Stripe allows the same customer to redeem it again, mark the retention control failed and do not promote it; coupon duration alone is not a per-customer redemption lock.
5. Decline the offer, schedule cancellation, and advance past the terminal period end.
6. Verify `customer.subscription.deleted`, Supabase `canceled`, webhook `PROCESSED/ROLE_REMOVED`, Discord DELETE HTTP `204`, and absence of the staging member role.
7. Remove or unlink only fixtures created for this clock after the evidence is recorded. Preserve audit rows and identifiers.

The Customer Portal route itself could not be reopened unattended because the browser's Discord session requested a fresh login. That does not invalidate the previously verified OAuth/portal path; it means the prepared clock test should use the already-authenticated browser session or the Stripe test Dashboard while preserving the same customer/subscription evidence.

## Production promotion gate

Promotion of these staged billing controls and any beta expansion remain blocked until Zakai gives final action-time approval; the existing production checkout itself is already live. The complete promotion order is maintained in `docs/BETA_LAUNCH_CHECKLIST.md`; the minimum database/Worker subset is:

1. Review and back up production Supabase `mpajyubbnnsdpgdizvht`.
2. Apply additive migrations `007_service_role_rest_access`, `008_subscription_cancellation_fields`, and `009_membership_entitlement_blocks` in order; verify the migration ledger and grants.
3. Confirm production secret **names** and non-secret bindings without displaying values.
4. Add `invoice.payment_failed` to the live Stripe destination only during the approved change window.
5. Deploy the reviewed Checkout Worker source; record prior and new version IDs.
6. Run health, signature, duplicate-event, checkout idempotency, portal, and reconciliation checks.
7. With separate real-transaction approval, run one production acceptance member through purchase, Discord link/grant, portal cancellation, Supabase/webhook audit, and expected terminal removal.
8. Reconcile Stripe ↔ Supabase ↔ Discord and either record acceptance or roll back the Worker while retaining additive schema and audit rows.
