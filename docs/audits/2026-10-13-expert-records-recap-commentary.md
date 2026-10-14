# Expert records and recap commentary — October 13, 2026

Requested: alphabetical expert names with the previous MST day verified record next to each name; allow existing authorized Kobe recap review to edit narrative commentary.

## Local implementation

- The VIP Discord list lives in `bot/lib/vip-expert-list.js`; the public 120-source directory is `exclusives.html`/`exclusives.js`. The initial search missed the public directory because it uses capper terminology; that finding is corrected here.
- Alphabetical sorting is enforced at rendering. Each name now displays previous MST day verified W/L and explicit pending/push/void counts. No-data experts show “no verified results,” rather than an invented 0-0. Records use published rows from the actual expert-picks channel only and reuse existing per-wager deduplication and conflicting-grade holds. Managed list parsing strips the record suffix so refreshes do not turn annotations into names.
- `bot/index.js` supplies the official pick log and the previous America/Phoenix calendar day. Existing operating-date values are preserved; this change does not migrate grading dates.
- Existing private recap editor now accepts up to 2,000 characters of multiline commentary instead of a 500-character note. The commentary is editable as a whole; generated published wager terms and verified outcomes remain locked. Existing reviewer ID/channel restrictions, source digest checks, stale-card rejection and final approval remain in force. No permission/access changes.

## Verification and limits

Focused expert-list, recap-approval and capper-record tests pass (23 tests). Coverage includes duplicates, conflicting grades, unexpanded groups, unverified results, no-data labeling, alphabetical round-trip parsing, MST/Pacific midnight boundary, long narrative commentary, over-limit rejection, authorized reviewer enforcement and approval preserving original wager terms/results.

Read-only live results API check returned HTTP 200, generatedAt 2026-10-13T23:51:45.328Z, 683 verified wins and 50 recent entries. No results-backend repair is justified by this evidence; missing homepage tracker requires rendered page investigation by the parent task.

Only local bot/backend changes; no bot restart, Discord message changes or public deployment performed. Rendered Discord controls and production bot behavior remain unverified until deployment. Existing unrelated audit/output edits preserved.


## Public directory follow-up

`exclusives.js` now alphabetizes/re-numbers all 120 existing rows while preserving prices and manual rail controls/search. A compact verified previous-day count is added to the name; name search excludes the appended record. `lineup-bento.css` uses the existing card geometry with a small wrapping record line. A status identifies the exact MST date and excluded outcomes. Missing snapshot fields/service failure show unavailable, not inferred 0-0.

`bot/lib/public-results.js` adds only counts/source names to `expertRecords`; production supplies the exact expert-picks channel ID. Other channels are excluded. The complete previous-day published ledger is used, not the last fifty settled picks. Existing duplicate/conflicting-grade and multi-wager holds apply. `cloudflare/bettinghub-publisher.js` strictly validates and preserves this count-only field, discarding extra fields. Both publisher and bot need rollout plus snapshot refresh before this data appears live. Current frontend handles older snapshots.

Public focused tests cover counts-only data, excluded channels, repeated/conflicting/unexpanded wagers, strict publisher validation, alphabetical search and unchanged rail controls. Prior MST date tests include winter Pacific/MST boundary. Rendered public directory review remains the parent task's integration step. No deployments performed.

Recap edit semantics: the entire editable commentary is replaced on save, then appended to the immutable generated record/plays. This expands narrative space to 2,000 characters without granting permission to rewrite wager terms or results. If full generated recap rewording is intended, an additional explicit structured prose model is necessary; current changes preserve verified outcomes.
