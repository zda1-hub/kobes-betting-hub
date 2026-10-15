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
