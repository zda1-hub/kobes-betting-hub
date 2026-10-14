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
