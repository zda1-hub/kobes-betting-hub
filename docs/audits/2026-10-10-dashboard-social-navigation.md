# Dashboard social tracking visibility — October 10, 2026

Requested: keep Instagram/Meta, X and promotion tracking accessible on the private dashboard.

Before: live dashboard hid source/campaign data under Growth, posting status under Publishing, and tagged-link creation under Tools. Owner session loaded successfully. Live October 10 status showed X posted at 9:52 AM and Instagram Story posted at 9:55 AM. Sources/campaigns loaded; no platform-labeled measured traffic appeared for Today. Earlier October 8 tracking audit confirms ad spend/ROAS were not connected. Meta purchase event code is present; test coverage passes, but actual Events Manager delivery was not checked in this pass.

Change: explicit navigation labels Instagram / Meta / X traffic, Instagram & X posts, and Tracked links & referrals. Social traffic links jump directly to the existing source table; posting report title names the platforms. Existing date filters, source/campaign tables, publishing data and campaign builder remain. Added initial hash disclosure opening after data loads so direct report links work. Corrected builder report-location copy. No backend, attribution schema, pixel configuration or billing changes.

Files: admin-analytics.html, admin-analytics.js, scripts/admin-date-filters.test.mjs.

Validation: 42 targeted navigation/date-filter/attribution/Meta-purchase/public-build tests passed. Populated local fictional fixture reviewed at CSS 320, 390 and 1440; no page/control horizontal overflow. Publishing and social-report navigation exercised. Private live status and source reports inspected before changes.

Status: local pending public deployment and live verification. Fixture/evidence in outputs/dashboard-social-navigation, excluded from public build. Existing unrelated audit edits preserved.

Published follow-up: Cloudflare version ee7877cd-cd63-4c2f-8213-4be7c7230069 uploaded only admin-analytics.html and admin-analytics.js from the latest GitHub base c65bc22, with the explicit 88-entry public build whitelist. Live deep link #social-tracking opened the parent report after authenticated data loaded. Live Instagram/X report confirmed current-day posted statuses; live X link builder generated utm_source=x and was restored to Instagram. Live navigation text Range fits all padded buttons at CSS 320; no horizontal overflow at CSS 320 and 391 (75% production browser zoom). Email-subscriber service counts remain unavailable in the existing response; no email delivery claim made. Meta purchase code tests pass, but Meta Events Manager delivery/ad-account spend/impressions were not verified.

Final live desktop check: CSS 1440, no page overflow and all navigation text Range bounds fit; no console errors. Live captures: outputs/dashboard-social-navigation/live-320.png, live-391.png, live-1440.png. Temporary viewport reset.
