# Google Analytics activation — October 8, 2026

## Request

Create the Google Analytics account and web stream for kobesbettinghub.com, connect the existing consent-aware adapter, and verify it without changing the public design or checkout flow. The user explicitly approved acceptance of Google's Analytics Terms of Service at the account-creation step.

## Affected files and settings

- `.github/workflows/deploy-pages.yml` passes the repository's `KBH_GA4_ID` variable into the existing public-site build.
- `analytics-integrations.js` grants Google advertising storage only when a Google Ads ID is configured; Analytics alone uses analytics storage after visitor consent.
- `privacy.html` identifies Google Analytics and links to Google's data-use explanation.
- Google Analytics account and property: Kobe's Betting Hub; reporting time zone Phoenix; USD; optional account data-sharing settings off. Web stream: `https://kobesbettinghub.com`, measurement ID `G-264TY91ZCT`, enhanced measurement off to avoid duplicate events from the site's own tracker.
- GitHub repository variable `KBH_GA4_ID` set to `G-264TY91ZCT` for repeatable Pages builds. Cloudflare static-asset builds require the same environment variable when preparing the public whitelist.

## Before and after

Before: The site had a consent-aware GA4 adapter but no measurement ID, so it sent no data to Google Analytics.

After: The production build contains the stream ID; the adapter loads Google Analytics only after a visitor allows optional tracking. The existing first-party funnel remains the source of site-side events, and Google receives no typed form contents through this adapter.

## Verification and limitations

- Confirmed the newly created web stream and its measurement ID in Google Analytics.
- Built the public whitelist with `KBH_GA4_ID=G-264TY91ZCT` and found the ID in the homepage, join page, and privacy page outputs.
- Targeted public-site test run: 14 passed, 2 failed on pre-existing assertions for outdated extensionless routes and a `results.html` link; these are unrelated to the GA4 activation and were not altered.
- Pending release and live browser verification will be appended below. Google Analytics reports may take time to populate; production purchase attribution is not proven by this configuration alone.

State: local, pending publication.

## Publication follow-up

The implementation merged to GitHub main as PR #190 at `98622b25d8871fff90e288a1ab9ad772678d5575`. The Cloudflare public-site Worker was rebuilt from that revision with `KBH_GA4_ID=G-264TY91ZCT` and deployed as version `ff8438f3-8a0c-4c20-89a4-dd5377e26e82`. Live fetches of the homepage, privacy page, and analytics adapter confirmed the measurement ID, disclosure, and Google advertising-storage restriction. A consented live browser visit loaded the Google tag. Google Analytics initially displayed no received data; realtime/report arrival remains to be confirmed after processing. State: published, collection verification pending.
