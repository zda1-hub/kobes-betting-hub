# Payment recovery reminders — October 4, 2026

## Request
Remind members with recent failed payments and automatically remind future members with failed payments from support@kobesbettinghub.com.

## Affected files
- `cloudflare/kobes-checkout-worker.js`
- `cloudflare/kobes-checkout-worker.test.mjs`
- `pipeline/migrations/017_payment_recovery_reminders.sql`
- `pipeline/migrate-production.js`

## Before and after
Before: the domain email outbox supported onboarding and introductory-period messages, but Stripe payment failures did not enqueue customer reminders.

After: a live failed-payment webhook enqueues one reminder per unpaid invoice, and a daily scan covers open invoices from the past 30 days. The message includes only Stripe's hosted invoice link, asks the member to use a different method or contact their bank, and offers support. Delivery waits at least one hour and checks the invoice again; paid invoices are cancelled. The existing sender uses support@kobesbettinghub.com. Test customers and test-mode invoices are excluded. A unique invoice key prevents duplicate reminders.

## Verification
The checkout worker test suite passes, including new eligibility cases for paid/test invoices, excluded customers, and invalid payment links. JavaScript syntax check passes. Production migration and delivery still require release verification.

## Status and limitations
Local only until the migration and Worker are published. Only open, automatic-collection subscription invoices from the past 30 days are backfilled. Stripe must provide a hosted invoice URL and customer email. An unknown email delivery outcome is held for manual review, as in the existing sender.

## Release follow-up — October 4, 7:05 PM MST
Merged as PR #140 at commit `4e931f5`. The production migration workflow succeeded and reported no pending migrations. The production checkout Worker was deployed as version `27a3332f-0919-4e85-aad1-af729e8b986d`; its live health endpoint returned that version. Cloudflare lists `RESEND_API_KEY` as a configured Worker secret. The 30-day failed-invoice scan runs with the next daily 9:15 AM MST trigger. Email delivery waits one hour after queueing and rechecks Stripe. No customer delivery is confirmed by this release check.

## Follow-up — earlier backfill
The user asked whether the previously seen customers had already been emailed. They had not: those failures predated deployment and the first scan was set for the next morning. Add a second scan at 7:15 PM MST (`15 2 * * *` UTC), while retaining the 9:15 AM MST scan. This affects the checkout Worker and `wrangler.jsonc`; it does not change pricing, access, or the email body. Verify the live deployment and review the email outbox after the trigger. Until then, no delivery is claimed.

Cloudflare rejected the extra cron trigger because the Workers Free account is at its five-trigger limit. The Worker code uploaded, but the trigger update failed. The fix reuses the existing five-minute cron: at 7:15 PM MST it runs the same scan, alongside the 9:15 AM MST scan. The original two triggers were restored and deployment of version `2b328375-c73c-482a-a02f-a172622a33f9` succeeded. Delivery still requires a one-hour queue delay and a live Stripe recheck.
