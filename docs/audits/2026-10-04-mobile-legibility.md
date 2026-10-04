# Mobile legibility — October 4, 2026

## Request and before/after
User requested 20% larger important mobile text and buttons, 20% larger footer text, 1.5× header buttons, and explicitly confirmed removing both email checkboxes with clear Send confirmation text.

- Shared legibility styles increase existing key card, offer, result, membership, and supporting text sizes by 20%. Shared mobile content headings/body and FAQ questions are also enlarged. The first-month and annual titles retain their prominence.
- Header Join control height increases 24→36px, minimum width 85→127.5px, text 10→15px; menu/social circles increase 24→36px with proportionally enlarged icons. Existing colors, shape, shadows, centered menu, and gutters remain. At widths ≤360px the Join button uses a separate row to avoid overlap.
- Footer text increases 8→9.6px on phones and 10→12px on desktop. Key mobile buttons increase their prior text/height by 20%; email input text is 16px for phone readability.
- Both required checkbox controls are replaced with visible “By selecting Send” confirmation of age 21+, permitted betting location, and free-pick/occasional-update emails, plus Privacy link. Hidden legalAge/consent fields preserve the existing handler contract. Send is associated with this explanation. No subscription was submitted during verification.
- All public pages using mobile-polish.css receive a fresh cache version. Narrow membership columns wrap titles and terms; narrow email grid children can shrink without pushing beyond the viewport.

## Affected files
mobile-polish.css; index.html; shared stylesheet cache versions in public root and guide HTML; scripts/bento-release.test.mjs (email form contract assertions).

## Verification
- 11 public release/build tests passed, including all membership offer hooks, production origin/configuration, email fields, legal/portal artifacts, and honest results rendering.
- Browser checks on Home, Membership, Approach, FAQ, Support, and Results at 320, 390, and 1280px. Shared header text measured 15px; circles 36px; footer 9.6px mobile/12px desktop. Corrected a 320px email min-content overflow; final homepage and membership measure viewport-width document bounds.
- Visual inspection of membership at 320/390px and homepage at 390px. No actual checkout, email subscription, billing, or access change was performed.

## Release
Prepared locally on codex/mobile-legibility from latest origin/main 85c2f3e. GitHub and Cloudflare production publication authorized in the current session. Deployment receipt will be appended after live verification. Public whitelist is used; unrelated files and backend workers are excluded.

## Limits
Browser responsive checks simulate phone dimensions; no physical-device check. Larger text does not establish a conversion improvement without subsequent visitor/purchase measurements.
