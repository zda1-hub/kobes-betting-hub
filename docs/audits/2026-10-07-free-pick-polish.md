# Free-pick and membership polish — October 7, 2026

## Request
Highlight the $19.99 First Month plan on `/join`, strengthen the VIP prompt after free-pick signup on the homepage and `/free-pick`, and verify delivery and tagging. Preserve the existing visual design and pricing.

## Affected files
`join.html`, `membership-design.css`, `index.html`, `free-pick.html`, `free-pick.js`, `cloudflare/bettinghub-publisher.js`, `cloudflare/bettinghub-publisher.test.mjs`.

## Before and after
- Before: the first-month card had no badge. After: it carries a small “Best for new members” pill within the existing blue card.
- Before: the post-signup VIP prompt said “That was the free pick” even on no-pick days, and its timer updated once a minute. After: no-pick copy reflects the empty free-pick board, the $19.99 first-month countdown updates each second, and the join button says “Get full VIP access.” Prices and renewal terms are unchanged.
- Before: the unlock validation error still referred to two checkboxes after the simple form restored. After: the error refers to age and email terms.

## Verification
- Publisher integration test uses an in-memory SQL database and mocked Resend response to cover same-day reveal, source tag, queued email, email content, unsubscribe link, and sent status. All 16 focused publisher tests passed.
- Production build and live browser/form checks are pending publication.
- Before this change, the production D1 database had zero `free-pick-subscriber` tags and zero free-pick email outbox rows, so no real free-pick-gate send had yet occurred. Two earlier welcome emails were recorded as sent, and Resend showed the earlier test-alias welcome email as Delivered.

## Limitations
Actual current-day pick delivery cannot be tested against a live pick while the October 7 public feed has no approved pick. A controlled no-pick signup can verify the live welcome email and tag; the mock integration test verifies the pick-email path. The existing public publisher API still exposes approved picks for downstream integrations.

## Release state
Local change; append the published version and live verification after deployment.
