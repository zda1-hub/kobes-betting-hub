# Tracked writeup win rate — local implementation, October 25, 2026

Request: replace the fixed 65% website claim with the real winning percentage for writeup-channel plays, excluding expert picks. User clarified that this means writeup-channel plays, including curated writeups, rather than only analysis personally authored by Kobe. No claim of personal authorship is introduced.

## Before and after

The homepage, Recent Wins and recaps pages displayed a static historical 65% estimate. The live publisher snapshot mixed expert and other published picks and contained no writeup-only record. A read-only October 25 API check confirmed that absence. Its overall count is not a valid substitute for this new scope.

Local changes replace the fixed claim with a shared component showing wins divided by wins plus losses, decided sample size, pushes, voids, pending, tracking dates and last sync in MST. An unavailable, invalid, stale or empty record never falls back to 65%, the overall rate, the last 50 entries or selected wins. The homepage letter's separate 70/65/59 historical estimates are also replaced with the same tracked-record explanation. The wins-only carousel is preserved.

## Evidence and scope

- The bot uses the existing Kobe-approved publication eligibility and canonical verified wager pipeline. No new grading or paid scan is triggered.
- New `bot/lib/writeup-record.js` scopes publications by configured writeup-channel IDs. `PUBLIC_WRITEUP_CHANNEL_IDS` can specify exact IDs; otherwise dedicated writeup channels and configured sport-writeup destinations are used. Expert/free-pick/hockey-pick destinations are excluded. Before release, verify the current production channel names and IDs; do not trust an old deleted channel configuration.
- Deduplication preserves channel provenance from repeated publications. Identical wager terms on the same operating date count once even if attribution differs. Conflicting grades stay pending. Different prices/stakes/markets remain distinct according to the existing canonical wager identity.
- Pushes, voids and unresolved/unverified grades do not enter the denominator. All tracked scoped history is used, not the public recent limit or wins feed. No retrospective odds filtering is added.
- `cloudflare/bettinghub-publisher.js` validates and retains only count/date/scope fields, rejecting malformed or out-of-overall-bounds counts; channel IDs and any supplied percentage are discarded. Old snapshots remain compatible with an unavailable scoped record.
- `bot/index.js` supplies the scope and republishes saved results hourly as a heartbeat even when no grade changes. It reads stored evidence only and does not grade or call AI. The browser rejects snapshots older than 48 hours.
- The UI labels this a **tracked** record. It is not a claim that every historical Discord writeup has been reconstructed or graded. Missing historical publications/approvals and ungraded games must be audited separately before describing coverage as complete. Win rate alone is not profitability.

## Files

Backend: `bot/lib/writeup-record.js`, `bot/lib/public-results.js`, `bot/lib/public-result-rows.js`, `bot/index.js`, `cloudflare/bettinghub-publisher.js`, `.env.example`.

Website: `writeup-record.js`, `writeup-record.css`, `index.html`, `results.html`, `recaps.html`, `home-results.js`, `results.js`, `scripts/prepare-public-site.mjs`. The record and gallery reuse one results request. Existing integrations and approved visual identity remain intact. Scoped important font sizes counter the existing global important body-font rule without changing global styling.

Tests: `bot/lib/writeup-record.test.js`, `scripts/writeup-record.test.mjs`, publisher tests, and the updated bento regression assertions. The isolated bento build now copies the previously added AI-readable build helper.

## Verification

- 74 targeted tests pass across public rows, writeup aggregation, presentation, publisher normalization, wins gallery, bento/build/SEO and AI-readable routes. Syntax checks and diff whitespace checks pass.
- Local browser fixtures visibly marked **SIMULATED DATA — layout test only** exercise settled, zero-decided and missing scoped records. Sample 12 wins/8 losses produces 60.0%; that is a test value, not actual KBH performance.
- Populated homepage checked at 320, 390 and 1440 CSS pixels. No page overflow; stat stays within its card; header top is 0. Actual desktop/mobile screenshots saved under `/tmp/kbh-writeup-record-{320,390,1440}.png`.
- Fixtures are in `outputs/writeup-record-review-20261025/` and excluded from the explicit public build whitelist. Preview server runs locally at port 4187. No real pick or account message was sent.

## Release status and remaining work

**Local only, not pushed or deployed.** The live bot and publisher do not yet provide this field. Actual writeup-only percentage has not been established from the production ledger in this turn.

After preview approval, verify exact production writeup-channel scope and historical coverage, deploy the compatible publisher first, then the bot sync, inspect the resulting real scoped counts/dates, and release the website only after those checks. Do not substitute the all-picks percentage if the scoped record is missing. Prior AI-readable-site work in this worktree remains a separate unreleased change and must be accounted for in any release.

## Customer-facing review

1. Buyer, rate heading: identify writeup scope instead of generic service success. Evidence: configured publication destinations.
2. Skeptic, counts: display both losses and sample size. Evidence: canonical settled W/L rows.
3. Skeptic, supporting line: retain pushes/voids/pending and dates. Evidence: exact scoped counts plus generated timestamp.
4. Visitor, unavailable state: say unavailable instead of recycling an estimate. Evidence: missing/stale/invalid snapshot tests.
5. Competitor/buyer, proof context: preserve actual public highlights and avoid fabricated complete-record or profitability claims. Evidence: unchanged wins-only rendering tests and explicit tracked-history limitation.

No conversion outcome, rank gain or new revenue is inferred from the change.

## Authorized release follow-up — October 25

User explicitly requested production publication with real data. Release prepared in a separate worktree from current origin/main 2a6b357; excludes the AI-readable Worker, build helper, metadata and all simulated fixtures. Read-only Render/Discord checks verified the football, MLB and basketball destinations are actual writeup channels; the separate expert-picks channel is excluded. An explicit PUBLIC_WRITEUP_CHANNEL_IDS scope pins those verified three destinations. The hidden Local preview paragraph is removed from refer.html; existing live eligibility and onboarding behavior remain intact.

The Render service is the existing kobes-betting-hub background worker in the previously confirmed My Workspace. CLI SSH was unavailable; scoped configuration was verified through the authenticated Render API and channel names through Discord reads without printing secrets. Production release order remains publisher, bot, real snapshot verification, then public website.
