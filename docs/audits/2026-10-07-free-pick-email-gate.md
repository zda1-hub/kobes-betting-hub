# Free pick email gate — October 7, 2026

## Request
Add an email-gated free pick to the homepage and `/free-pick`, reveal the current daily pick after signup, email the same content, and show the current VIP offer. Preserve the public design and existing publishing flow.

## Affected files
`index.html`, `free-pick.html`, `free-pick.css`, `free-pick.js`, `cloudflare/bettinghub-publisher.js`, `cloudflare/bettinghub-publisher.test.mjs`.

## Before and after
- Before: the free pick appeared publicly as soon as it was approved; the separate homepage email form sent a welcome email only.
- After: when the gate is enabled, both pages show an email form with optional name, age and consent checkboxes. A successful submit stores the subscriber and source tag, reveals only a same-day pick in place, queues the same pick for Resend delivery with an unsubscribe link, and shows the existing $19.99 first-month offer with its October 22 MST deadline and a live countdown. A no-pick day accepts signup and shows a no-pick message plus the VIP link. Failed requests leave the form visible with an error.
- The gate defaults off and can be toggled using the authenticated publisher gate endpoint. The existing approved Discord free-pick publishing path remains the way to update the pick without editing code. An authenticated day-status override can mark today as `no_pick`.

## Verification
- Publisher syntax check and 15 focused publisher tests passed, including authorized gate control and invalid-consent rejection.
- Public site build generated 81 whitelisted entries; `git diff --check` passed.
- Live Worker, browser interaction, and actual Resend delivery still require production release verification.

## Limitations
- This first release is a user-interface gate: the existing public publisher API and media URL still expose the approved pick for downstream dashboard and Instagram integrations. It is not a secure content paywall.
- Scheduling a future pick, clearing a pick, and editing it from a dedicated admin screen are not included. Today's pick can be published through the existing approval workflow; today's no-pick state and gate switch use an authenticated API.
- Delivery is queued after the page responds and retried on the existing five-minute schedule. The form response cannot guarantee sub-two-second completion or immediate inbox delivery.

## Release state
PR #170 merged into `main` at `98127cd1637cc1a4098d9df1ab676e1a9a32293b`. Publisher Worker version `8eb8f755-492c-4a66-8037-cbf9889c4854` and public site Worker version `cb5b3b62-3b54-44b9-906a-6f119ec67813` deployed from that commit on October 7. The KV gate switch was then set to `on`.

Live checks: `/free-pick` returned HTTP 200 with the new client asset; `/api/free-pick/gate` returned `enabled: true`, `hasPick: false`, and the current MST date `2026-10-07`; the live unlock route rejected invalid email and missing consent with HTTP 400 and the expected site CORS header. No production subscriber address was supplied for a positive live delivery test, so inbox arrival is unverified. The current feed has no October 7 pick; the site should display the no-pick state until an approved pick is published.

The focused publisher suite passed 15/15. Three existing `bento-release` assertions failed against rewritten production links (`/results` versus `results.html`) when run after the public build; no checkout or referral code changed in this release.

## Follow-up: image-card email completeness
The first release queued pick details but could omit the actual card when an approved pick was image-only. The email now includes the approved caption and a direct link to the same pick card. The outbox identifier also includes the publication timestamp, so an intentional replacement can be emailed once per subscriber. Publisher syntax and focused tests were repeated before this follow-up release.

## Follow-up: restore the simple email form
The user requested removal of the visible checkboxes and the extra name field. `index.html` and `free-pick.html` now ask for email only, with the same submit-button age and email-consent notice used by the previous homepage signup. The existing backend validation still receives the age and consent attestations. The in-page reveal, email delivery, VIP prompt, and gate switch are unchanged. Verify the public build and live form after deployment.

## Follow-up: no-pick VIP path
The user requested a direct message and arrow link when no free pick is posted. `index.html`, `free-pick.html`, `free-pick.js`, and `free-pick.css` now show “No free pick is posted today. Join → to see the full VIP slate.” on no-pick days. The link opens `/join` and records the existing CTA-click event. The email form remains available for future picks. The link hides when a current pick is available. The public build and live pages are to be checked after deployment.

## Follow-up: privacy-link layout and no-pick form copy
The new form reused the old `.email-consent` flex styling, which placed its Privacy link far from the sentence. At the user's request, the inline link was removed from the new form; the public footer still links to the privacy page. The notice is now one continuous line of copy, and its wording applies whether or not a pick is available. On no-pick days, the submit button reads “Get future free picks” instead of promising an immediate unlock. Files: `index.html`, `free-pick.html`, `free-pick.css`, `free-pick.js`. Verify the public build and live pages after deployment.
