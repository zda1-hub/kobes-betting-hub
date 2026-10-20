# Educational and risk-information SEO preview — October 20, 2026

Request: improve site SEO using https://x.com/asaio87/status/2112436451530994125 as reference. Read the complete post through authenticated browser UI. It recommends researching query intent, matching useful formats, relevant links, and iterative Search Console review. External advice was treated as reference, not publication authorization.

Base: origin/main 4da105a, branch codex/education-seo-20261020, existing attached education-navigation worktree. Prior untracked preview artifacts preserved.

Changes: responsible-gambling.html receives a descriptive warning-signs/limits/support title and WebPage plus BreadcrumbList JSON-LD matching existing content. guides/index.html receives Home/Learning hub BreadcrumbList alongside existing CollectionPage markup. sitemap.xml updates only those pages' lastmod values to the actual change date. No promotional targeting, backlinks, memberships, offers, pick content, backend, or delivery changes.

Before: responsible-gambling title was generic and no JSON-LD existed; learning hub had no breadcrumb schema. After: clearer title and explicit page hierarchy metadata. Both source bodies remain byte-for-byte identical to their pre-edit versions. Existing description/canonical tags remain intact.

Verification: public whitelist build passed (98 entries); source and built JSON-LD parse; built pages each contain one canonical; local HTTP 200 for both pages; sitemap XML parses. Browser review page rendered at http://127.0.0.1:4184/seo-review.html; screenshot /tmp/kbh-seo-review-20261020.png. Review page is a generated local-only artifact excluded from the public build whitelist. No layout changes, so mobile layout rework was unnecessary.

References: https://developers.google.com/search/docs/appearance/structured-data/breadcrumb and https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap . Structured data can help describe hierarchy but does not promise rich results or ranking gains. No current Search Console performance evidence, competitive ranking positions, or 50-query research completed in this pass. This is a bounded technical metadata improvement, not a full search-intent campaign.

Status: LOCAL ONLY. No commit, PR, production deployment, recrawl submission, external outreach, or scheduled work performed. Awaiting user review before publication.

## Approved publication follow-up

User approved making the previewed change. PR #258 merged as dbe64de. Cloudflare version ea2dab10-3ca7-45a3-b393-a9d70fc98b5f deployed only three changed assets. Fresh no-cache public requests verified the support-page title/WebPage markup, learning-hub breadcrumbs, and sitemap date; JSON-LD parsed. Live browser confirmed the new document title and existing support content. The 50-query, competitor, backlink, and Search Console work remains unperformed; this deployment is not represented as evidence of ranking improvement.
