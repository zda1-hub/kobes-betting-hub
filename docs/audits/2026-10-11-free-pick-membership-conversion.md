# Free-pick email conversion — October 11, 2026

The user asked what happens after a visitor subscribes to free picks and how that visitor is encouraged to try membership, while continuing creator outreach and dashboard work.

## Observed behavior

- The publisher sends the current approved pick when available, otherwise a welcome email, then future published free picks. Consent and the existing token unsubscribe are retained.
- A specific subscriber's D1 record shows an October 8 signup, a sent welcome and October 9–11 pick deliveries. Resend independently marks the October 10 and 11 messages delivered. These records do not prove an open, click or paid membership.
- Emails previously ended with a plain VIP join link, omitting the current two-day trial and renewal terms. The public free-pick view already explains the trial after unlocking.
- No timed promotional follow-up sequence or trial/member suppression exists in the free-pick publisher. Do not represent either as implemented.

## Change

- `cloudflare/bettinghub-publisher.js`: future welcome and approved free-pick emails explain the two-day trial, VIP contents, $0 today, $32.99 monthly renewal until canceled, and cancellation before trial expiry to avoid the first charge.
- The single membership link uses campaign-level email UTMs. No recipient email, name or subscriber token is included in that membership URL.
- `cloudflare/bettinghub-publisher.test.mjs`: validates named selection, trial/renewal/cancellation terms, campaign fields and unsubscribe preservation. Existing send-once/signup cases use the revised invitation label.
- No extra marketing emails, historical resends, membership/billing changes or visual website redesign are part of this change.

## Verification and limits

- Publisher suite: 23 tests passed locally, including current/no-pick signup, one pick per date, unsubscribe handling, approved social-email idempotency and redaction.
- Subscriber checks were read-only, and private receipts remain outside this public audit.
- A separate follow-up campaign must first join subscriber records to current trial/paid-member status, suppress unsubscribed or converted recipients, and preserve idempotent delivery. It is a proposal, not an active sequence.
- Email attribution measures consented site sessions and checkout/payment events; it does not establish that a person read an email. Existing consent behavior is unchanged.
- Status: local tested change; publication receipt will be appended after release.

## Publication receipt

Published October 11 from the latest GitHub main base `0c3fed8`, change `f15e1e2`. Publisher Cloudflare version: `044a9244-523a-44ea-95e8-320c80f789f0`. Deployment preserved existing variables (`--keep-vars`) and the five-minute scheduled trigger. No additional subscriber email or historical resend was requested by this deployment. The next naturally queued welcome/pick email will carry the new invitation; its provider receipt has not yet been observed.
