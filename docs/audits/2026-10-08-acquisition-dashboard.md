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
