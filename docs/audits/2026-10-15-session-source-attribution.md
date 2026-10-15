# Repair session source reporting — October 15, 2026

The user reported lost Facebook/Instagram attribution after website changes and requested repair while marketing work continues. Historical dashboard snapshots are saved in the primary workspace under `deliverables/marketing/first20-launch-2026-10-15/historical-dashboard-snapshots.json`.

## Before and after

Reproduced a regression introduced October 8 in commit 35648f0: browser lifetime first touch was reused as acquisition for every new 30-minute session. A visitor arriving directly, then returning later with `utm_source=fb`, was grouped as Direct. The repair preserves lifetime attribution and adds separate session source, medium, campaign, content and term fields. Traffic and interaction reporting now use session acquisition; member lifetime first-touch details remain separate.

A click-ID-only `fbclid` arrival becomes Meta / unknown social, never automatically paid advertising. Historical recovery uses only recognized explicit UTMs saved in the session first touch when the old source was Direct or Other. No database rewrite, invented events or last-touch inference.

## Scope and limitations

Consent-only tracking began October 8; page-view counting changed October 13. Earlier and later counts are not strictly comparable. Zero attributed visits alone do not prove ads stopped. Unconsented or missing historical arrivals cannot be reconstructed. Meta ad clicks remain unavailable through the dashboard API. No billing, access, referral or public design changes.

Affected files: analytics.js, checkout worker and focused tests, public build analytics cache version, dashboard explanatory copy and this audit.

## Verification

134 focused tests passed across attribution, consent, dashboard dates and campaign links, membership checkout, checkout worker and public build. `git diff --check` passed. Production build prepared through the existing whitelist. Backend pre-release version: cd110ca4-6dff-4d7a-91c2-87939b1bb264. Existing rate limiter, publisher service and bindings were checked; deploy with --keep-vars.

Release evidence will be appended after deployment.

## Published verification

Published commit 4fea0a5 to GitHub main. Backend version bc20ba37-0411-44ac-9225-11945a0884d5; public site version dd39fd6b-a8b6-47ad-bf27-d255a8b924a8. Backend health returned the new version and first20 remained open/ready at $5 then $32.99, limit 20. Fresh production homepage loads analytics cache key 20261015-session-source and preserves approved backdrop asset 20261015-approved1. Public analytics asset was downloaded and compared byte-for-byte to the tested source. Authenticated dashboard refreshed successfully with the new session-acquisition explanation. Existing historical totals stayed 670 sessions / 1,016 page views; no synthetic live events were created. Evidence is saved in primary marketing launch evidence folder.

Arc Meta inspection found account 1681308602427606 has one off campaign ending April 15, 2025, two lifetime link clicks at $1.51 each, and no reported recent delivery for October 14–15. Account 470451029047804 contains one off draft test with no reported results, including Maximum dates. Neither explains the earlier website campaign tags. Actual recent ad account link is requested; no campaigns, budgets, permissions or drafts were changed.
