# Approved website audit implementation — October 10, 2026

Authorization: user approved the prior audit’s fixes and recommendations except the homepage introduction. The follow-up explicitly requests public wins only, all verified wins accessible, and the historical 65% heading. Existing publication authorization applies. No emails, social posts, purchases or billing-plan changes are part of this release.

Scope: shared compact opaque header; matching utility-page headers; centered equal-shadow 44px icon targets and narrow-screen menu; intrinsic plan/lineup buttons; responsive card/bill derivatives with originals preserved; balanced mobile bento; truthful billing FAQ and support destination; prioritized monthly/annual plans; three primary VIP tools plus four secondary benefits; contextual promotions; searchable incremental source directory and winning-pick list; qualified historical estimate beside the heading; keyboard/manual-motion control and dialog focus; correct missing welcome-link state; conservative sport metadata projection; current legacy VIP referral access consistently checked at login/session/link use, retaining entitlement blocks. Private canonical wager identity, grades and verification receipts are untouched.

Before: recap metrics were blank and its copy claimed a complete record while showing wins; 538 rows rendered at once. Sport metadata inherited unrelated grouped-post labels. Support’s malformed invite failed. Direct welcome visits left checking/hidden action states visible. Some buttons/arrow labels overran their padded bounds. Account pages used older headers; original-only images transferred about 3 MB. The newest user request supersedes the proposed full public ledger: both results routes and public highlights now display verified wins only, with all wins available through filters and Show more.

After: 30 initial verified wins with date/sport/text/source search; all 538 existing wins retained. The 65% figure remains a Kobe-reported historical estimate with incomplete supporting records, never a computed verified rate. Ambiguous sport metadata is held as unconfirmed; unambiguous contradictions are corrected. Source labels are retained when the bot supplies them. The historical verification system continues internally. Directory search searches all 120 sources, with 12 displayed initially. Header and utility-page recovery match the current project system. Legacy/complimentary VIPs use existing Discord role eligibility without buying again; blocked paid entitlements cannot fall back to a stale role. Paid conversions in the existing analytics pipeline remain tied to Stripe/payment events rather than Discord VIP role count.

Verification: 300 automated checks pass, 11 retired checks remain skipped. Build produces 85 whitelisted entries. The excluded homepage introduction is byte-identical to HEAD. Browser checks cover 25 unique routes at 320px, 390px and 1440px, with zero horizontal document overflow, header top 0 and no checked control-label overflow. Exercised directory search, empty/reset, Show more; winning-pick filters/empty/reset/30→60 pagination; mobile menu/Escape; arbitrage/free-pick disclosure states; annual preview control (no charge); welcome missing-link recovery; referral-dialog Tab loop and Escape. Unit tests cover focused/reduced-motion/idle gallery behavior and legacy referral eligibility with blocked-entitlement protection. Image derivatives are 7.6–160 KB per file, preserve the supplied artwork and originals, and use responsive srcsets. Contrast-sensitive blue/orange text is corrected without changing approved control shapes.

Evidence: primary workspace outputs/audit-2026-10-10/approved-fixes/ contains responsive-checks.json, mobile/desktop rendered screens, wins and modal screenshots. Local preview GET proxy includes gate status; POST remains disabled. Older preview gate warning was fixed by the read-only proxy and is not a production defect.

Limits: no new live payment, OAuth authorization, cancellation or cash payout was executed. Missing/ambiguous sport labels need source review; no guessed school league is published. Historical 65% supporting records are unavailable. Browser screenshots and control geometry prove the reviewed states, not every signed-in account’s billing lifecycle.

Affected tracked files:
- 404.html
- AGENTS.md
- approach.html
- bot/lib/public-results.js
- bot/lib/public-results.test.js
- cancel.html
- cloudflare/bettinghub-publisher.js
- cloudflare/bettinghub-publisher.test.mjs
- cloudflare/kobes-checkout-worker.js
- cloudflare/kobes-checkout-worker.test.mjs
- cloudflare/x-queue-authorization.test.mjs
- creator.html
- exclusives.html
- exclusives.js
- faq.html
- free-pick.html
- guides/bankroll-management-for-sports-betting.html
- guides/how-to-choose-a-sports-betting-discord.html
- guides/how-to-read-betting-odds-and-line-movement.html
- guides/index.html
- guides/sports-betting-arbitrage-explained.html
- guides/what-a-sports-betting-writeup-should-include.html
- home-results.js
- home.js
- index.html
- join.html
- member.html
- membership.html
- partner.html
- privacy.html
- proof.html
- recaps.html
- refer.html
- responsible-gambling.html
- results.html
- results.js
- scripts/bento-release.test.mjs
- scripts/exclusive-directory.test.mjs
- scripts/prepare-public-site.mjs
- scripts/preview-site.py
- site.css
- site.js
- support.html
- terms.html
- welcome.html
- welcome.js

Additional files: audit-polish.css, result-metadata.js, scripts/approved-audit.test.mjs, six responsive WebP derivatives, and this audit.

Status: locally implemented and verified; publication/version evidence will be appended after deployment.

Publication follow-up: public whitelist deployed as Cloudflare site version `3635fe07-c808-4675-b2ec-a63f27305dc7`; publisher version `c54929fe-89f7-4839-8893-106dc5d2f686`; checkout version `da732c4d-1b9e-4a61-a8e7-52da48047dd2`. Current API still returns 538 verified wins. These releases retain existing bindings, secrets, scheduled triggers, plan prices and canonical verification data.

Broader validation: 377/388 bot/pipeline tests pass. The same 11 Telegram-reader/archive-source failures reproduce from a clean HEAD snapshot (8/19 pass, 11 fail in those two unchanged files). They are tracked as pre-existing checks outside this website implementation, not reclassified as passing or silently skipped. No new bot/pipeline failures were introduced. The changed public-results and canonical public-row tests pass.

Live verification follow-up: implementation commit `dbb2fb263c75bcd6e93ded61b6dcc4c88930b8c6` is on GitHub main. Render deploy `dep-db5bnbbrjlhs73alh010` reached live at 2026-10-10 22:27:31 UTC. Production smoke passed checkout health, publisher health, current Free Pick API, Free Pick page and client asset. The refreshed public data retains 538 wins and now includes source names. Live results renders only win badges; pagination and text filters work. Published home, join and recap layouts have header top 0 and no horizontal document overflow at measured CSS widths 320, 389 and 1440px. The browser's existing 75% page zoom was accounted for; earlier screenshot names ending 390 represented a 520px CSS viewport and are superseded by live-wins-mobile.png, live-wins-rows-mobile.png and live-responsive-checks.json. Local exact 390px proof remains valid. Temporary browser viewport overrides were reset and the agent-created verification tab closed. Status: published and verified within the lifecycle limits recorded above.
