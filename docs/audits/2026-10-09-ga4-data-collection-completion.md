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

## Tag Assistant follow-up

- Google Tag Assistant connected to the public homepage and found `G-264TY91ZCT`, but its Hits Sent view reported no hits. This narrowed the remaining issue from tag installation to page-view delivery.
- `analytics-integrations.js`: use the Google tag's default `page_view` on its single GA4 config call after consent. `analytics.js`: remove the separate manual GA4 page-view call to avoid duplicates. `scripts/prepare-public-site.mjs`: refresh both public script cache keys. The first-party funnel event remains unchanged.
- The implementation follows Google's documented default behavior for a `gtag('config', measurementId)` call. Verify the new release in Tag Assistant and GA4 Realtime; if the connected tag still shows no hit, inspect consent and network delivery before marking collection complete.

## Consent bootstrap follow-up

- After the standard page-view release, Tag Assistant still found the tag but showed no hits and “Consent not configured.” GA4's web stream continued to show no data received in 48 hours; the Internal Traffic filter was in Testing state rather than Active.
- `analytics-integrations.js` now declares the canonical global `gtag()` function and queues its native `arguments` object on `dataLayer`; `scripts/prepare-public-site.mjs` refreshes the cache key. This replaces the prior private rest-parameter arrow function. The existing deny-by-default and explicit opt-in remain.

## Verified release

- PR #201 merged as `acfdc40`. The explicit public build used `KBH_GA4_ID=G-264TY91ZCT` and deployed Cloudflare Worker version `67c765b4-f932-4dcb-8815-d2c1f553ac1f`.
- On the live custom domain, Google Tag Assistant connected to `G-264TY91ZCT`, recorded Consent Default and Consent Update, and listed a Page View hit plus two `section_view` hits.
- GA4 Realtime for property `a411393679p558205832` then displayed one active user, one page view, and `page_view`, `session_start`, and `section_view` events. This confirms current web data collection. Historical data from before the fix is not recovered.
- The Analytics setup checklist may update later. Google Ads linking and audiences are separate setup steps and were not changed. The visual design, checkout, and first-party dashboard remain unchanged. State: published and verified.
