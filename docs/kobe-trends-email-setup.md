# Kobe email Trends approval setup

This connects `kobedirwin@gmail.com` to the existing Gmail Apps Script and the
Kobe bot. An email is never published by itself. It becomes a private card in
`#pick-approvals`; Kobe chooses **Post NFL Trends** or **Post MLB Trends**.

## One-time setup

1. In Kobe's Gmail, create a label named **Kobe Trends**. Apply it only to
   emails sent by `kobedirwin@gmail.com`. Use an email subject containing
   `NFL` or `MLB`, for example `NFL Trends — Sunday slate`.
2. Add `cloudflare/kobe-trends-inbox.gs` to the existing Apps Script project
   that already sends the daily-picks email. In Apps Script **Project
   Settings**, create a script property named `TRENDS_QUEUE_SECRET` with a
   new long random value. Run `installKobeTrendsInbox` once and grant the
   Gmail/external-request permissions.
3. In the Cloudflare publisher Worker, add two encrypted variables:
   - `TRENDS_QUEUE_SECRET`: exactly the same value as the Apps Script property.
   - `TREND_INBOX_ALLOWED_SENDER`: `kobedirwin@gmail.com`.
   Deploy the Worker after the code update.
4. In Render, set these environment variables and redeploy the Discord bot:
   - `TRENDS_INBOX_ENABLED=true`
   - `TRENDS_INBOX_QUEUE_URL=https://bettinghub-publisher.kobedirwin.workers.dev`
   - `TRENDS_INBOX_QUEUE_SECRET`: the same secret as above
   - `TRENDS_INBOX_POLL_INTERVAL_MS=300000`
   - `TRENDS_CHANNEL_MAP=nfl:1541574488662085732,mlb:1541574501995905125`
5. Confirm both Trends channel IDs are included in Render's
   `ALLOWED_CHANNEL_IDS`, along with `#pick-approvals`.

## Test

Send an email from `kobedirwin@gmail.com` to the Gmail inbox with a subject
such as `NFL Trends — test` and apply the **Kobe Trends** label. Within five
minutes the bot should put a private card in `#pick-approvals`. Reject it for
the first test. A later approval should post that exact email body only to the
mapped NFL or MLB Trends channel.

## Guardrails

- Only the specified sender is accepted.
- Only subjects identifying NFL or MLB are queued.
- Replayed email IDs are ignored.
- The bot never creates a pick, changes the email text, or posts a Trend until
  Kobe approves it in Discord.
- The legacy `TRENDS_AUTO_PUBLISH_ENABLED` setting is deliberately ignored;
  direct automatic Trends publishing is disabled.
