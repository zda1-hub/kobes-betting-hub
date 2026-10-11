# Approval-triggered free-pick chat graphics — October 11, 2026

## Request
The user supplied a text-message graphic reference and explicitly requested correctly spelled, similar posts based on the Free Pick Kobe chooses in Discord, emailed every day to kobedirwin@gmail.com. Creator research remains authorized; individual creator emails still require the existing user review process.

## Implementation
- `bot/lib/free-pick-chat-card.js`: deterministic, editable SVG source rendered with the existing Sharp dependency into a 1080 × 1350 JPEG. Gray incoming bubble, blue outgoing bubble, correctly spelled “Baby,” canonical named wager/odds, and three complete approved evidence points. No invented stats or shopping/profit promise. Long text reduces typography within a bounded range; unsupported multi-leg/oversized content needs graphic review without blocking Discord publication.
- `bot/lib/free-pick-social-email.js`, `bot/index.js`, `bot/lib/free-pick-delivery.js`: call the email service after current-day canonical Discord/website publication, passing the original approved packet. A missing Story asset does not prevent this email. Notification failures retry without reposting the pick.
- `cloudflare/free-pick-social-email.js`, `cloudflare/bettinghub-publisher.js`: a protected, recipient-restricted queue sends an inline JPEG attachment through the existing configured Resend service. It requires the current pick ID, identical selection/odds, and a Discord post reference; recipient is fixed to Kobe. Separate KV image and D1 receipts preserve website, Instagram Story and subscriber flows. No additional paid service, mailbox credential, public social post or historical replay.
- Persistent receipts deduplicate per Pick ID. Retries share a provider idempotency key; after 23 hours from an ambiguous first attempt they are held for receipt review, respecting Resend's 24-hour idempotency retention.

## Current example and delivery
Today's source is the approved `20261011-101-X` selection: DeVaughn Vele, over 3.5 receptions (-125). The three selected claims are all present in the saved approved packet. `outputs/free-pick-chat-20261011/vele-chat-card.svg` and `.jpg` contain the rendered example; the actual image was visually inspected for full text, fit, spelling and complete claims and shown inline to the user.

Gmail confirmed the explicitly requested email was sent to Kobe with the inline JPEG: message ID `1a12c381a0bebcab`, label SENT. No creator email was sent. Future selected picks use the approval-triggered bot route; today's completed pick is not replayed by this change.

## Verification/release
91 targeted tests passed, including actual Sharp JPEG dimensions, named-player/approved-evidence requirements, absence of accidental leg removal, email failure recovery, recipient restriction, exact-term rejection, duplicate suppression, retention of existing website/Story state, and safe retry limits. Bot syntax passed. Automated provider delivery is verified with mocked transport; today's actual email used Gmail. Public backend deployment is pending; append actual deployment evidence below. No frontend design changes.

Official provider references: https://resend.com/changelog/embed-images-using-cid and https://resend.com/docs/dashboard/emails/idempotency-keys .
