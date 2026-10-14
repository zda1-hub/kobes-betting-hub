# Tracker feed restoration — October 13, 2026

Requested: restore website winning-play tracking and visitor/Meta reporting without changing the approved design.

## Findings and changes

- Live verified-results service returned HTTP 200 and 683 wins (50 recent entries). `results.js` already uses the full `wins` snapshot, then filters W entries. No repair required there.
- `home-results.js` incorrectly used only `recent`, capped at 50 results. A period of losses could hide existing verified wins. It now prefers the full verified `wins` feed, with the existing wins-only filter, 16-card cap, existing markup and motion. Legacy snapshots fall back to `recent`; an explicitly empty wins feed remains empty.
- `admin-analytics.js` already renders source-level Meta website page views and site sessions separately. Its overview showed sessions but omitted page views. Restored Website page views beside Tracked site sessions using existing metric styles. The report still labels thirty-minute opted-in sessions and leaves actual Meta ad link clicks unavailable (no Ads API evidence).
- Existing `analytics.js` consent gate, thirty-minute session ID and individual page-load dedupe remain intact. Existing public builder injects consent/integration/analytics scripts. Existing backend separately counts page views, excludes interaction/engagement samples and inline membership openings, and returns sessions independently.

## Verification

21 focused front-end/consent tests passed, including executing the real homepage script with fifty losses plus a historical verified winner, legacy snapshot and explicitly empty wins scenarios. Dashboard VM test verifies separate 91 views/37 sessions and 65 Meta views/22 sessions; unknown ad clicks stay unavailable. Five focused backend reporting tests passed. Both changed scripts pass Node syntax checks.

Rendered 320px/390px/desktop and authenticated production reporting require parent integration/browser checks; no browser visual proof is claimed in this subtask. Changes are local only and not deployed. Root owns integration/cache version updates, public build and final browser verification. No tracking events, ad claims, consent rules, billing/access or underlying results were altered.

## Published verification — October 13, approximately 7:12 PM MST

Commit 85d1210 pushed to origin/main. Public site version a3c8d0fa-5f87-46d8-b288-43d29568b87f and publisher version c63a2d62-de5f-4c54-ad3a-bf6da757dc72 deployed. Render deploy dep-db7e8gajnfac73d758l0 became live on the same commit. Live public API refreshed with 683 wins and 49 count-only expert records for October 12 MST. Homepage rendered 16 win cards. Live message disclosure opens; all 22 review screenshots are present and image viewer closes by Escape with focus restored. Authenticated dashboard displayed Website page views beside 30-minute site sessions, with separate Meta views/sessions; actual Meta ad clicks remain unavailable without an Ads Manager connection. Known validation visits are tagged other/codex_verification, not counted as organic customer acquisitions.

Local 320/390/1280 checks remain the responsive evidence. The live browser observed a 520px layout despite a requested 390px override, so that capture is not described as a 390px live check. No new console errors observed in checked live paths. A Discord aggregate embed limit failed in the first bot rollout and is being repaired separately; no claim of completed Discord list refresh until an actual success receipt.
