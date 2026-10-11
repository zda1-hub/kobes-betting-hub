# Expert lineup horizontal rail — October 10, 2026

## Request
The screenshot shows /exclusives (despite ambient /results URL). Replace the crowded vertical directory with a horizontal scroll rail and improve continuity with the approved membership design.

## Before and after
Previously: duplicated intro heading, tall orange panel, 12 sources in a multirow grid, Show more pagination, a long visible rate footnote and a second membership pitch.
Now: compact orange intro, one membership action, an inset gray panel with equal-height white source cards in one horizontal row. All 120 sources are immediately available. Names and supplied rates are unchanged. Search covers all entries; explanatory details remain in the existing disclosure. Removed duplicate lower membership pitch. Preserved the shared header, referral art, darker blue CTA, palette, typography and membership integrations.

## Files
`exclusives.html`: consolidated intro/details and rail controls; reordered page CSS after shared styles and cache-busted changed assets.
`lineup-bento.css`: one coherent scoped layout with existing interior inset/shadow tokens, 28px outer corners, 20px desktop/16px mobile inner card corners, and 44px controls.
`exclusives.js`: full-roster filtering, wheel-to-horizontal movement while the rail can consume it, native touch/trackpad scrolling, mouse drag, keyboard Home/End/Page/arrow keys and previous/next controls. Reduced motion uses immediate programmatic scrolling. No automatic movement or looping.
`scripts/exclusive-directory.test.mjs`: retained roster integrity checks; replaced pagination assertions with full-roster search/recovery plus wheel boundary, keyboard and reduced-motion behavior tests.

## Evidence and checks
Populated browser layouts at 320×844, 390×844 and 1440×1000. No document horizontal overflow, header top 0. All 120 cards remain present, equal heights (150px mobile, 160.984px desktop) with 210px/230px widths. Both arrow buttons are 44×44 inside 20px mobile/24px desktop insets. CTA text plus arrow fits with 48px total horizontal padding. Long DormroomDegenerates label measured 188.35px in 190px available desktop width; no card content overflow.
Mouse wheel increased horizontal scroll; End reached the actual rail end and exposed source120, disabling Next. Full-roster search found yourdailycapper; no-match state and clearing recovered correctly. Disclosure and Join action exercised; Join reached the existing membership scene and its Cancel Anytime copy. Console warning/error inspection empty.
301 automated tests: 290 pass, 11 pre-existing retired skips, zero failures. Static public build pending.
Before/after screenshots and geometry: primary workspace `outputs/audit-2026-10-10/lineup-rail/`. No physical mobile touch device tested; native pan gestures are retained. No billing, access, email or attribution changes.

## Release
Local verified. Public deployment and live checks pending; unrelated exit-referral audit and Discord preview image excluded. Public-only build whitelist used.

## Published follow-up
Public-only build prepared 88 entries. Cloudflare version `cae336da-46f2-4db9-8443-894ccf62705f` deployed only the three changed public assets. Live Next and mouse dragging moved the rail, with scrollLeft advancing 738→984 on drag; warning/error inspection empty. Live screenshot saved as `live-desktop.png`; viewport restored.
