# Audit check triage — October 10, 2026 MST

Request: fix actual failures; explicitly retire obsolete checks so they do not repeatedly report false problems.
Base: GitHub main c63fd6c; release checkout. Unrelated audit and output changes preserved.

## Published fixes
- free-pick.js: removed retired October 23 timer; regular monthly terms displayed after unlock. free-pick.html cache version updated.
- proof.html: “Full ledger” → “Recent wins,” accurately describing the intentionally wins-only destination. Current proof rail still shows wins/losses.
- Public build used scripts/prepare-public-site.mjs explicit whitelist. Only three changed public assets uploaded; checkout, referral and publisher workers untouched.
- Site Worker published version b127ba6a-933d-497e-b1b1-ad5f7c990334. Browser confirms new label; screenshot outputs/audit-2026-10-10/proof-label-fixed.png in primary workspace.

## Check classifications
- FIXED ASSERTION: production smoke recognizes the publisher base plus /free-pick/current path; actual endpoint and page checks still execute.
- UPDATED REQUIREMENT: billing-disclosure checks current $32.99 monthly, starter, six-month and annual plans rather than retired $19.99 membership option.
- UPDATED REQUIREMENT: directory checks current factual disclosure wording, retaining 120-row/source-price/search verification.
- UPDATED IMPLEMENTATION: routing checks centralized approval-routing delegation and expert-picks destination configuration rather than retired inline ternary.
- RETIRED / SKIPPED WITH REASON: 11 pre-Figma homepage, old benefits/trial, old stylesheet/header, and former directory homepage-placement assertions. Explicit Node test skip reasons mean these are not reported as failures. Retired does not mean passed.
- ACTIVE: current-public-contract checks shared navigation/legal styling, real gallery asset presence/viewer and accurate results link. Authenticated portal test remains active. Consent, checkout, referral and publisher tests remain active.
- ENVIRONMENT ONLY: pg/discord dependencies needed for local operations test imports. Rerun using isolated installed dependencies; no production bug implied by missing local modules.

## Verification
294 selected cloudflare/scripts tests: 283 pass, zero fail, 11 explicitly retired. Local dependencies via NODE_PATH=/tmp/kbh-audit-dependencies-20261010/node_modules. This is not the full bot/pipeline suite.
Production smoke: checkout health, publisher health, current free-pick API, page and client asset all pass.
No production pick statistics rewritten; no billing/access changes.

## Open real issues — do not relabel as false positives
- Sport classifications in published result data: confirmed wrong, source correction pending. Do not repeatedly rediscover the same examples; retest when source/data changes.
- Stripe starter and longer-plan descriptions: conflicting trial/connect wording, product-description correction pending; displayed prices verified. Do not change billing rules to fix wording.
- Unlinked accounts: requires transaction/account classification; not a confirmed website defect. Do not revoke access or assume paid/complimentary.
- Financial lifecycle: prior payment success reported by user; fresh VIP, cancellation, renewal and payout evidence not collected. UNVERIFIED, not FAILED. Retest on relevant changes or available evidence, not by repeatedly charging user.
