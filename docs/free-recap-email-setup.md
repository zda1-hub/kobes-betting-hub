# Automatic free-pick recap email

The Discord bot already posts the final compact free-pick recap. This optional
addition emails Kobe a copy when it posts, or one notice when a recap is waiting
on a verified result. It uses the existing Cloudflare Worker plus Kobe's Gmail
Apps Script; neither service receives a Gmail password.

## One-time setup

1. Deploy the updated `cloudflare/bettinghub-publisher.js` Worker using its
   existing D1 `DB` binding.
2. In the Worker, add encrypted variable `RECAP_NOTIFICATION_QUEUE_SECRET` with
   a new long random value. Add plaintext variable
   `RECAP_NOTIFICATION_RECIPIENT=kobedirwin@gmail.com`.
3. Add the new functions from `cloudflare/kobe-trends-inbox.gs` to the same
   authorized Google Apps Script project that sends Kobe's existing daily email.
   In Apps Script Project Settings, add
   `RECAP_NOTIFICATION_QUEUE_SECRET` with exactly the same value. Run
   `installKobeRecapNotifications` once and approve Gmail/external-request
   permissions.
4. In Render, add:

   - `RECAP_NOTIFICATION_QUEUE_URL=https://bettinghub-publisher.kobedirwin.workers.dev`
   - `RECAP_NOTIFICATION_QUEUE_SECRET` with that same secret
   - `KOBE_RECAP_EMAIL=kobedirwin@gmail.com`

5. Redeploy the Render worker and wait for its normal successful startup log.

## Behavior

- A final recap posts in Discord and is queued for exactly one email.
- If any official free pick remains `PENDING`, one email lists those Pick IDs.
  The bot retries ESPN grading on later checks and sends the final recap when
  every result is settled.
- Email delivery is idempotent: queue IDs prevent duplicate notices.
- The email contains only prop/result lines and records. It contains no source
  graphics, writeups, confidence ratings, or X material.
