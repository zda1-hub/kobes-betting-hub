# October 8, 2026 — full-funnel tracking audit

Requested: Keep the site's visual design and checkout intact while tracking meaningful acquisition, CTA, form, and paid-member conversion steps; expose actionable reports.

Affected files: `analytics.js`, `consent.js`, `analytics-integrations.js`, `meta-pixel.js`, `free-pick.js`, `email-signup.js`, `welcome.js`, `privacy.html`, `admin-analytics.html`, `admin-analytics.js`, `cloudflare/kobes-checkout-worker.js`, its tests, `scripts/prepare-public-site.mjs`, and this tracking documentation.

Before: Session/page/engagement and server-confirmed paid events existed, but named CTA/form events did not appear in the main dashboard. Optional browser tracking had no preference control. Google tags were not configured.

After: Visitor choice controls optional tracking; stable CTA and form IDs appear in the private dashboard by page and campaign; successful email signup is separate from attempts; original/latest attribution retains more campaign fields without raw URL queries. Existing Stripe-verified paid events remain the only payment truth source. Google tag loading is prepared but disabled without real IDs.

Verification: See tests, public build, and live smoke checks recorded in the release follow-up below.

Unresolved: Google account/container IDs and conversion labels are missing; Meta CAPI token and validated webhook consent path are missing; advertising spend data is not connected. No booking flow exists. These are not reported as live integrations or results.

Release state: local implementation; append publish verification below after deployment.

Local verification: 93 focused tests passed (`cloudflare/kobes-checkout-worker.test.mjs`, `scripts/attribution.test.mjs`, `scripts/meta-purchase-tracking.test.mjs`, `scripts/prepare-public-site.test.mjs`, `scripts/tracking-consent.test.mjs`); 26 adjacent checkout/dashboard/smoke tests passed. The production public bundle was built successfully. Checked that marketing pages have one consent and analytics adapter each, private portal pages have neither, the Meta noscript bypass is absent, Google IDs are empty, and `git diff --check` is clean.
