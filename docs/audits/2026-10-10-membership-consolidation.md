# Membership consolidation — October 10, 2026

## Requested change

Refine the approved inline membership journey: add space above the original KBH artwork; replace the shared header Join label with Back to the Hub while open; remove the second Back link, slogan and duplicate monthly price box; center the monthly action and single billing line; darken blue actions; tighten supporting copy; use one six-month/year poster with a segmented duration toggle; center renewal and membership-management content.

## Before and after / affected files

- `membership-scene.js`: monthly now shows “Cancel Anytime, No Commitment.”, Join monthly, and “$32.99 billed monthly.” The supplied artwork retains its embedded price. Removed the visible duplicate heading, price block and under-card navigation. The header returns to its original Join label when the homepage is restored. Direct `/join` Back returns to the homepage.
- One longer-plan poster replaces two cards. Six months shows $134.99 billed every 6 months; One year shows $194.99 billed yearly. Price, renewal period, button label and the existing checkout offer update together. Keyboard activation works; controls disable together while checkout preparation is busy. Seven-day pricing remains in a compact disclosure with its $10 initial charge and subsequent $32.99 monthly renewal explicit.
- `membership-scene.css`: centered composition, 36px top padding on desktop / 28px on mobile, additional artwork spacing, compact support group, orange/black poster, dark-blue actions (#2459a8), centered renewal and black management button. At 320px the header Back label uses 14px text to preserve separation from its neighboring controls. Details motion supports rapid reversal; reduced motion retains native disclosure behavior.
- `site.css`: shared header action uses the same darker blue. Other public-page layout, artwork and typography are preserved.
- `index.html`, `join.html`, `membership.html`: refresh the two scene asset versions to `20261010-consolidated`.
- `scripts/bento-release.test.mjs`, `scripts/billing-disclosure.test.mjs`: adapt offer/disclosure checks to the single toggle-driven poster; verify the dynamic checkout mapping and unchanged billing terms.
- `AGENTS.md`: append this explicit design follow-up, including the original workspace guidance.

No payment engine, worker, access, referral, email, price, artwork or billing-policy change was made. Existing referral arrivals retain their monthly-only offer behavior and renewal disclosure.

## Verification

- Node syntax and Git whitespace checks passed. Automated suite: 142 tests, 131 passed, zero failures, 11 previously retired checks skipped. No new skips.
- Production build contains 87 explicitly whitelisted entries. Release uploads only the six changed public HTML/CSS/JS assets.
- Populated local layouts inspected at 320px, 390px and 1440px. No horizontal overflow; one long-term poster; monthly price appears once outside the supplied art; supporting copy, renewal and management align centrally. Artwork begins 44px below the pinned header at mobile / 52px at desktop after scene alignment.
- At 320px, header Back bounds are x16–147.54 and menu bounds x160–192; remaining icons occupy x200–232, x236–268 and x272–304. Monthly CTA has approximately 36.88px symmetric interior spacing and 46.4px height; long-term and management actions have 24px horizontal padding and 46.4px height.
- Exercised both duration selections, keyboard Enter, header return and homepage restoration, seven-day disclosure and preview checkout guard, disclosure reversal and direct membership arrival. Monthly remains the first offer. No checkout charges occur on localhost.
- Live homepage opens the scene without changing its URL; correct header Back label, single longer poster, annual price/checkout selection and no overflow at approximately 390px CSS width (389px due to saved browser zoom).
- Live annual CTA reached Stripe with “Kobe's Betting Hub — Annual Membership”, **$194.99 per year**, and the explicit every-year-until-canceled description. No payment details entered, payment submitted or new Discord authorization accepted. Previous monthly handoff verification is recorded in the continuity audit.
- Live direct `/join` displayed the consolidated scene; header Back returned to `/` and restored the Join label.
- Read-only production smoke passed checkout health, publisher health, current Free Pick API, public Free Pick page and client asset.
- No scene JavaScript errors observed. Reduced-motion guards reviewed without changing OS preferences.

Screenshots: `/Users/z/Documents/ChatGPT/Kobe's Betting Hub/outputs/audit-2026-10-10/membership-consolidation/` (`mobile-320.png`, `mobile-390-six-month.png`, `desktop-1440.png`, `live-annual-mobile.png`). Local full-page screenshots give clean design evidence; production screenshot uses the browser's saved zoom.

## Publication and remaining limits

Published to the existing Cloudflare public-site worker: version `5c15b93d-b600-4428-9aea-57d136af7fcb`, based on latest GitHub main `0acd2f79d18b3b010bc84d2feb10f9d3bb7abbc3`. Backend code and unrelated dirty audit/image work are excluded. The Git commit carrying this audit records the matching source revision.

This verifies visible presentation, interactions, offer contracts and live annual checkout handoff. It does not claim a new paid membership or post-payment VIP activation. Tested in the in-app WebKit browser, not a separate physical phone or every browser engine.


## Follow-up — October 10, 2026

The user requested a larger destination card, smoother matched geometry, shared public-page continuity and a compact mobile header. See [view continuity and motion audit](2026-10-10-view-continuity-motion.md) for the subsequent implementation and verification; this supersedes the earlier card-shrink direction.
