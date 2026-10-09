# October 8, 2026 — Free-pick email follow-up

## Requested change
Check whether real visitors joined the free-pick email list. When someone signs up, deliver the pick by email with a short explanation of how to join VIP, without an information-heavy welcome message. If no pick is posted at signup, send the next published pick.

## Findings before change
Cloudflare D1 showed four subscriber addresses: three clearly identifiable business test addresses and one other address. The other address was subscribed and tagged `free-pick-subscriber` with source `direct`. Its free-pick email outbox had no row. Resend showed its general welcome email as delivered; no pick email was shown. No inference was made about whether the address belongs to a paying member or about the recipient's intent.

## Files affected
- `cloudflare/bettinghub-publisher.js`
- `cloudflare/bettinghub-publisher.test.mjs`
- This audit

## Before / after
- Before: the free-pick email included two site links. A visitor joining on a no-pick day received the generic welcome, and the next published pick was not queued for that existing subscriber.
- After: a free-pick signup on a no-pick day receives a short, accurate welcome. The next current-day published free pick is queued for subscribed, tagged free-pick subscribers. The pick email carries the pick and one VIP join link. One email per subscriber per operating date is enforced with a stable outbox key, including replacement publishes. Publishing changes that day's `no_pick` flag to `published` so the pick becomes visible. Existing unsubscribe and retry behavior remains in place.

## Verification
- Ran `node --test cloudflare/bettinghub-publisher.test.mjs` on the latest `origin/main` base: 18 passed, 0 failed.
- New test covers no-pick signup, short welcome, later publication, delivery, live gate state, and replacement deduplication.
- Read-only checks in Cloudflare D1 and Resend confirmed one non-test-looking signup and delivered welcome. No email was sent manually during this audit.

## Limitations / publication
- Source change is prepared locally on the latest GitHub base. It is not yet deployed. The live subscriber will receive the next pick only after this Worker release and a new current-day pick is published.
- The address was classified as non-test-looking from its naming and tag; owner confirmation would be needed to establish the person's identity.

## Follow-up refinement
The homepage email form now sends the current pick instead of a separate welcome when one is live. The pick email omits the duplicate social caption and uses one VIP link. Delivery rechecks subscription status immediately before sending. A test covers the homepage path; the focused suite now has 19 passing tests.
