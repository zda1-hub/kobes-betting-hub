# Wins and Free Board polish — October 10, 2026

## Request and scope
Remove the long unavailable-records sentence and its extra spacing, strengthen the historical 65% hierarchy, smooth Free Board collapse, and let winning cards have different content widths with equal heights. Follow-up: replace Free Board's arrow with a chevron down control.

## Changes
- `index.html`: removed the long supporting-records paragraph; kept the compact “Kobe-reported historical estimate” adjacent to 65%. The estimate has not become a verified overall rate. The published gallery remains wins-only.
- `results.html`, `recaps.html`: shortened the historical qualifier and tightened its spacing.
- `view-continuity.css`: larger single-line 65%, compact qualifier, stretched win cards with natural content widths, contained round chevron, and Free Board snapshot transitions. Closed mobile cards give their copy full width and place the chevron inside the bottom trailing inset. The summary remains the keyboard-accessible disclosure control; no nested button.
- `site.js`: Free Board commits its grid/height state once; native view transitions bridge geometry instead of animating a height defeated by an existing `!important` rule. Interruptible older-engine fallback and reduced-motion branch remain available. Local-only motion audit records frame intervals.
- `home-results.js`: pause automatic scrolling while a Free Board transition is active.
- Public HTML references updated for changed shared assets. `scripts/bento-release.test.mjs` now checks the approved compact qualifier instead of requiring the removed sentence.

## Verification
Visible browser testing at 320×844, 390×844, and 1440×1000. Click-open and keyboard-close both worked, chevron points down closed/up open, no document horizontal overflow. Chevron remains 16px from mobile trailing/bottom edges and 24px from the desktop trailing edge. Rapid keyboard reversal settles correctly with no stuck transition flag; manual Next win still works.

Opening samples: 21 frames at each width, maximum interval 17.5–17.6ms. Closing samples: 16 frames, maximum interval 17.1–17.5ms; no sampled intervals above 25ms. These are browser observations, not a guarantee for all phones. All rendered win cards had equal height 182.984px with widths varying from 166px to responsive caps of 240/310/360px. 65% remains on one line. Screenshots and measurements: primary workspace `outputs/audit-2026-10-10/wins-free-board/`.

Public test suite: 300 total, 289 passed, 11 intentionally retired skips, zero failures. Actual Safari/iPhone hardware, older-engine fallback and OS reduced-motion mode were not exercised this pass; their branches were inspected. No email, payment, referral attribution or membership access rules changed.

View transition API references: https://developer.mozilla.org/en-US/docs/Web/API/Document/startViewTransition and https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Selectors/::view-transition-group .

## Release status
Local verified; public release and live verification pending. Only the explicit public-site build whitelist is eligible for deployment. Unrelated exit-referral audit and generated Discord image excluded.

## Published follow-up
Published the public-only Cloudflare worker version `753568d9-999f-4b9e-be45-9e148d4d1243`. Live Free Board was opened and closed with the down/up chevron; console warning/error inspection was empty. Production smoke passed checkout health, publisher health, current free-pick API, page, and client asset. Viewport restored after verification. Live screenshots saved alongside local proof.
