# Acquisition dashboard — October 8, 2026

## Request

Show how Google Analytics, email signups for the free pick, and free Discord joins can be tracked on the private dashboard, while preserving the public website design and existing membership flow.

## Affected files

- `admin-analytics.html` and `admin-analytics.js`: added a direct Google Analytics link, subscriber-service metrics, and a verified Discord server-join section under Traffic & conversions.
- `cloudflare/bettinghub-publisher.js`: added a bearer-protected aggregate subscriber-statistics endpoint and a server-confirmed free-pick form-completion record. Counts contain no email addresses.
- `cloudflare/kobes-checkout-worker.js`: retrieves subscriber aggregates with a server-only shared secret and summarizes bot-recorded `discord_join` events by source and campaign.
- `cloudflare/bettinghub-publisher.test.mjs` and `cloudflare/kobes-checkout-worker.test.mjs`: verify endpoint access, successful unlock counts, and the distinction between real joins and invite clicks.

## Behavior

Before: The dashboard counted consented successful email submissions and CTA clicks. The bot recorded real Discord joins, but those join events were not displayed on the dashboard. Unique subscriber and delivery totals lived only in the email service. Google Analytics reports were separate.

After: The dashboard links to Google Analytics; shows active subscriber count, opt-ins in the selected range, server-confirmed free-pick form completions, unlocks with a pick available, pick emails sent in the range, and current pending pick emails; and shows verified Discord joins with attributed versus unknown invite sources. The email counts include visitors who declined optional website tracking. Discord joins include anyone who entered the server, whether free or paid; an outbound website click is never labeled a join. Unlock completion counts begin with this release and are not backfilled.

## Verification and limitations

- Targeted publisher and checkout Worker tests: 81 passed.
- The dashboard remains private behind its existing Discord admin session. Aggregate email stats require `DASHBOARD_STATS_SECRET` set to the same value on both Workers; either endpoint fails closed without it.
- Google Analytics detailed reports stay in Google Analytics; the private dashboard retains its independent first-party funnel. Google Analytics collection still requires realtime verification after processing.
- Discord invite attribution is conservative: ambiguous, unmapped, or unavailable invite data is shown as unknown. The bot has recent production receipts confirming join recording is enabled.

State: local, pending publication.

## Publication follow-up

PR #192 merged to main at `f9cb808`. The publisher Worker was deployed as `a00f737f-3e49-4762-a4d0-5856bca7a8e7`; the checkout Worker as `14dcb045-57d8-4bcf-939a-0df3109563be`; and the public site Worker as `2e8ccaad-d864-4938-9086-3ebd3a6efdbe`, using the GA4 ID for the static build. Both backend Workers have the same private `DASHBOARD_STATS_SECRET`. The live subscriber endpoint returned HTTP 401 without the secret and HTTP 200 with it. Its initial aggregate result was 4 active subscribers, 4 opt-ins over the all-time test range, 0 newly recorded unlock completions, and no pending pick emails. The live `/admin/analytics` HTML contains the new report sections and the checkout health endpoint returned HTTP 200. Full dashboard rendering could not be inspected in the in-app browser because its Discord account was not signed in; no admin session was bypassed. State: published; authorized dashboard visual verification remains available when the owner signs in.
