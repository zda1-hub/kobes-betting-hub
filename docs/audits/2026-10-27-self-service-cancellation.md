# Self-service membership cancellation — October 27, 2026

Request: members must be able to cancel renewal without deleting payment methods.

Status before release: local tests passed; not yet deployed.

Evidence: live checkout version 8f6bfd4a-eec0-4cf2-8009-be3ff16ab955 has no STRIPE_PORTAL_CONFIGURATION_ID binding. Existing callback consequently used Stripe default configuration without validating subscription_cancel. It also allowed optional retention coupon provisioning failures to prevent the portal opening. Code returned a generic portal when the stored subscription pointer was absent/already canceling/inactive. These are confirmed code/configuration gaps; the affected customer's Stripe session and default portal settings have not been inspected, so the exact customer-specific cause remains unconfirmed. Available browser Stripe account is unrelated Relay Lead Desk and was not changed.

Affected files: cloudflare/kobes-checkout-worker.js and its test suite. No visual/public assets, pricing, authentication, customer cards, subscriptions, billing dates or role policies changed. Based on latest origin/main 521f5ef in isolated codex/self-service-cancellation.

After: callback explicitly selects a configuration verified active with subscription cancellation enabled at_period_end. Reuses suitable explicit/default configuration. Otherwise reuses a KBH-tagged cancellation configuration or creates a dedicated one with invoice history, payment updates, customer email/name updates and end-of-period cancellation, no proration or plan switching. Account default is not modified. Creation is idempotent, configuration reused across requests; actual customer cancellation still requires the customer's confirmation in Stripe. Failures cannot silently downgrade to payment-only configuration. Optional retention failure logs a generic operational warning and continues to cancellation without an offer.

Verification: 138 tests passed across checkout Worker, monthly trial, member welcome, referral payout safety and trial reporting. New cases cover disabled/immediate/inactive configuration rejection, explicit configuration reuse, dedicated configuration creation, query filtering and owned configuration reuse, provider failure, linked authenticated portal callback with absent subscription pointer, and optional coupon failure with direct cancellation flow preserved. Tests assert only portal configuration/session writes, never card deletion or subscription cancellation. Wrangler dry-run passed. Production plaintext vars were compared with release config: zero differences. No key values exposed.

Limitations: no real subscription canceled, trial started, card removed or charge created. Live authenticated end-to-end Stripe cancellation not verified. Dedicated configuration is selected/provisioned on the next authenticated management visit; deployment health alone does not prove portal creation or customer cancellation. Owner login requested for independent KBH Stripe settings verification.

Rollback: redeploy previous checkout version. Dedicated portal configuration, if provisioned, does not change default or current subscriptions; do not delete while sessions may use it.
