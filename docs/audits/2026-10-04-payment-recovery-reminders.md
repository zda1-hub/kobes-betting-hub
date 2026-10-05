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
