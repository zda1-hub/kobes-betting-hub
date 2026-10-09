# GA4 data collection completion — October 9, 2026

## Request

The owner asked to complete the Google Analytics setup steps shown in the email. The existing GA4 property and web stream use measurement ID `G-264TY91ZCT`.

## Change

- Restored `KBH_GA4_ID=G-264TY91ZCT` when building the explicit public whitelist after the prior site release omitted that build variable. The live HTML had lost the measurement ID; the rebuilt live homepage again contains it. Cloudflare Worker version: `5b7703de-3f2e-409d-bc34-e142a87da7ac`.
- `analytics.js` and `scripts/prepare-public-site.mjs`: the initial GA4 `page_view` now waits for analytics consent if necessary and sends once when the visitor opts in. The public script reference gets a new cache key. Before, a visitor who accepted after loading the page had no initial GA4 page view.
- Visual design and checkout are unchanged. Collection remains consent-aware. No Google Ads account is connected by this change.

## Verification and state

- The rebuilt site from current `origin/main` included the GA4 ID on the homepage, join page, and privacy page; the custom domain returned the ID after deployment.
- `node --check` passed for both changed JavaScript files; the explicit public build prepared 84 entries with the ID on homepage, join, and privacy; the homepage has the new analytics script cache key; `git diff --check` passed. GA4 Realtime collection is to be checked with an opted-in browser visit after publication.
- State: ID restoration published; consent timing fix local pending release.

## Publication follow-up

- PR #198 merged as `b28783c`. Cloudflare public site Worker version `2447d673-c3dd-422f-a5a3-857afeeebf48` was rebuilt from that merged revision with `KBH_GA4_ID=G-264TY91ZCT` and deployed. The public build included the new analytics script URL and measurement ID on all checked pages.
- In a live browser, the privacy page's “Allow tracking” choice was selected and the homepage was visited. GA4 Realtime still displayed zero active users immediately afterward. That UI result does not confirm a received event; allow for reporting delay or investigate browser/network blocking before calling data collection verified.
- Google Ads linking and audiences were not changed because no Ads account or audience criteria were supplied. State: site code published; Google-side receipt still unverified.
