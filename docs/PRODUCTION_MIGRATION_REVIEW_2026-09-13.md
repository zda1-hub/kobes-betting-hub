# Production membership migration review — 2026-09-13

Status: source and safety review complete; live read-only plan and production apply remain separate steps. No migration has been applied by this review.

Target: Supabase production project `mpajyubbnnsdpgdizvht` only.

## Approved sequence and immutable hashes

| Order | Migration | SHA-256 | Effect |
|---:|---|---|---|
| 1 | `007_service_role_rest_access.sql` | `bd92491e1fc4f49bcbff64c424bb6bbc905e32c3056e168cd5e243a8a8d931c6` | Grants only `USAGE`, `SELECT`, `INSERT`, and `UPDATE` needed by the backend service role; revokes every listed table grant from `anon` and `authenticated`; records ledger version. |
| 2 | `008_subscription_cancellation_fields.sql` | `6f19392e805fc5ff004ab9308ef9f0cb863a86e9fae0aee5493865acf382f059` | Adds nullable `membership_subscriptions.cancel_at timestamptz`; records ledger version. |
| 3 | `009_membership_entitlement_blocks.sql` | `c011195cbbb91161f1ef6844ce041d724c8217995756980a2030968cd072a098` | Adds non-null `entitlement_blocked boolean default false` plus nullable reason and timestamp; records ledger version. |

## Safety findings

- All schema changes are additive and use `IF NOT EXISTS`.
- No table, column, audit row, membership row, index, function, policy, or customer data is dropped or rewritten.
- Migration `007` intentionally tightens browser-role access; it does not revoke backend service-role access.
- Existing application code remains compatible with the added nullable/defaulted fields.
- The production migrator refuses `DATABASE_URL`, accepts only `PRODUCTION_DATABASE_URL`, validates the exact project reference and encrypted transport, verifies every file hash, defaults to plan-only, and requires a project-bound confirmation phrase for apply.
- Apply uses one transaction and an advisory lock. Any SQL or post-apply verification failure rolls the entire transaction back.
- Post-apply verification requires all three ledger versions, exact membership column shapes, RLS on protected tables, no `anon`/`authenticated` grants, and required service-role grants.

## Rollback position

If the application deployment fails, roll back the Worker/application version first and preserve these additive columns, grants, and audit data. Do not attempt a destructive down-migration during the launch window. Use the encrypted backup only for demonstrated corruption and only with a separate recovery decision.

## Remaining gates before apply

1. Run the production migrator in live plan-only mode and retain its sanitized pending/skipped output.
2. Complete the isolated failed-payment/refund/dispute evidence.
3. Complete the real pick-day acceptance trail.
4. Confirm seller/support identity, public policy status, backup operator, and controlled launch roster.
5. Review production Stripe event configuration, Discord role hierarchy, Worker bindings/secret names, and prior rollback version.
6. Obtain Zakai's action-time final approval for the exact apply and deployment sequence.
