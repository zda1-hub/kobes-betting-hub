# Referral Sandbox Runbook

This environment exists to test the cash-referral lifecycle without touching live Stripe objects, live Supabase membership/referral rows, the production Cloudflare Workers, or production Discord roles.

## Isolation boundaries

- Stripe: dedicated `Kobe Referral Sandbox` (`acct_1UF5ApCiPGuWM4jq`), sandbox price `price_1UF5BDCiPGuWM4jqQXC6IAEr`, sandbox webhook `we_1UF5aHCiPGuWM4jqGRhkYOku`, and sandbox-only API keys.
- Cloudflare backend: `kobes-betting-hub-checkout-referral-sandbox`.
- Cloudflare site: `kobes-betting-hub-referral-sandbox` with a persistent purple sandbox banner and `noindex,nofollow`.
- Supabase: uniquely prefixed `referral_sandbox_*` tables inside the existing `Kobe Betting Hub Staging` project (`ctqmksvfqrysomvckqrm`). No existing staging or production table is read or written.
- Discord: dedicated application `Kobe Betting Hub Staging` (`1548556799513333770`) authorizes identity, but staging code never joins a guild or changes a role.
- Time: production is always seven days. Staging uses a 60-second hold and checks eligible rewards once per minute.

## Required staging secrets

Install these only on the Cloudflare `referral-sandbox` environment:

- `STRIPE_SECRET_KEY`: sandbox key for Checkout, subscriptions, invoices, and refunds.
- `STRIPE_WEBHOOK_SECRET`: signing secret for the sandbox event destination.
- `STRIPE_GLOBAL_PAYOUTS_KEY`: sandbox restricted key for recipient onboarding and outbound payments.
- `DISCORD_CLIENT_SECRET`: OAuth application secret.
- `DISCORD_OAUTH_STATE_SECRET`: a new staging-only random secret.
- `SUPABASE_SECRET_KEY`: server key for the existing staging project; table-prefix enforcement isolates all referral-sandbox data.

`DISCORD_BOT_TOKEN` is intentionally absent because this sandbox must not mutate Discord guild membership or roles.

## Acceptance sequence

1. Apply `sandbox/referral-sandbox-schema.sql` to the existing Supabase staging project. Every object in that file is prefixed `referral_sandbox_`.
2. Seed the referrer's Discord user ID as an active sandbox member using a clearly fake `cus_test_seed_*` customer and `sub_test_seed_*` subscription.
3. Sign into the sandbox referral page with that Discord account and complete Stripe sandbox recipient onboarding.
4. Open the generated link in a separate browser profile and use a second Discord account for the referred member.
5. Complete Checkout with Stripe's documented sandbox card values.
6. End the two-day sandbox trial using a Stripe Billing simulation/test clock or a controlled sandbox event fixture.
7. Verify `invoice.paid` records `HOLDING` and sets eligibility 60 seconds later.
8. Allow the sandbox cron to send one simulated `$10` outbound payment; reconcile the Stripe object with the Supabase reward and API/referral events.
9. Run a second sandbox case that refunds before payout and verify the reward becomes `VOID`.
10. Run a third case that simulates a dispute, and verify unpaid rewards are voided while an already-sent reward becomes `REVIEW_REQUIRED`.

Never enter a real card, bank account, or live API key in this environment. Never point its `SITE_ORIGIN`, Stripe price, or Supabase URL at production. Never remove the `SUPABASE_TABLE_PREFIX=referral_sandbox_` guard.

## Deployment audit — 2026-09-12

- [x] Created the isolated Stripe sandbox and copied only the `$32.99/month` product into it.
- [x] Enabled Global Payouts in the Stripe sandbox without adding real funds.
- [x] Created the seven-event sandbox webhook destination for the referral Worker.
- [x] Created a dedicated restricted Stripe key from the Payouts permission template.
- [x] Created and configured the dedicated Discord staging OAuth application and callback.
- [x] Applied `sandbox/referral-sandbox-schema.sql`; nine `referral_sandbox_*` tables now exist with RLS enabled.
- [x] Deployed the isolated Cloudflare site and backend Workers.
- [x] Installed and verified all six sandbox-only Worker secrets, including the restricted payouts key and Supabase server key.
- [x] Granted `service_role` access only to the nine `referral_sandbox_*` tables; `anon` and `authenticated` remain revoked.
- [x] Redeployed backend version `6a3307ad-f015-42ad-94fb-0d9fef0fbf65`; health, Discord redirect, database guard, unpaid Stripe Checkout creation, API audit persistence, and the one-minute cron all passed.
- [ ] Complete the two-person browser acceptance flow using two user-created Discord accounts, then execute the paid-invoice, payout, refund, and dispute cases above with Stripe sandbox data only.
