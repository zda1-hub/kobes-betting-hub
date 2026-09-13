# Pick operations architecture and audit

Verified against the repository and Render on 2026-09-12. This document separates
code/configuration from observed production state; neither is proof that a
specific pick was correct, approved, published, graded, or emailed.

## Verified production state

- GitHub `main` and the live Render worker were both at commit `f7711bb` when
  checked. Render showed that commit as the last successful deployment.
- Render runs one Node background worker named `kobes-betting-hub` with a 1 GB
  disk mounted at `/var/data`; `PICK_LOG_PATH` is `/var/data/pick-log.csv`.
- The actual Render environment used `gpt-5-mini`, enabled enrichment and X
  monitoring, and configured a 10:00–15:00 Arizona daily window.
- The base monitor interval was 300000 ms (five minutes), but the configured
  changeover applies 900000 ms (15 minutes) on and after 2026-09-12. The
  effective cadence therefore matches the requested 15 minutes.
- No `DATABASE_URL` existed in Render. CSV/JSON on the mounted disk was the
  production persistence layer, not Postgres.
- Render logs showed collection, split-card and held-card activity. Logs also
  showed three published-log rows waiting on grading. Those logs prove workflow
  activity only; they do not prove card correctness or public delivery.

## Intended approval-first flow

```text
38 enabled public X sources
  -> deterministic candidate filter
  -> OpenAI Responses source-only extraction
  -> sport/source/event/format gates
  -> one Discord approval card per regular pick
  -> Kobe approve/reject button
  -> allowlisted public Discord channel
  -> canonical publication record
  -> grading attempts
  -> recap email to Kobe for review
```

OpenAI receives source post text and up to four high-detail source images. It
extracts visible terms and claims into strict JSON. It does not research odds or
facts, grade results, choose a destination, or authorize publication.

## P0 database audit implementation

Migration `pipeline/migrations/001_pick_operations_audit.sql` creates:

- `source_posts`
- `extraction_runs`
- `pick_candidates`
- `workflow_events`
- `approval_cards`
- `published_picks`
- `grades`
- `recap_runs`

The application records source posts, model request/response identifiers,
prompt and commit versions, returned usage, image count and image-token detail
when the provider supplies it, latency, raw structured output, controlled gate
reasons, approval actions, exact payload hashes, publication attempts/results,
grading attempts, and recap-email attempts.

Cost values are explicitly estimates derived from returned usage and versioned
per-million-token rates. They are not provider invoice totals. Do not backfill a
made-up image-token number when OpenAI does not return one.

Identical source inputs reuse a prior successful extraction with the same model,
prompt version and input hash when Postgres is enabled, preventing duplicate
model billing on retries.

## Supabase/Render cutover runbook

Do not deploy the audit-required code until the following are complete:

1. Use the existing free Supabase project; migrations `001` and `002` were applied successfully on 2026-09-12.
2. Add the Supabase IPv4 session-pooler URL as Render's `DATABASE_URL` secret.
3. Run `npm run migrate:audit` as a Render one-off job and verify all audit and membership tables exist.
4. Deploy with `AUDIT_DATABASE_REQUIRED=false`; observe one controlled monitor
   cycle and reconcile database rows to Render logs and Discord test cards.
5. Set `AUDIT_DATABASE_REQUIRED=true` and redeploy. From that point, missing or
   unavailable Postgres blocks new extraction/card/publication work instead of
   silently operating without an audit ledger.
6. After the changeover is established, simplify the environment by setting
   `X_MONITOR_INTERVAL_MS=900000` and removing the redundant interval
   changeover variables.

The existing CSV and JSON files remain compatibility mirrors during cutover.
Postgres becomes the operating audit source of truth only after step 5.

## Remaining P1/P2 work

- Strengthen deterministic image prefiltering before vision calls and select
  only the most likely pick image for the first attempt.
- Add golden approval-card fixtures and a dead-letter queue for ambiguous or
  failed candidates.
- Build the internal dashboard and alerting around the implemented admin-only
  `/pick-audit` timeline, add reconciliation, and run a 100-post model benchmark
  before changing providers.
