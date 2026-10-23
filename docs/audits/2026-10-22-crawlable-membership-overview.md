# Crawlable membership overview and arbitrage clarification

Requested: research competing arbitrage and betting Discord pages, implement worthwhile durable improvements, deploy if verified, then check indexing.

## Research and scope

Searches reviewed October 22, 2026: sports betting arbitrage explained; best sports betting Discord free paid. Reviewed the current TheRundown arbitrage article (https://therundown.io/blog/arbitrage-betting), and refreshed discovery of Discord Rankings, Hive Index and other comparison pages. These are search-provider observations, not controlled Google ranking positions or verified competitor performance. Existing guide comparison content already addresses access, records and renewal; this pass does not rewrite it again or invent a best-server ranking.

Google's primary documentation (https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics) explains crawling/rendering and recommends server/pre-rendered content for users and crawlers. The /join response previously contained only a noscript fallback inside main; the substantive sales information required JavaScript. This release addresses that concrete gap.

Stable intent ownership: /join answers KBH membership and access questions; the Discord guide compares free and paid communities; the arbitrage guide explains the concept, examples and execution limits. Preserve these URLs rather than creating overlapping thin pages or repeatedly cycling titles without search evidence.

## Changes

- join.html: permanent factual HTML overview below the existing membership scene, one visible H1, free versus VIP scope, access steps, evidence limitations and descriptive links to the comparison/arbitrage guides. No new checkout offers or changed prices. Overview follows the existing sales-section visibility contract on post-checkout arrivals.
- membership-scene.js: generates H2 when the static page already supplies H1; retains H1 on existing homepage/other routes. Focus targets its stable heading ID instead of assuming H1. Browser verification caught and corrected the old tag-dependent focus lookup before release.
- membership-scene.css: scoped readable overview styles using the existing cream surface, dark type and blue links; no global design changes.
- guides/sports-betting-arbitrage-explained.html: original explanation of why the +110/+110 example has a 4.76 percentage-point implied-probability gap but a 5% theoretical return. No live odds or additional wagering tool.
- sitemap.xml: /join lastmod reflects this substantive update.
- scripts/check-public-seo.mjs and its tests: initial-content heading check excludes script/style/noscript/template text, but accepts inline formatting. Prevents the former noscript-only heading from passing as substantive initial content.
- scripts/bento-release.test.mjs: isolated build fixture now copies the SEO helper imported by the build script.

## Verification

- 35 focused tests passed: SEO positive/negative cases, public build and membership origin, billing/access terms, educational-page exit behavior.
- Two additional relevant isolated-build tests passed: shared navigation/assets and checkout/configuration/post-payment hooks.
- The broader bento suite has two failures outside this change: review markup count and a carousel animation fixture. index.html, proof.html and home-results.js are unchanged from origin/main. Those checks are not claimed fixed or passing.
- Built all 20 sitemap pages with the enhanced SEO guard successfully.
- Browser at 320/390/1440: one rendered H1 on each changed page, header top 0, no document horizontal overflow. Math anchor opens the correct chapter; white heading/body remain readable on the blue surface. Annual toggle shows $194.99 and updates the checkout offer to annual at all three widths. No transactions were initiated.
- Fresh membership load after the focus repair: active element membership-heading; no captured console errors.
- Inspected populated screenshots /tmp/kbh-crawlable-join-{320,390,1440}.png, /tmp/kbh-crawlable-guides-sports-betting-arbitrage-explained-{320,390,1440}.png and /tmp/kbh-crawlable-math-detail-320.png.

## Status and limits

Local verification complete; release/live checks follow below. Private Search Console observations stay in a local report, outside the public GitHub change. This improves content delivery and explanation; no ranking increase is asserted. Further content changes should follow measured gaps, inaccuracies or broken behavior rather than cosmetic churn. Earned authority and independent outcome evidence cannot be manufactured through page edits.
