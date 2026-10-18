# Free Pick graphic delivery repair — October 18, 2026

The user asked that every approved Free Pick graphic reach Kobe, including today's picks and the Bijan Robinson pick. The user then confirmed those graphics had already been sent, so no manual replay or resend was performed.

## Defect and repair

- `bot/lib/free-pick-delivery.js` previously queued the graphic only after website publication. A website failure or a later pick replacing the current website slot could leave an approved pick without a graphic email. It also treated a pending provider response as complete. The email step now runs from the verified canonical Discord pick, independently of website/X delivery, and completion requires a sent receipt.
- `cloudflare/free-pick-social-email.js` previously accepted only the website's single current pick ID. It now accepts each authenticated, current-day approved pick, while retaining the fixed Kobe recipient, Discord URL requirement, exact terms check for the current website pick, per-pick idempotency key, and provider retry window.
- `bot/lib/free-pick-social-email.js` passes the canonical operating date and approved breakdown to the protected email queue. The graphic keeps the 1080×1920 Reel format and date-stable opener.

## Verification

- 43 focused tests passed across the delivery, graphic-email, and Publisher Worker suites.
- `git diff --check` passed.
- No live email was sent during the repair. The user's delivery confirmation is distinct from a provider receipt inspected during this session.

## Release

Pending publication and post-deploy receipt check.
