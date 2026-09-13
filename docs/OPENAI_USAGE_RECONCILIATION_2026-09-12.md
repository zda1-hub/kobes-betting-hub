# OpenAI Usage Reconciliation — 2026-09-12

**Recorded:** 2026-09-12 19:18 MST  
**Owner:** Zakai Martin  
**Status:** Billing-attributed and contained; code-level cause remains an evidence-supported diagnosis because durable per-call auditing began after the incident.

## Credential control

- OpenAI organization Admin key name: `Kobe Betting Hub Usage Reconciliation final`
- Non-secret active Admin key ID: `key_Y50uH3VCo3mzNJM5`
- Permission: read-only
- Created: 2026-09-12
- Expiration: 2026-12-11; rotate no later than 2026-12-10
- Rotation owner: Zakai Martin; backup owner is still unassigned
- Storage: encrypted GitHub Actions repository secret `OPENAI_ADMIN_KEY`; the production `DATABASE_URL` is a separate encrypted Actions secret
- The credential value is intentionally absent from Git, Supabase, this document, terminal output, and application audit records.
- The long-lived Render bot no longer has the Admin credential. Render environment removal was verified and cleanup deployment `dep-daj22t3m8hqs73elspv0` reached Live.
- Revoked/inactive IDs: original `key_jtBdyNxNSPYbeNCZ`, first exposed replacement `key_06qVlp80Cm0NUp9Z`, and second exposed replacement `key_toaVGldRCO1HXxOT`. The final key was transferred without reading its value into accessibility/tool output.

Emergency rotation procedure: revoke the Admin key in the OpenAI organization dashboard, remove the Render secret, inspect OpenAI/audit-ledger activity for misuse, create a replacement with read-only permission and a finite expiry, install it only in the reconciliation runtime, run a read-only verification, and record only the non-secret key name/ID and timestamps.

## Provider import

The production command `OPENAI_USAGE_LOOKBACK_HOURS=48 node scripts/sync-openai-usage.mjs` completed successfully and returned:

```json
{"ok":true,"usage_rows":14,"cost_rows":3,"lookback_hours":48}
```

The first sync imported OpenAI organization Usage data into `provider_usage_snapshots`, grouped hourly by project, API key, and model. It separately imported organization Costs data grouped daily by project. The two provider requests returned HTTP 200 and were recorded in `api_call_events` with endpoint class, outcome, latency, and provider request ID. Follow-up read-only project/key attribution calls used the same audited HTTP wrapper.

The hardened sync now requires the expected production project and API-key IDs, verifies that key through an audited preflight, sends both identifiers as Usage/Costs filters, groups new cost snapshots by project and API key, rejects any mismatched or missing scope, fetches both datasets before writing either, and uses one operation ID for the complete reconciliation. Migration `005_relabel_unscoped_openai_cost_snapshots.sql` preserves the three initial project-only cost rows while relabeling them as `openai_costs_api_unscoped`; it does not delete or rewrite their payloads.

Production verification at 19:38 MST used commit `2d73527`, Render deployment `dep-daj0ogu7bikc73abcsdg`, and reconciliation operation `85814110-ae15-4ba9-8c7b-f62973360df1`. The guarded re-run returned 14 usage rows and three cost rows. Supabase contains the three preserved unscoped historical cost rows, three new rows scoped to `key_TDES2zUP3W9UZaej`, and 14 keyed usage rows. The preflight, Usage, and Costs calls all returned HTTP 200, were marked `SUCCEEDED`, and carry the same operation ID and commit. Across the complete 48-hour keyed usage window, the 14 current snapshots contain 3,611 model requests; the incident interval remains the 3,046-request subset documented below.

Isolated-run acceptance at 21:02 MST used GitHub Actions run `34736914218` from commit `d02dd4e`. It returned `usage_rows: 14`, `cost_rows: 3`, and operation `39eb92c5-f391-47c5-ba4a-93b7f1bcf805`. A direct Supabase query verified three rows for that operation: the expected project-key preflight, `/organization/costs`, and `/organization/usage/completions`; each returned HTTP 200 with outcome `SUCCEEDED` and a provider request ID. GitHub reported a Node 20 deprecation warning for the Actions toolchain; the import itself succeeded.

