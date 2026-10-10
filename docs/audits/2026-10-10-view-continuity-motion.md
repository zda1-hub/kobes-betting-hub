# Matched membership motion, public continuity and mobile refinements — October 10, 2026

## Request and implementation

The user reported visible Join/Back hitching, asked for continuity with the consolidated membership view across public pages, larger desktop intro copy, and a homepage card matching the bill height that grows into membership. Follow-ups rejected the tall mobile header, requested smaller mobile intro text, responsive interior typography, subtle glass/blur on floating surfaces, a member card wider than the secondary term poster, and a simpler winning-play tracker without filters.

Before: closing used sequential fade/layout/scroll/scale stages; mobile header consumed about 171px; card shrank into pricing; public pages mixed spacing/action treatments; winning feeds inserted sport/date/search controls.

After: one synchronous destination layout/scroll change bridged by a fixed copy of the supplied artwork animated with transforms. Open 400ms, return 300ms; small opacity/translation reveals. Cancellation handles reversals and removes transient artwork. History, Escape, keyboard, reduced motion and integration hooks remain. Homepage artwork height matches the bill to within 0.5px in tested widths, then grows. Expanded mobile artwork is full content width and the secondary poster is 88% wide. Desktop intro is larger; mobile explanatory text is 16px and source/VIP copy 18px. Public headings/body/actions use bounded fluid type, centered marketing structure, deliberate insets and existing brand surfaces. Long reading content remains left aligned.

Mobile header is a compact opaque 64px row with logo, Join/Back, menu and Discord. Instagram/X remain available in the menu. The menu has a subtle translucent surface, 18px background blur, a solid fallback, reduced-transparency support and scrollable overflow for short screens. Floating offer/image surfaces and the arbitrage strip also receive restrained blur; supplied artwork and brand cards remain solid. No animated blur or layout-changing glass effects were added.

Both winning feeds retain verified wins, source metadata, last verified sync, Show more wins and the historical estimate qualification; sport/date/search controls are removed. Container corners are 28px.

## Affected files

- membership-scene.js and membership-scene.css: shared artwork transition and geometry.
- view-continuity.css (new): public styling, responsive type/header/menu/glass and tracker corners.
- results.js: no filter form; incremental rendering of all verified wins.
- index.html, join.html, membership.html; 23 visitor/member public pages including guides: final stylesheet integration, interior class and winning-feed version updates.
- scripts/prepare-public-site.mjs: explicit whitelist addition for view-continuity.css.
- AGENTS.md: append latest approved behavior and rejected mobile header direction.

Checkout: /Users/z/.codex/worktrees/homepage-release-1010/Kobe's Betting Hub. Base: 9b169c2dc2662e9bd4a40034f9e67ef1abd2f278, verified against origin/main. Primary workspace AGENTS.md also receives the new guidance. Unrelated exit-referral audit edit and untracked preview image are excluded from this release. No backend/billing/access/data rules were changed.

## Verification

Visible agent browser used throughout. Rendered 320px, 390px and 1440px layouts, including actual directory rows, verified winning picks, mobile menu and membership states. Initial guide disclosure icon fit defects and a mobile menu translateX conflict were found and corrected.

- 23 routes × 3 widths: 69 rendered states, no horizontal page overflow, header top 0 and no text Range escaping checked controls/summaries. Compact header independently checked across 46 mobile states.
- Nine earlier repeated round trips and quick reversal: no leftover animation layers; measured frame intervals below 25ms (maximum 18.6ms).
- Final round trip at each width: maximum 17.7ms; zero measured intervals above 25ms; no leftover card/bill layers or horizontal overflow. At 320px artwork/bill heights 114.37/114.46px; 390px 143.80/143.92px; desktop 487.76/488.16px.
- Mobile open artwork/poster widths: 272/239.36px at 320; 342/300.95px at 390. Desktop expanded artwork 980px versus 430px secondary poster.
- Directory search AlgoPicks returns one row. Annual toggle updates price and actual checkout offer together. Included disclosure, header Back, browser Forward and Escape exercised. Menu Instagram/X reachable.
- Tracker initial 30 verified wins, Show more increases to 60; no filter form; actual last verified sync visible. Loading and populated feeds inspected.
- Relevant public/Cloudflare suite: 297 tests, 286 passed, 0 failed, 11 existing retired skips. Syntax and diff checks pass. Whitelisted production build: 88 entries.
- Overbroad bot/pipeline suite had 11 unrelated failures. The same 11 reproduce on unchanged HEAD in the Telegram reader/writeup archive tests. No bot code changed or shipped.

Evidence: /Users/z/Documents/ChatGPT/Kobe's Betting Hub/outputs/audit-2026-10-10/view-continuity. Includes motion-final.json, fluid-glass-final-fit.json, mobile-header-final-checks.json, populated screenshots and earlier inspection history. Test logs: /tmp/kbh-public-continuity-final-tests.log and /tmp/kbh-continuity-baseline-tests.log.

Limits: frame-callback intervals characterize this browser session, not every physical phone, GPU or network; no universal zero-drop guarantee. Physical iPhone Safari and OS reduced-transparency setting were not exercised. Reduced-motion/transparency guards inspected. No paid transaction, email submission or new Discord authorization required or performed for this visual release. Preview controls remain local-only.

## Release

Local verification complete. Publication and live validation recorded below after release.

### Published follow-up

Public-only Cloudflare deployment completed October 10, 2026. Version: `4275ae56-a98a-44ee-bb34-a60fcedd2758`. 30 changed static assets uploaded; worker/backend integrations preserved. The explicit build whitelist contained 88 entries.

Live browser confirmed the compact header at top 0, full-content-width expanded artwork wider than the term poster, completed Join/Back with no remaining transient layers, glass menu within padded bounds with Instagram/X available, and populated tracker with 30 verified wins, last verified sync, 28px corners and zero filters/overflow. Production smoke: checkout health, publisher health, current Free Pick API, Free Pick page and client asset all pass.

Production origin had a saved 75% browser zoom; live mobile geometry was inspected at approximately 391 CSS px (293 physical viewport px). Exact 320/390/1440 checks were performed on the local origin at 100% zoom. Final 69-state audit was rerun with fresh loads of the final stylesheet version; all pass.
