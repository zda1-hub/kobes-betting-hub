# Homepage and membership $5 promotion

Request: feature the existing $5 offer on the regular homepage and membership page for ad traffic, preserve aesthetics, support mobile/desktop and make reverting easy.

Base: 6c875ed. The primary workspace has stale unrelated files; implementation and release use the maintained worktree and latest GitHub main.

Changes: first20-feature.js adds a scoped orange/black/blue promotional banner below the existing header/ticker, a 20 MEMBERS ONLY label, and matching monthly badge/copy. membership.js uses the existing first20 checkout for ordinary arrivals during the approved window. Referral and checkout-return routes are excluded. The established card artwork, headers, page content and membership scene remain intact. No backend changes.

Offer: $5 first month then $32.99/month until canceled, no free trial; October 15 midnight MST through October 19 10 AM MST, maximum 20 coupon redemptions. This is an offer cap, not a count of remaining places or guaranteed unique buyers. Existing Stripe eligibility enforces the actual cap. UI checks availability on entry, focus and every minute while open; sold-out/ended restores regular monthly terms and hides the temporary banners. The server remains authoritative during status races.

Revert: change FEATURE_FIRST20 to false in first20-feature.js and redeploy the public whitelist. Existing regular copy is not replaced in HTML. Dedicated /join?deal=first20 remains independent. For exact source rollback, revert this feature commit rather than resetting unrelated files. The browser clock also hides the feature after the deadline; backend enforces the real window.

Affected files: first20-feature.js, membership.js, membership-scene.css, index.html, join.html, membership.html, scripts/prepare-public-site.mjs, scripts/first20-feature.test.mjs. Membership scene script code unchanged; URLs cache-versioned.

Verification: 38 focused offer/checkout/feature tests plus 4 public-build tests passed. Local regular homepage and /membership inspected at 320, 390 and 1440 CSS pixels: document widths matched viewport and header top was 0. Visible promotional controls stayed inside viewport. Local Join opened inline membership with actual first_month_back/first20 keys; local primary action confirmed preview-only and made no charge. Referral arrival excluded promotion. Saved rendered mobile/desktop evidence and geometry. Inspected settled opacity=1 membership state after initial animation. Baseline homepage retained for equal-width visual comparison. No typography/palette/artwork redesign. Browser runtime Statsig telemetry reports unrelated network failures; no application checkout exception observed.

Limits: no customer charge or live VIP grant. Public deployment and live verification to be appended below.
