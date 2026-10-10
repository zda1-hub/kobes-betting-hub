# Membership continuity — October 10, 2026

## Request and approved direction

Replace the static Join the HUB journey with an inline homepage transformation. Preserve the actual orange KBH member card, scale it down roughly 25%, slide the referral bill downward/out, prioritize the $32.99 monthly membership, and reveal matching six-month/annual/paid seven-day options with smooth motion. Keep the existing visual identity and checkout integrations.

## Changes and before/after behavior

- `membership-scene.js` and `membership-scene.css`: shared native scene controller and scoped styling. Previously homepage Join links navigated to pricing. Now normal same-tab clicks open membership within the existing homepage URL, without a modal. The actual art transitions to precisely 75% of its prior width; the bill exits downward; the panel and matching orange/black plan cards enter with staggered easing. Delay fill prevents flashes. Back, browser Back/Forward and Escape restore the homepage and bill; interrupted animations preserve original hidden states. Modified clicks retain normal link behavior. Direct membership arrivals show the same scene.
- `index.html`, `join.html`, `membership.html`: load the scene before the unchanged membership checkout handler; homepage receives the environment configuration. Direct pricing markup is replaced by the shared scene. Shared header/ticker/footer and unrelated pages retain the restored visual identity.
- `site.js`: suppress exit-intent promotions while membership is open.
- `scripts/prepare-public-site.mjs`: explicitly whitelist the two assets and inject production/staging/preview config into the homepage as well as existing membership pages.
- `scripts/bento-release.test.mjs`, `scripts/billing-disclosure.test.mjs`: verify checkout hooks and billing disclosure in the rendered scene template now shared by the three entry pages. All four offer prices and renewal terms remain explicit. Valid monthly referral arrivals hide secondary choices; invalid codes do not grant referral behavior. The unchanged checkout handler validates and carries referral attribution.
- `AGENTS.md`: record this new, expressly requested membership direction while preserving the previous rejection of unrelated global restyling. The primary workspace guidance was updated too.

Prices remain monthly $32.99, six months $134.99, annual $194.99 and paid first seven days $10 followed by $32.99 monthly. No pricing, payment-worker, publisher, billing, access or email changes were deployed. The original card remains a supplied image asset; this change does not alter its Figma master.

## Verification

- Node syntax and Git whitespace checks passed.
- Automated suite: 142 tests; 131 passed, zero failures, 11 previously retired implementation checks skipped. Covers production config, checkout offers, safe redirects/idempotency, referral attribution, payment/access safeguards, public assets, email and consent integrations.
- Production public build: 87 whitelisted entries, with all changed assets included.
- Rendered and inspected populated local screens at 320px, 390px and 1440px. No horizontal overflow; controls fit their text, with at least 44px height and padded containment. The card remains visible below the pinned opaque header. Monthly comes first; longer offers use the supplied card’s orange face and black lower edge. Existing homepage card and bill retain the original full content width while the scene is closed.
- Exercised inline opening, return, browser Forward, Escape, reopening, disclosure expansion, local checkout guard, direct membership arrival, valid referral monthly-only view, and incomplete post-payment connection state. Local checkout opens no payment page and makes no charge.
- Live homepage: URL stayed `https://kobesbettinghub.com/` while opening; original 1160px artwork became 870px (75%); bill hidden after its exit; header top 0 and no horizontal overflow. Live checks also passed at 320px and approximately 390px CSS width (389px because of the in-app browser’s existing 75% site zoom).
- Live monthly CTA reached Stripe’s subscription checkout with **$32.99 per month** and the correct KBH monthly product. No payment information was entered and no subscription was purchased. This account/session went directly to Stripe; no new Discord authorization was accepted during this check.
- Live canceled-checkout state displays that the membership has not started. `/membership` resolves to the canonical `/join` route with all four offers.
- Read-only production smoke: checkout health, publisher health, current Free Pick API, public Free Pick page and client asset all passed.
- No JavaScript errors observed during the scene checks. Reduced motion disables controller animations and smooth scrolling; the preference guard and CSS were reviewed, without changing the user’s OS preference.

Evidence lives in `/Users/z/Documents/ChatGPT/Kobe's Betting Hub/outputs/audit-2026-10-10/membership-continuity/`, including `final-membership-mobile.png`, `home-open-1440.png`, `home-open-320.png`, and live screenshots. Full-page captures on production include extra canvas space caused by the browser’s saved zoom; local captures provide the clean design evidence.

## Release and limits

Published to the existing Cloudflare site using only `wrangler.site.jsonc` and the whitelist. Latest version: `672762ca-745c-4be8-9065-4b235dd5466d` (supersedes first scene release `0df66af7-cde8-4f25-a526-f03bbd73fe93`). Latest base was `ab0b00a`; verified GitHub main matched it before this change. Unrelated dirty audit/image work was preserved and excluded.

This verifies the presentation and real monthly checkout handoff, not a newly paid subscription or post-payment VIP activation. Six-month/annual/starter handlers passed automated contracts and preserve the same existing payment engine; no paid purchases were performed. Rendering was tested in the in-app WebKit browser, not on a separate physical phone or every browser engine.
