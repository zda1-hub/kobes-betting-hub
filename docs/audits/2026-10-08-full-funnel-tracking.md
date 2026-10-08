# October 8, 2026 — full-funnel tracking audit

Requested: Keep the site's visual design and checkout intact while tracking meaningful acquisition, CTA, form, and paid-member conversion steps; expose actionable reports.

Affected files: `analytics.js`, `consent.js`, `analytics-integrations.js`, `meta-pixel.js`, `free-pick.js`, `email-signup.js`, `welcome.js`, `privacy.html`, `admin-analytics.html`, `admin-analytics.js`, `cloudflare/kobes-checkout-worker.js`, its tests, `scripts/prepare-public-site.mjs`, and this tracking documentation.

Before: Session/page/engagement and server-confirmed paid events existed, but named CTA/form events did not appear in the main dashboard. Optional browser tracking had no preference control. Google tags were not configured.

After: Visitor choice controls optional tracking; stable CTA and form IDs appear in the private dashboard by page and campaign; successful email signup is separate from attempts; original/latest attribution retains more campaign fields without raw URL queries. Existing Stripe-verified paid events remain the only payment truth source. Google tag loading is prepared but disabled without real IDs.

Verification: See tests, public build, and live smoke checks recorded in the release follow-up below.

Unresolved: Google account/container IDs and conversion labels are missing; Meta CAPI token and validated webhook consent path are missing; advertising spend data is not connected. No booking flow exists. These are not reported as live integrations or results.

Release state: local implementation; append publish verification below after deployment.

Local verification: 93 focused tests passed (`cloudflare/kobes-checkout-worker.test.mjs`, `scripts/attribution.test.mjs`, `scripts/meta-purchase-tracking.test.mjs`, `scripts/prepare-public-site.test.mjs`, `scripts/tracking-consent.test.mjs`); 26 adjacent checkout/dashboard/smoke tests passed. The production public bundle was built successfully. Checked that marketing pages have one consent and analytics adapter each, private portal pages have neither, the Meta noscript bypass is absent, Google IDs are empty, and `git diff --check` is clean.

## Reporting correction after live verification
The first production release was merged as PR #185 (`35648f0c3a328310ad09052588bcd1de194a3303`). The checkout Worker deployed as `fd557051-6d5a-46b4-a574-43c3a5544c57`; the site Worker deployed as `e7b702cb-8c0f-4509-8c18-dccd65739db4`. The live homepage and `/join` loaded with the tracking-choice interface, and `/admin/analytics` contained the new CTA report section. Direct unauthenticated HTTP smoke requests were blocked by this host/browser environment, so no valid synthetic event was written to production.

A review then found that verified payments from visitors who decline optional tracking could distort visitor-to-paid percentages or appear as direct traffic. This follow-up limits the visitor funnel to measured sessions, retains all Stripe-verified payments in the payment total, and labels purchases without a session as unattributed. `cloudflare/kobes-checkout-worker.js`, `admin-analytics.html`, and `admin-analytics.js` changed. The visual site design and checkout behavior remain unchanged. 75 Worker/dashboard tests passed. State: local follow-up pending publish.

## Final publication
The reporting correction merged as [PR #186](https://github.com/zda1-hub/kobes-betting-hub/pull/186) at `ac82889fae742e13ca6176415790856ab4711d20`. Checkout Worker version `e8513db8-e8b8-47eb-b63e-e196fa8f239b` and public site Worker version `916d2ddd-539c-46e5-9a1c-435e7e9da0c5` were deployed from that exact main revision. The live `/admin/analytics` page contains the measured-funnel heading and new CTA report node; the live homepage and `/join` previously showed the tracking choice and preserved the original membership design and prices. No valid synthetic event or purchase was sent to production. State: published. GA4/GTM/Google Ads and Meta CAPI activation remain pending the documented IDs/credentials and verification.
