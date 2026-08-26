# Manual-First Content Operations

## Purpose and boundary

This is the source of truth for taking a proposed pick from intake through review,
publication, grading, and the daily recap. It is intentionally manual and uses
these local files plus publishing destinations the owner already controls.

Do **not** enter, scrape, monitor, copy from, or automate access to partner Discord
communities. A pick learned through a partner community may enter this process only
when an authorized human supplies it outside that community and confirms reuse and
credit requirements. Never store credentials, private messages, member data, or
restricted source content here.

## Roles

Assign names before launch. One person may hold several roles, but every pick must
name its approver.

| Role | Responsibility |
| --- | --- |
| Submitter | Enters the pick and source/permission details. |
| Reviewer | Checks event, market, line, odds, timing, duplication, source rights, and copy. |
| Approver | Makes the final decision on the exact publish terms. |
| Publisher | Posts only the approved version and records where/when. |
| Grader | Verifies the result and calculates units from published odds. |
| Closeout owner | Reconciles the release summary, log, results, and recap. |

## Files and source of truth

- `trackers/pick-intake.csv`: working queue and approval audit trail.
- `trackers/pick-log.csv`: canonical record of published picks and results. Never
  silently edit the originally published terms.
- `templates/pick-intake-form.md`: convenient hand-entry form.
- `templates/pick-post-template.md`: member-facing individual post.
- `templates/daily-release-summary-template.md`: today's official releases.
- `templates/daily-recap-template.md`: member-facing results and internal closeout.

Use the same stable Pick ID everywhere: `YYYYMMDD-SPORT-###`, based on the local
operating date (example: `20260813-NFL-001`). Do not reuse an ID after rejection or
voiding. Use ISO dates, 24-hour time, and an explicit timezone such as
`America/Phoenix`.

## Status workflow

`DRAFT -> SUBMITTED -> IN_REVIEW -> APPROVED -> PUBLISHED -> GRADED`

Exception states are `NEEDS_INFO`, `REJECTED`, `WITHDRAWN`, `VOID`, and
`CORRECTION_REQUIRED`.

- Only the reviewer moves a pick into `IN_REVIEW` or `NEEDS_INFO`.
- Only the named approver moves a pick to `APPROVED` or `REJECTED`.
- Approval applies to the exact event, market, selection, line, odds, units, copy,
  and destinations reviewed. Any material change returns it to `IN_REVIEW`.
- The publisher marks `PUBLISHED` only after capturing actual post time and link or
  destination reference.
- The grader marks `GRADED` only after recording evidence and unit math.
- Never delete a row to hide a mistake. Preserve it and explain the change in notes.

## 1. Intake

The submitter creates the Pick ID and completes every required intake field:

- event identity and scheduled start with timezone;
- sport/league, market, selection, line, odds, and sportsbook/line reference;
- proposed risk units and short rationale;
- source name/type, permission status, and exact credit language when applicable;
- intended destinations and submitter/time.

If reuse permission is `UNKNOWN`, `DENIED`, or undocumented, set `NEEDS_INFO` and
do not publish. Check for an existing pick on the same event/market/selection.

## 2. Review and approval

The reviewer checks the proposed member-facing post:

1. Confirm teams/players, event date, start time, and market rules.
2. Confirm the line and odds are current; note when and where captured.
3. Confirm units follow the staking policy; never imply a guarantee.
4. Check for duplicate or contradictory releases needing explanation.
5. Confirm reuse permission and attribution. No partner Discord access is part of
   this check.
6. Check copy for accuracy, responsible tone, and required credit.
7. Confirm a relevant player/team GIF or image is attached after the confidence score, its source and reuse permission are recorded, and it shows current/relevant context.
8. Record reviewer, timestamp, and notes, then route to the approver.

The approver records their name, timestamp, decision, and exact approved post copy.
Verbal or chat approval must be transcribed into the queue before publishing.

## 3. Publish and log

Immediately before posting, compare the final post to the approved fields. If the
market moved, pause and return it for re-approval. After a successful post:

1. Record destination, actual publish time, and post URL/reference in intake.
2. Confirm the approved GIF/image rendered after the confidence score.
3. Set intake status to `PUBLISHED`.
4. The publishing bot appends one row to `pick-log.csv`, copying the published
   terms exactly, including Pick ID, destination, actual Discord post link, line,
   odds, and units risked. A post is not considered official unless it has this
   row.
5. Add the Pick ID to the day's release summary. The summary never introduces an
   unapproved pick.

Official-pick rule: a release in any approved free or paid Discord sport channel
must go through Kobe Bot's publish path. A direct/manual channel post is not an
official record until it is backfilled into `pick-log.csv` with its exact Discord
link, terms, and approval history; do this before any recap is generated.

For a posting error, do not overwrite history. Set `CORRECTION_REQUIRED`, record the
original post, correction details/time, and corrected post reference. Notify the
same audience clearly.

## 4. Daily release summary

Start the summary from its template and list every published Pick ID. Reconcile it
to the canonical log. Show the cutoff time/timezone and distinguish official picks
from commentary. Use `No official releases today` when there are none. A second
person checks ID count, lines, odds, and units before release.

## 5. Grade and recap

Grade the exact published line, not the closing line. Use `W`, `L`, `P`, or `V`;
leave unfinished events `PENDING`. Record the verification source and time using
`/grade-pick`. Never grade from a social post alone when an official game/result
source is available.

For American odds with units risked:

- Positive odds: win = `units risked * odds / 100`.
- Negative odds: win = `units risked * 100 / abs(odds)`.
- Loss = `-units risked`; push/void = `0`.

If the team's convention is units-to-win, document it and replace these formulas
before launch. Do not mix conventions.

`/preview-recap` and `/publish-recap` read only `pick-log.csv` for the specified
Pacific operating date. They include every logged official pick across all approved
Discord sport channels and the free-pick channel, with exact published line/odds,
units risked, W/L/P/V/PENDING, per-pick net units, Discord post link, and result
verification source. They calculate the record and overall net units from those
same rows; no manual result list may be substituted.

At closeout, compare every approved destination channel to `pick-log.csv`, account
for every Pick ID, verify results and calculations, then publish the recap. Pending
results remain visible and roll forward. Late corrections receive a timestamped
note in the next recap and in the log.

### Canonical-log hosting requirement

For production, `PICK_LOG_PATH` must point to durable storage (for example a
Render persistent disk mounted at `/var/data/pick-log.csv`). The repository copy
at `trackers/pick-log.csv` is the local-development canonical file and has the
same schema. Do not rely on a worker's temporary filesystem for the production
log; a redeploy can erase it.

## Daily cadence

| When | Owner | Action |
| --- | --- | --- |
| Start of day | Closeout owner | Create dated summary; review pending results. |
| As received | Submitter | Create intake row and supporting draft. |
| Before event | Reviewer + approver | Review and approve exact terms. |
| After approval | Publisher | Post, log, and update release summary. |
| Release cutoff | Publisher + checker | Reconcile and publish release summary. |
| After results | Grader | Verify, grade, and calculate units. |
| End of day | Closeout owner + checker | Reconcile log and publish recap. |

## Pilot and audit

Run the workflow for at least three operating days before treating it as final.
Track missing fields, approval turnaround, line changes, corrections, and recap
discrepancies. Archive each day's summary and recap. Weekly, sample at least five
Pick IDs end-to-end and confirm intake, approval, post, log, grade, and recap match.
