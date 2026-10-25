# SEO discovery follow-up — October 24, 2026 MST

## Request and evidence

The owner asked to improve search visibility using the SEO research in the task titled “Kobe’s Betting Hub - Discord Changes” and linked an X post about Brave URL submission. The prior research is in a separate education-navigation worktree under `docs/seo/`; it is reference material, not a new site release or evidence of ranking gains.

The public sitemap and robots file load successfully. The production SEO check passes for all 20 sitemap pages. The existing public guides already include descriptive metadata, crawlable text, matching canonicals, internal links, and source/scope disclosures. The October 22 Search Console review recorded `/join` and the Discord comparison guide as indexed by Google at that time. This does not establish that Google has crawled the latest version.

## Change

Affected public file: `sitemap.xml`. Its homepage `<lastmod>` previously said October 17 despite the substantive October 24 dated write-up addition. Its `/refer` `<lastmod>` previously said October 13 despite the October 24 free-member referral changes. Both now say October 24. Other dates were left alone because this audit did not establish a later substantive update for those pages. `scripts/search-indexing.test.mjs` had an obsolete expected-page list that omitted the already published responsible-gambling and two statistics pages; that list now matches the public sitemap.

Brave Search visibly returned the homepage for `site:kobesbettinghub.com` on October 24. Its submission UI displayed “Success Thank you for your submission” for `https://kobesbettinghub.com/join` and `https://kobesbettinghub.com/guides/how-to-choose-a-sports-betting-discord`. These are accepted submission requests, not evidence that either URL is indexed, ranked, cited by Claude, or producing visitors. No other URL was submitted.

## Verification and limits

Run `node scripts/prepare-public-site.mjs`, `node scripts/check-public-seo.mjs`, and `node --test scripts/search-indexing.test.mjs`; record the results before release. The sitemap has no visual or checkout changes. This audit is local until the branch is merged and the deployed sitemap is checked. Search traffic and membership impact remain unknown. Do not refresh every `<lastmod>` or resubmit unchanged URLs merely to simulate freshness.