## Incident attribution

| Dimension | Provider result |
|---|---|
| Project | `Default project` (`proj_8DxPJSInvFUVEZgs8KMld4rz`) |
| API key | `Kobe Pick Monitor` (`key_TDES2zUP3W9UZaej`) |
| Model | `gpt-5-mini-2025-08-07` |
| Arizona interval | 2026-09-12 10:00–16:00 MST |
| Requests | 3,046 |
| Input tokens | 5,519,913 |
| Cached input tokens | 1,650,176 |
| Output tokens | 7,085,809 |
| UTC September 12 project cost | $16.10030665 |

The first cost import grouped by UTC day and project. The complete Usage import found no other project, key, or model in the incident interval, so the account-dashboard request spike is fully attributable to the Kobe Pick Monitor key. Hardened future cost imports are additionally filtered and grouped by API key. A separate one-request Luna smoke test occurred at 18:00 MST, after the UTC day boundary.

## Hourly evidence

| Arizona hour | Requests | Input | Cached input | Output |
|---|---:|---:|---:|---:|
| 10:00 | 123 | 677,904 | 107,392 | 293,287 |
| 11:00 | 240 | 441,675 | 123,008 | 567,884 |
| 12:00 | 1,143 | 1,811,098 | 694,016 | 2,640,670 |
| 13:00 | 854 | 1,427,260 | 327,040 | 1,963,116 |
| 14:00 | 629 | 1,059,722 | 323,072 | 1,476,853 |
| 15:00 | 57 | 102,254 | 75,648 | 143,999 |
| **Total** | **3,046** | **5,519,913** | **1,650,176** | **7,085,809** |

## Separate Luna proof

At 18:00 Arizona, the approved no-Discord smoke test made one `gpt-5.6-luna` request through the same `Kobe Pick Monitor` key. Provider usage reported 1,846 input tokens and 554 output tokens. The internal extraction ledger estimated $0.001034; the provider's UTC September 13 project bucket currently reports $0.00112615.

## Causal assessment and containment

Provider data proves the service identity, model, timing, volume, token usage, and project cost. It cannot retroactively reveal individual source posts or retries because Supabase per-call auditing was deployed afterward.

The strongest repository-supported diagnosis is repeated candidate rediscovery caused by frequent Render restarts while collector cursor/dedupe state lived in the ephemeral checkout. At incident commit `f7711bb`:

- missing state triggered paginated catch-up for all 38 sources from Pacific midnight;
- each worker start immediately began a collection pass;
- state was saved only after all source workers and the serialized commit chain completed, so a restart during a scan lost the pass;
- every media post passed the broad deterministic prefilter and reached model extraction before sport/event rejection;
- the configured candidate cap was checked while committing accepted packets, after model calls had already occurred;
- the OpenAI code issued one plain request with no retry/backoff loop, so retries are not a supported primary cause;
- up to four images were sent at high detail and no `max_output_tokens` was set.

Git history contains 19 commits during the documented 10:00–15:00 Arizona monitoring window and 21 pushes for the day. Two changes deliberately revisited held/media posts. Not every closely spaced commit necessarily completed deployment, so the precise call-per-restart count cannot be reconstructed. The behavior above explains the amplification but remains an inference rather than a per-request reconstruction.

Containment now live:

- cursor/dedupe state is on Render's persistent `/var/data` disk;
- extraction uses `gpt-5.6-luna` with bounded output and no reasoning;
- successful identical extractions can be reused from Supabase;
- pre-call stops enforce 50 requests/day, 500/month, $1/day, and $15/month;
- a concurrency-safe per-run reservation permits at most two new OpenAI calls per collection pass; overflow is audited as deferred and remains eligible next interval;
- monitored-source publishing remains disabled;
- model and explicit provider API calls are written to the durable audit ledger.

## Remaining acceptance test

Observe one normal production monitoring window and reconcile the provider Usage import to `extraction_runs` and `api_call_events`. Acceptance requires no unexplained model requests, correct cutoff/audit events, durable state across a controlled restart, and no unauthorized Discord or X publication.
