# Search-intent improvements: arbitrage and betting Discord guides

Requested: research competing search results, improve the two target pages, deploy if verified. The user also supplied BowTiedBills' SEO copy article as reference.

## Research and decisions

Reviewed October 22, 2026:
- https://discord-rankings.com/best-sports-betting-discord — directory/comparison format with immediately visible comparison criteria. Its activity rankings are not verified betting performance.
- https://sportspicksdiscord.com/best/best-sports-betting-discord/ — service tables and concrete access/price details. Affiliate rankings and claimed win rates are not independent outcome evidence.
- https://www.sportingnews.com/us/betting/news/arbitrage-betting-explained-how-find-arbs-guarantee-profit/1c5553d157345d6ffd18a91b — definition, jump navigation and examples; we do not adopt its guaranteed-win wording.
- https://x.com/bowtiedbills/status/2113089153403408484 — read full article in authenticated browser. Applied focused intent, first-screen clarity, specific evidence, internal links, concise sections and one final next step. Local city pages and service-area tactics do not fit KBH. Claims of client ranking gains were not independently verified.

Search-provider result order is not a controlled Google rank measurement. This is a targeted review, not a new 50-query audit or evidence of ranking gains. The Discord guide remains an evaluation guide, not a fabricated competitor league table.

## Changed files and behavior

- guides/how-to-choose-a-sports-betting-discord.html: general-only advice now includes free/paid comparison, a shortlist method, a disclosed factual KBH example, full monthly renewal/trial conditions, explicit limits of selected public wins, relevant evidence links, section navigation, matching search metadata and breadcrumb structured data. Shortened redundant introductory copy; final next step is free server inspection.
- guides/sports-betting-arbitrage-explained.html: added normal-settlement and void-risk outcome table, payout/profit distinction, a non-arbitrage counterexample and explanation of missing draw/settlement outcomes. Linked related community evaluation guide and improved the search title/description. All numbers are hypothetical, not live odds.
- guides/reading.css: scoped comparison-table styling and labeled mobile rows. Initial 320px review rejected cramped three-column table; corrected before release.
- guides/index.html: updated descriptions for both guides and refreshed the shared stylesheet version.

Preserved canonical URLs, shared design, existing checkout/Discord/referral/email/attribution integrations and intentional utility noindex. No backend or billing changes. Current monthly terms verified against the latest membership-scene.js and FAQ.

## Verification before release

- 29 tests passed: public build and membership origin, SEO metadata rejection cases, educational exit-dialog suppression.
- SEO release guard passed for all 20 sitemap pages.
- Browser inspection at 320, 390 and 1440 pixels for both pages: no document horizontal overflow, no overflowing table cells or navigation labels, header top 0. Section links focus the heading/summary; arbitrage outcome disclosure opens.
- Screenshots inspected: /tmp/kbh-intent-{how-to-choose-a-sports-betting-discord,sports-betting-arbitrage-explained}-{320,390,1440}.png.
- Learning hub expanded Discord guide: table loaded and section IDs prefixed correctly; no page overflow or captured console errors.
- Arithmetic checked: 95.24 × 2.10 = 200.004; 200.00 − 190.48 = 9.52; a single 95.24 refund leaves −95.24 net; 2/(1+100/110) = approximately 1.047619.

## Release status

Local verified; publication and live checks pending below. Authority, earned mentions/links and a complete independently assessable record remain separate work. Top-three or number-one placement is a goal, not a verified result or guaranteed outcome.

## Published follow-up

PR #305 merged as bbf1b02. Built from the latest main, including the current X conversion tracking release; no stale backend deployment. Cloudflare production version a6358b91-635f-4abe-b4b4-051c6b4691bf uploaded only the four changed public assets (199 whitelisted build files total).

Live checks: all 20 sitemap pages fetched successfully and passed the same SEO metadata/JSON-LD guard; both target pages contained their new sections. Browser confirmed the production arbitrage disclosure opened and the Discord comparison/evidence sections were present, with header top 0 and no horizontal page overflow. Live screenshots: /tmp/kbh-intent-arbitrage-live.png and /tmp/kbh-intent-discord-live.png. Responsive tests at 320/390/1440 were performed on the local production-source preview; live confirmation used the normal desktop browser viewport. No current ranking improvement is asserted and no repeated same-day indexing requests were submitted.
