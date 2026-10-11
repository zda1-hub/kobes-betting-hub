# Meta clicks and dashboard sessions — October 11, 2026

Requested: explain reported Meta clicks versus dashboard sessions and fix tracking clarity without replacing the approved dashboard design.

Before: “Measured visits” counted consented 30-minute browser sessions. Meta ad totals were not imported. Meta/meta_ads UTMs were categorized as other. The campaign builder lacked a Meta option.

After: label the metric “Tracked site sessions”; explain consent, repeat clicks and differing dates/metrics; provide an Ads Manager link. Support explicit Meta UTM aliases on client/server and recover legacy source categorization only where a preserved explicit UTM identifies Meta. Add Meta ads to the existing link builder with utm_medium=paid_social. Unknown sources and generic paid_social remain unknown; no inferred or invented visits. Long unavailable metric text uses a compact readable status style.

Files: admin-analytics.html/.css/.js; analytics.js; cloudflare/kobes-checkout-worker.js and tests; scripts/admin-campaign-links.test.mjs; scripts/attribution.test.mjs; scripts/prepare-public-site.mjs.

Verification: 104 relevant attribution/consent/dashboard/worker tests passed; four public-build whitelist tests passed. Read-only populated local fixture reviewed at 320×820, 390×844 and 1280×900. Document width matched viewport at each size. Meta campaign link generated correct source/medium/campaign/content; mobile Ads Manager action contained its label and symmetric padding. Corrected an unavailable-label wrap seen in mobile review. Console errors absent. Screenshots saved locally in docs/audits/evidence/2026-10-11-meta-clicks/. Fixture sources illustrate classification, not live Meta totals.

Limits: actual production showed three tracked sessions for Today MST. User-reported 16 Meta clicks still needs exact Ads Manager metric/date range/destination. No evidence yet establishes which clicks failed to become sessions. Meta ad counts are not connected through API. Consent remains required, existing date filters/integrations remain intact.

Release status: local verified; publication receipts to be appended after deployment.

## Publication and live verification

Code commit 01e2a92 pushed to origin/main from latest 089e72e base. Checkout worker production version 4251fc3e-871f-4d09-a7a8-b89863a56269; public-site version 17d7e385-a66e-413f-8c7a-4f37accc9597. Public build used the explicit whitelist; creator contact files/local fixture/evidence were not published. Unrelated workspace changes were left untouched.

Signed-in live dashboard refreshed at 1:25 PM MST: “Tracked site sessions” displays three, traffic explanation and Ads Manager action render, Meta option generates https://kobesbettinghub.com/join?utm_source=meta&utm_medium=paid_social&utm_campaign=membership_launch. Existing untagged/unknown sessions remain other/direct; no fabricated historical Meta traffic. Browser console errors absent. Production screenshot retained locally. No checkout, payout, invitation or email action executed by this repair.
