# Kobe's Betting Hub — Project Control File

**Status:** Active production system with unresolved operational and compliance risks

**Last verified:** 2026-09-12 18:53 MST

**Production runtime change set:** repository/Render `main` at `e68d368`; Checkout Worker `4b66c8f4-d5b0-4b7b-888e-f85584423f9a`; Publisher Worker `b0a60493-82c6-429a-b74d-7a4d8e24f9f9`; public-site Worker `d5d3cd32-182e-4e6c-aa7d-968c81af1b28`

**Control-file owner:** Zakai Martin

**Business/content approver:** Kobe

**Technical owner:** Zakai Martin

**Billing/support owner:** Zakai Martin

**Final production approver:** Zakai Martin

This is the authoritative project brain for humans and coding agents. Read this file before changing the project. Update it whenever production state, ownership, architecture, costs, risks, or priorities change. The other Markdown files contain detailed playbooks; when they conflict with this file, this file wins until the conflict is resolved.

The owners do not need to read every repository document. The operating chat should use this file to answer: what is live, what talks to what, what costs money, what failed, what is next, and which decisions require an owner.

## Executive state

Kobe's Betting Hub is a paid sports-pick membership centered on Discord. It also has a public website, Stripe checkout, Discord entitlement automation, a monitored X-source pick pipeline, human approval in Discord, result grading through ESPN, recap email queues, a public Free Pick page, and optional X publishing.

The system is not a single application. It currently spans GitHub, Cloudflare Workers/D1/KV, Render, Discord, Stripe, X, OpenAI, ESPN, Gmail Apps Script, and Supabase Postgres. Supabase is the shared membership and pick/API audit ledger. OpenAI provider reconciliation code is ready but requires an organization Admin API key; Apps Script and some SDK-internal calls still need equivalent records before the ledger is literally exhaustive.

### What is definitely live

- `https://kobesbettinghub.com` is served by the Cloudflare Worker `kobes-betting-hub` from a shared repository-generated static manifest. The same manifest is used by the GitHub Pages workflow so the two deployment paths cannot silently omit different files.
- Cloudflare's full cache was purged and the stale membership page was replaced. `cancel`, `cancel.html`, and `cancel.js` all return `200` on the custom domain.
- Membership checkout is enabled. Offers shown publicly are `$10 / 7 days` or `2 days free`, followed by `$32.99/month` until canceled.
- The checkout Cloudflare Worker is reachable and reports healthy. It now also runs a daily 09:15 Arizona Stripe-to-Supabase-to-Discord reconciliation and records success/failure membership events.
- Checkout hardening now prevents an existing Stripe membership or Discord identity from being silently relinked through a replayed completion URL, accepts valid Stripe signatures during secret rotation, reduces portal OAuth to `identify`, and writes exact Cloudflare Worker version IDs into API audit events.
- Stripe Checkout creates subscriptions. After payment/trial confirmation, the customer connects Discord through OAuth and receives the configured paid-member role.
- Stripe subscription create/update/delete webhooks maintain the Supabase membership state and reconcile Discord access. The Stripe webhook endpoint is active and subscribed to all four required event classes, including Checkout completion.
- A Render background worker runs the Discord bot and X collector from `f9b2141`, with a 1 GB persistent disk at `/var/data`.
- The production X collector is enabled for 38 configured sources. Its effective interval is 15 minutes during the configured daily Arizona window.
- The Render environment and repository are configured for `gpt-5.6-luna` with bounded output, no reasoning, versioned pricing metadata, and reusable audited extractions.
- The free Supabase project `kobe betting hub` is healthy. Migrations `001`–`004` are live, including `api_call_events` and `provider_usage_snapshots`; production verification found eight durable API events immediately after cutover. The Checkout Worker uses a dedicated server secret; Render uses the encrypted session-pooler connection with fail-closed audit enforcement.
- The publisher Cloudflare Worker reports ready, connected to X, and configured with free-tier KV Free Pick media storage. The custom-domain client now points to the correct Worker.
- Discord `#daily-free-play` contains canonical record `20260912-148-X` (Bijan Robinson over 29.5 receiving yards, -140). A dedicated website-publication credential is now encrypted independently in Render and Cloudflare. The owner-approved text-only synchronization returned `201`, the KV current endpoint returned `200`, and the live public page rendered the same Bijan selection. No Discord or X action occurred during this repair.
- A controlled manual audit checked one recent `@CappersUSA` X candidate through Luna with a one-candidate cap and `--no-discord`. It was held as `SOURCE_EXTRACTED`; no member or Discord publication occurred.
- Commit `f9b2141` is deployed on Render. It contains the exact Bijan production formatting regression fixture and formatter corrections for duplicated `YDs`/`Yards` terms, a repeated shorthand selection bullet, and the dangling URL-dependent clause.

Observed output-quality evidence: the 2026-09-12 Discord screenshot shows a published Bijan Robinson card with duplicated pick terms in the title/first bullet and an incomplete sentence ending in “including 82 yards at”. That exact case is now a passing regression fixture: future rendering collapses `YDs`/`Yards` duplicates, removes the repeated selection bullet, and trims the broken URL-dependent clause. A successful transport remains insufficient proof of a correct card.

### What is not production-ready even though parts are live

- The public Terms and Privacy pages still say they are drafts/not effective and describe a pre-checkout site with no payment or member account integration. That is factually inconsistent with the live product.
- No owner-supplied proof of legal entity, jurisdiction, official support/privacy contact, refund policy, or counsel approval exists in the repository.
- Membership persistence now uses Supabase for normalized customer/subscription state and signed webhook event idempotency. Stripe remains the payment and subscription source of truth; Discord role state is the derived entitlement.
- The Checkout Worker now authenticates returning members with Discord OAuth and then creates a Stripe Customer Portal session. Discord proves which linked member is acting; Stripe authenticates and performs billing, recurring subscription, invoices, payment-method changes, and cancellation.
- All 38 X sources are approved for monitoring only and are marked `PENDING_SOURCE_TERMS`; none is marked `CONFIRMED` for reuse/publication. `X_SOURCE_PUBLISHING_ENABLED=false` now enforces that owner decision in production.
- Render has a pooled `DATABASE_URL` and `AUDIT_DATABASE_REQUIRED=true`. The audit-aware worker completed database initialization, registered Discord commands, and logged in as Kobe Bot after deployment.
- Provider calls from the Node collector/bot and Checkout Worker are written to Supabase with endpoint class, payload hashes, outcome, latency, provider request ID where available, and workflow references. Apps Script and Discord SDK-internal traffic remain separate gaps.
- Marketing is intentionally a future workstream, not the current priority.

## System map

```text
Visitor
  └─> kobesbettinghub.com (Cloudflare static Worker built from the repository)
       ├─> Checkout Worker ─> Stripe Checkout / subscriptions
       │                     └─> Discord OAuth + paid-member role
       └─> Publisher Worker ─> current Free Pick from KV

38 approved-for-monitoring X accounts
  └─> Render X collector ─> X API
                           ├─> OpenAI Responses extraction
                           ├─> ESPN event validation
                           └─> private Discord approval card
                                └─> Kobe approves/rejects
                                     ├─> public Discord channel
                                     ├─> persistent CSV pick log
                                     ├─> Publisher Worker queue / KV / X
                                     └─> ESPN grading ─> recap queue ─> Gmail Apps Script ─> Kobe email

Kobe Trends email
  └─> Gmail Apps Script ─> Publisher D1 queue ─> Render bot
       └─> private Discord approval ─> approved Discord trends channel
```

## Components and sources of truth

| Area | Runtime / store | Repository entry points | Current source of truth | State |
|---|---|---|---|---|
| Public website | Cloudflare static Worker + GitHub mirror | root HTML/CSS/JS; `scripts/prepare-public-site.mjs` | shared generated manifest from `main` | Live |
| Checkout | Cloudflare Worker | `cloudflare/kobes-checkout-worker.js` | Stripe + Supabase | Secure Discord-authenticated portal and webhook persistence live |
| Payments | Stripe | called by Checkout Worker | Stripe subscription and invoice records | Live |
| Member access | Discord | Checkout Worker OAuth/role calls | Stripe status governs Discord role | Live with daily reconciliation; full test-identity lifecycle still required |
| Discord operations | Render Node worker | `bot/index.js`, `bot/commands.js` | Discord messages + Supabase workflow events + local logs | Live on `f9b2141` |
| X monitoring | Render Node worker | `pipeline/collect-x.js`, `data/twitter-sources.json` | source roster + persistent cursor | Live; cursor/dedupe root is on `/var/data` |
| Model extraction | OpenAI Responses API | `pipeline/enrich-pick.js` | response/request IDs + structured output | Luna + extraction audit live; next-window production evidence pending |
| Pick approval | private Discord channel | `bot/lib/source-review.js`, `bot/index.js` | Kobe button action | Live |
| Pick publication | Discord | `bot/index.js` | Discord message ID + audit event | Live |
| Pick log | Render persistent disk | `bot/lib/pick-log.js` | `/var/data/pick-log.csv` | Live, single-host CSV |
| Pick/member audit DB | Supabase Postgres | `pipeline/audit-store.js`, `pipeline/migrations/` | Supabase Postgres | Migrations `001`–`004` live; Worker and Render connected |
| Event/result verification | ESPN public APIs | `bot/lib/event-timing.js`, `bot/lib/espn-grading.js`, `bot/lib/espn-trends.js` | stored response snapshot/reference after audit cutover | Live, partial market coverage |
| Public Free Pick | Publisher Worker + KV | `cloudflare/bettinghub-publisher.js`, `free-pick.js` | KV `free-picks/current.json` | Live with canonical Bijan text-only item; dedicated cross-service credential verified by hash only |
| X publishing | Publisher Worker + D1 | `cloudflare/bettinghub-publisher.js` | D1 queue/delivery log + X post ID | Connected |
| Trends inbox | Gmail Apps Script + D1 + Render | `cloudflare/kobe-trends-inbox.gs`, publisher Worker, bot | D1 queue + approval packet | Configuration status needs verification |
| Recap email | Render + D1 + Gmail Apps Script | `bot/index.js`, Apps Script | CSV grades + D1 notification status | Live configuration reported; end-to-end proof needed |
| Support | static support page/manual action | `support.html`, `docs/ISSUE_PLAYBOOKS.md` | None established | Incomplete |
| Marketing | not yet defined | historical assets/docs only | None | Deferred |

## End-to-end business flows

### Membership

1. Visitor chooses an offer on `join.html`.
2. Browser posts the offer name to the Checkout Worker.
3. Worker creates a Stripe Checkout Session containing the monthly subscription and configured trial/starter line item.
4. Stripe returns the customer to `membership.html?checkout=success&session_id=...`; that session ID is accepted only for the one-time Discord link.
5. Customer explicitly connects Discord.
6. Worker verifies the Checkout Session and active/trialing subscription, completes Discord OAuth, joins the user to the server, grants the member role, and stores the Discord user ID in Stripe subscription metadata.
7. In the approved local replacement, signed Stripe webhooks write an idempotent event plus normalized customer/subscription state to Supabase and reconcile the Discord role.
8. Returning members authenticate with their linked Discord account and are redirected to Stripe Customer Portal for payment methods, invoices, and cancellation. Stripe remains the subscription authority.

Remaining controls after the production cutover: unmatched-account recovery, an external alert path for reconciliation/role failures, support tickets, refund implementation, a full test-identity lifecycle, and an approved public policy. Daily Stripe-to-Supabase-to-Discord reconciliation is deployed.

### Pick operations

1. During the daily window, Render polls each enabled X source.
2. Deterministic filters reject obvious non-picks before model spend where possible.
3. Qualifying text/images go to OpenAI for source-only structured extraction.
4. ESPN verifies supported sport/event timing and player/team alignment.
5. Incomplete, stale, unsupported, duplicate, and ambiguous candidates are held/rejected.
6. Valid regular multi-play posts are split into one approval card per play; terms-only exclusives remain grouped.
7. Kobe sees a private Discord card matching the intended public card and chooses free, paid, or reject.
8. Publication writes to the Discord destination and pick log; Free Pick publication may also sync to the public page and X.
9. ESPN attempts to grade supported exact-match markets. Unsupported/ambiguous cases remain pending.
10. Once all official picks are graded, a recap is queued for email to Kobe. Code does not auto-post that recap publicly.

Non-negotiable content rules already encoded:

- Kobe is the final source-pick approver.
- Approval cards must not expose source URLs or source-credit text to members.
- Regular picks require exact terms and at least three clean, relevant factual breakdown points.
- Player props require the player's full name; team/game markets may omit a player.
- Odds and units may be absent when the source does not state them.
- The system extracts source claims; it must not represent model output as independent verification.

## API and automation inventory

This table lists network/API paths found in the repository. “Audited” means a durable, queryable trail exists or is implemented locally; console logs alone do not qualify.

| Caller | Provider / path | Trigger | Cost or quota exposure | Current durable trail | Kill switch / limit |
|---|---|---|---|---|---|
| Browser | Checkout Worker `/create-checkout` | Join button | Cloudflare request; downstream Stripe | Cloudflare logs + downstream Supabase events | Disable checkout in code/Worker |
| Checkout Worker | Stripe `/v1/checkout/sessions` | New checkout | Stripe fees after payment | Supabase `api_call_events` + Stripe | Remove/disable prices or Worker route |
| Checkout Worker | Stripe session/subscription GET | Discord connect, membership management, daily reconciliation | Stripe API quota | Supabase `api_call_events` + Stripe | Disable routes/cron |
| Checkout Worker | Stripe subscription update | retention/cancel | Business revenue impact | Supabase `api_call_events` + Stripe | Disable retention/cancel routes |
| Stripe | Checkout Worker `/stripe-webhook` | subscription events | Cloudflare requests | Stripe delivery log only | Stripe webhook setting |
| Checkout Worker | Discord OAuth token/user/join/role/revoke | Member connects Discord or daily reconciliation | Discord rate limits | Supabase API + membership events | Remove Worker Discord credentials |
| Render collector | X user lookup | missing source cursor, notably after state loss | X API plan/quota | Supabase `api_call_events`; source ID in cursor | `X_MONITOR_ENABLED`, source `enabled` |
| Render collector | X user timeline | every source each collector pass; pagination on catch-up | Major X call-volume driver | Supabase `api_call_events` + source/candidate audit | daily window, interval, candidate cap |
| Render collector | ESPN NFL/NCAAF scoreboards | each collector pass | Public API availability | Supabase `api_call_events` | stop X monitor |
| Render collector | OpenAI `/v1/responses` | each candidate passing prefilter | Token-based spend | Extraction record + Supabase API event | daily/monthly request and dollar hard stops; model/monitor switches |
| Render collector | ESPN event scoreboards | candidate event validation | Public API availability | Gate outcome locally audited after DB cutover | stop X monitor |
| Render collector | Discord channel/message REST | label lookup and approval card send | Discord rate limits | Approval result locally audited after DB cutover | pause file / stop monitor |
| Discord bot | Discord Gateway/REST | always connected; commands/buttons/posts | Discord rate limits | message IDs partly logged | stop Render service / pause picks |
| Discord bot | ESPN scoreboards/summaries | grading, trends, event checks | Public API availability | grade attempt locally audited after DB cutover | `AUTO_GRADE_FREE_PICKS=false` |
| Discord bot | Publisher queue endpoints | Free Pick/X/daily pick/trends/recap | Cloudflare/D1/KV/X downstream | partial D1 state; pick DB locally implemented | feature-specific enabled vars |
| Publisher Worker | X media upload/post/token refresh | approved/scheduled X post | X API plan/quota | D1 logs text-post deliveries; Free Pick state in KV | disconnect X / remove queue secret |
| Browser | Publisher `/api/free-pick/current` | every Free Pick page load | Cloudflare KV reads | Cloudflare platform logs only | remove page integration |
| Gmail Apps Script | Publisher trends/recap queues | Gmail schedule | Google Apps Script quotas | D1 delivery status | disable Apps Script trigger |
| GitHub Actions | GitHub Pages deployment | every push to `main` | GitHub Actions quota; Render auto-deploy also restarts | GitHub run history | batch changes; pause auto-deploy |

### API request record required for every paid or operational call

Every call should eventually produce one immutable record with:

- UTC timestamp and environment (`production`, `staging`, `local`)
- internal `operation_id`, `workflow_id`, and `pick_id`/`member_id` where applicable
- service, endpoint class, method, and caller component
- trigger (`schedule`, `deploy_start`, `user_action`, `retry`, `webhook`)
- provider request ID (`x-request-id` or equivalent) and client request/idempotency key
- provider project/account identifier without secrets
- request and response payload hashes; redacted snapshots only where justified
- HTTP status, application outcome, error class, retry count, and latency
- model, prompt version, input/output/cached/image tokens where applicable
- estimated cost at the recorded pricing version
- provider-billed cost once reconciled
- deploy commit and runtime instance

Do not store bearer tokens, API keys, card data, OAuth access tokens, full webhook secrets, or unredacted private member content in the audit ledger.

## Call-volume incident: 3,046 OpenAI requests on September 12

### Evidence found

- The OpenAI Usage dashboard showed approximately **3,046 Responses and Chat Completions requests on 2026-09-12**.
- The screenshot was filtered to **All projects**, **All API keys**, and **Last 7 days**. It therefore does not yet prove all requests came from Kobe's Betting Hub.
- The same screenshot showed 6,121 requests, 38,006,461 input tokens, and $76.91 total spend over the selected seven-day period, plus September spend of $79.71 against a $100 budget. These are account-level observations pending export/reconciliation.
- There were **21 pushes to `main` on 2026-09-12**. Each push triggered both GitHub Pages deployment and Render auto-deployment/restart.
- Production monitors 38 X sources.
- The deployed collector stores `state.json` under the application checkout, not the Render persistent disk.
- On restart, a missing state makes every source a daily catch-up: typically at least one X username lookup and one timeline request per source, plus pagination.
- Rejected/handled posts are remembered only in that state. Approval packets are durable, but rejected candidates can be rediscovered and re-sent to OpenAI after restarts.
- A normal five-hour window at 15-minute cadence is roughly 21 passes. With 38 sources, timeline polling alone is roughly 798 requests before pagination, restarts, username resolution, ESPN calls, Discord calls, and model extraction.

### Working diagnosis

Frequent production deploys combined with non-durable collector state can materially amplify X and OpenAI usage. The screenshot's roughly 6,200 average input tokens per request is also consistent with expensive image-bearing or otherwise large requests, but model/API-key filters are needed before attributing it to this worker. This is a credible mechanism for the anomaly, not yet a billing-grade conclusion.

### Containment deployed

- Collector cursor/dedupe state now defaults beside the durable review queue.
- Render configuration now points `X_MONITORING_ROOT` to `/var/data/x-monitoring`.
- Routine weekly cleanup no longer deletes the spend-control cursor.
- The local Postgres audit implementation records OpenAI request ID, response ID, tokens, latency, prompt/model/pricing versions, status, error, payload hashes, and cost estimate.
- Identical successful source/model/prompt/input extractions can be reused instead of billed again once the audit database is active.
- Production hard stops are `50` OpenAI requests/day, `500`/month, `$1` estimated/day, and `$15` estimated/month. The pre-call guard stops before sending the next model request when any threshold is reached.
- Migration `004_api_call_ledger` is live and the ledger was verified with eight production ESPN calls immediately after cutover.
- `scripts/sync-openai-usage.mjs` can import hourly provider usage grouped by project/API key/model and daily cost grouped by project. It requires a separately authorized organization Admin API key.

The Checkout Worker, Supabase configuration, durable X cursor path, Luna extraction configuration, and Render audit-aware source are live. The next normal monitoring window must provide production ledger evidence before the incident is considered fully closed.

### Evidence needed to close the incident

1. Export OpenAI usage by API key/project/model/endpoint and hourly bucket, with timezone/date range.
2. Identify the production API key/project used by Render and compare it to the dashboard's project/key filters.
3. Reconcile usage against deploy timestamps, collector windows, source count, candidate count, and retries.
4. Separate request count from token spend and invoiced cost.
5. Record the root cause, affected period, actual cost, containment, and regression test in this file.

## Data, privacy, and security inventory

| Data | Location | Sensitivity | Retention / deletion state |
|---|---|---|---|
| Subscription/payment/customer data | Stripe | High | Governed by Stripe; local policy missing |
| Discord user ID on subscription | Stripe metadata | Personal identifier | Policy missing |
| Discord member/channel/message IDs | Discord, CSV, JSON, planned Postgres | Personal/operational | Policy missing |
| Source posts and images/URLs | X, JSON review packets, planned Postgres hashes/snapshots | Third-party content | Permission and retention policy missing |
| OpenAI prompts/outputs and usage | OpenAI, planned Postgres | Third-party content/operational | Provider retention settings and local policy need confirmation |
| Official pick history/results | CSV and planned Postgres | Business record | Preserve; correction policy exists |
| Free Pick image/current state | Cloudflare KV | Public/business | Cleanup/version policy missing |
| Queue and delivery records | Cloudflare D1 | Operational, possibly email content | Retention policy missing |
| Kobe recap/trends email content | Gmail/D1/JSON | Private business content | Retention policy missing |
| Secrets | Render/Cloudflare/GitHub/Apps Script settings | Critical | Rotation owner/schedule missing |

Security rules:

- Never commit secrets or paste them into chat/logs.
- Use separate production keys per service and preferably per component.
- Provider project/key identity must be written into each audit event without storing the secret.
- Rotate a key when exposure is suspected; do not silently reuse a personal/global key.
- Production changes need a commit, test evidence, migration plan, rollback plan, and post-deploy verification.
- Access to Stripe, Discord, Cloudflare, Render, GitHub, X, OpenAI, and Gmail must have a named owner and backup.

## Nine-step execution checklist

Status meanings: **Complete** means the intended production control and its immediate verification exist; **Partial** means useful production work is live but the acceptance test or coverage is incomplete; **Blocked** means the next safe step requires an owner-supplied identity, credential, or policy decision. Every status change must append evidence here or in the decision log—never silently replace the prior outcome.

| # | Workstream | Status | Durable evidence / verified outcome | What remains / acceptance test |
|---:|---|---|---|---|
| 1 | Cloudflare stale site | **Complete** | Full cache purge completed; custom-domain static Worker `d5d3cd32-182e-4e6c-aa7d-968c81af1b28` and shared site manifest deployed; `cancel`, `cancel.html`, and `cancel.js` returned `200`. | Recheck after future public-site deployments and record the deployed Worker version. |
| 2 | Membership lifecycle | **Partial** | Stripe test Checkout creation, signed subscription webhooks, Supabase membership persistence, Discord OAuth identity linking, Stripe Customer Portal routing, cancellation handling, Discord role code, and replay-safe link ownership are live. Worker `4b66c8f4-d5b0-4b7b-888e-f85584423f9a` passed health verification after deployment. | Run one dedicated test Discord identity through Checkout → link → portal → cancel → role removal and retain Stripe event IDs, Discord user/role evidence, Supabase rows, and timestamps. Implement owner-approved failed-payment/refund/dispute rules. |
| 3 | Luna/X monitoring proof | **Complete for the authorized smoke test** | `X_TEST_CANDIDATE_LIMIT=1 node pipeline/test-real-x-pick.js --no-discord` checked one recent `@CappersUSA` post through `gpt-5.6-luna`; outcome was `SOURCE_EXTRACTED`; no Discord, X, member, or public-site publication occurred. | Use the same no-publication harness for future model/prompt changes; the next normal window must still prove bounded production behavior in the durable ledger. |
| 4 | Durable API trail | **Partial / operational** | Supabase migrations `001`–`004` are live; `api_call_events` and `provider_usage_snapshots` exist with RLS and revoked public roles. Explicit Node and Checkout Worker calls write endpoint/outcome/latency/hash/workflow metadata; eight production ESPN events were observed immediately after cutover. Discord SDK REST response auditing is implemented and regression-tested without retaining route identifiers or message bodies. | Wrap Apps Script calls and Publisher Worker X calls; cover Discord REST failures that happen before a response; then reconcile zero unclassified provider traffic for a controlled window. |
| 5 | Provider billing reconciliation | **Blocked on owner-authorized credential** | `scripts/sync-openai-usage.mjs` imports OpenAI hourly usage by project/API key/model and daily project costs into `provider_usage_snapshots`; it fails safely without `OPENAI_ADMIN_KEY`. | Create/store a dedicated OpenAI organization Admin API key only after action-time owner confirmation, run the import, and reconcile the September 12 anomaly to project/key/model. |
| 6 | Cost containment | **Complete, monitoring required** | Luna is active; durable X cursor/dedupe uses `/var/data`; hard pre-call limits are 50 OpenAI requests/day, 500/month, $1 estimated/day, and $15 estimated/month; monitored-source publishing is disabled. | Review caps after provider reconciliation and verify that cutoff events are durably recorded rather than silently dropping work. |
| 7 | Free Pick mismatch | **Complete for text-only production path** | A dedicated least-privilege credential was generated and stored encrypted in Cloudflare and Render; intermediate exposed rotation values were invalidated. Runtime verification compared only a non-secret hash prefix. The first authorized publish exposed a read-path defect for `objectKey: null`; a regression test was added, the suite passed 98/98, and Publisher Worker `b0a60493-82c6-429a-b74d-7a4d8e24f9f9` was deployed. Canonical pick `20260912-148-X` then returned `201`, `/api/free-pick/current` returned `200`, and the public page rendered the Bijan selection with no Discord/X side effect. | Test the image-backed path separately before using it; add a public-page smoke check to deployment monitoring. |
| 8 | Membership reconciliation | **Complete for scheduled control** | Checkout Worker `8cf8e360-6403-4588-b850-cb65357cf9ca` runs Stripe → Supabase → Discord reconciliation daily at `15 16 * * *` (09:15 Arizona) and records outcomes/failures. | Add an external alert destination for failed reconciliation and prove one mismatch repair in a controlled test. |
| 9 | Legal/support operations | **Blocked on owner decisions** | Draft Terms, Privacy, support pages, and issue playbooks exist, but the public legal text is inconsistent with the live paid product and is not owner/counsel approved. | Supply the legal business identity/address, jurisdiction, support/privacy email, refund and failed-payment grace rules, retention policy, backup operator, and approval authority; then publish and timestamp effective policies. |

## Current backlog

### P0 — contain cost and prevent untraceable production behavior

- [ ] Export the exact OpenAI hourly usage/cost data grouped by project, API key, and model; separate Kobe's Betting Hub from other account usage.
- [x] Deploy and verify the durable X cursor/dedupe path on the Render persistent disk.
- [x] Provision free Supabase Postgres and apply audit/membership schema migrations.
- [x] Securely connect pooled `DATABASE_URL` to Render and a dedicated Supabase server secret to the checkout Worker; verify fail-closed startup and database migration completion.
- [x] Deploy the API/extraction audit path and prove one X candidate through Luna in `--no-discord` mode.
- [ ] Prove a separate approved test fixture end to end through approval, publication, grade, and recap.
- [x] Implement the OpenAI provider-usage reconciliation job for Usage grouped by project/key/model and Costs grouped by project.
- [ ] After explicit owner confirmation, create/store the required organization Admin API key and run the first OpenAI reconciliation; add equivalent X/Cloudflare exports where available.
- [x] Set temporary OpenAI daily/monthly request and dollar hard stops; owner can revise the conservative caps after provider reconciliation.
- [ ] Reduce production deploy churn: batch changes, use local tests/staging, and do not use `main` as the test loop.
- [x] Enforce the owner decision that the 38 sources are approved for monitoring only by setting `X_SOURCE_PUBLISHING_ENABLED=false`.
- [ ] Make public Terms/Privacy/support claims match the live paid product, with owner/legal approval.

### P1 — make memberships and operations reliable

- [x] Deploy the Discord-authenticated Stripe Customer Portal flow and retire Checkout Session-ID membership management.
- [x] Verify test-mode checkout creation and deploy daily Stripe-to-Discord entitlement reconciliation.
- [ ] Complete a live test-identity lifecycle: Checkout, Discord link, portal, cancel, and role removal.
- [ ] Alert on failed webhook processing, Discord role grant/removal, unmatched payment, and duplicate access.
- [ ] Define and implement refund, past-due/grace, dispute, access restoration, and support escalation policy.
- [ ] Establish a shared support ticket system with named owner and response targets.
- [ ] Add API audit events to both Cloudflare Workers and Apps Script queues, not only the Node pick pipeline.
- [ ] Verify end-to-end recap email, Trends email approval, and X delivery with test evidence. The text-only public Free Pick update is verified.
- [ ] Establish a staging environment with separate Stripe test mode, Discord test server/channel, API keys, databases, and domain.
- [ ] Add production smoke tests and alerts for website, checkout health, publisher health, bot heartbeat, stale queues, and database failures.

### P2 — improve product quality and reporting

- [ ] Build one operator dashboard for members, revenue, access mismatches, picks, grading, request volume, estimated/provider cost, errors, and incidents.
- [ ] Expand verified grading coverage only with deterministic tests and explicit unsupported-market behavior.
- [ ] Define SLA/SLO targets for checkout, entitlement, pick delivery, grading, recaps, and support.
- [ ] Consolidate or archive stale docs and trackers after their content is reconciled into this control file.
- [ ] Add marketing only after legal claims, attribution, conversion tracking consent, and unit economics are approved.

## Recursive improvement mechanism

Every improvement cycle must follow this loop:

1. **Observe:** capture the request/event trail, user impact, provider cost, and exact production version.
2. **Classify:** mark the outcome as correct, incorrect, duplicate, failed, retried, unnecessary, or unknown; assign a controlled reason code.
3. **Reproduce:** turn failures into a redacted fixture/test whenever possible.
4. **Change one system boundary:** code, prompt, schedule, source roster, or policy—with an owner and expected metric.
5. **Verify locally/staging:** run tests and compare old/new results and expected call volume.
6. **Deploy deliberately:** batch changes; record commit, migration, configuration changes, and rollback point.
7. **Reconcile:** compare internal request counts/tokens/cost estimates with provider Usage/Costs and business outcomes.
8. **Learn:** update this file, the decision log, and regression suite. A fix is incomplete until the ledger can prove it worked.

Core metrics:

- API calls and dollars per source scanned, candidate, approved pick, published pick, graded pick, active member, and day
- duplicate/retry rate and calls with unknown trigger
- extraction acceptance/rejection reason distribution
- time from source post to approval card and approval to publication
- incorrect/incomplete approval-card rate
- pick log reconciliation completeness
- paid member ↔ Discord entitlement mismatch count and age
- checkout, cancellation, webhook, role, queue, grading, and recap failure rates
- revenue, refunds, disputes, churn, and support volume once policy/ownership are established

## Extraction model and cost strategy

The current OpenAI request receives the X post text plus as many as four attached images. Every supplied image is requested at `high` detail. The model returns strict JSON containing candidate status, capper, sport/league/event, market, player/selection, line, odds, units/stake, multiple plays, visible source claims, an image summary, and ambiguities. It is extraction, not factual verification or betting judgment.

Cost-reduction order:

1. Make cursor/dedupe state durable so the same post is not repeatedly extracted after deploys.
2. Isolate one OpenAI project/API key for this service so every request and dollar is attributable.
3. Do not send images when complete terms can be extracted deterministically from text.
4. Use low-detail vision first and escalate only unreadable/ambiguous images to high detail.
5. Set explicit output and reasoning limits appropriate to the small JSON response.
6. Run audited high-detail and low-detail fixture tests on `gpt-5.6-luna`, then benchmark any non-OpenAI candidates on the same fixtures.
7. Keep Luna only if controlled production output meets the extraction accuracy and malformed-card acceptance thresholds.

Current official list prices recorded on 2026-09-12 are $0.25/M input and $2.00/M output for `gpt-5-mini`, versus $0.20/M input and $1.20/M output for `gpt-5.6-luna`. Both support image input, Responses, and structured outputs. Luna is a valid API model, but its price difference alone cannot explain or eliminate a 3,046-request day; dedupe and image routing have much larger leverage.

DeepSeek's current `deepseek-v4-flash-vision-exp` is another benchmark candidate because its official API supports image input, Responses-format requests, low-detail images, and JSON schema output. It is marked experimental, so it must not replace production extraction without fixture-based accuracy, availability, privacy, and malformed-output testing. Kimi K2.5 advertises multimodal support, but current price/compatibility evidence has not yet been established for this exact schema workflow.

Database direction: the existing free Supabase Postgres project is the first production audit and membership ledger because the implemented Node client already uses PostgreSQL. Migrations `001`–`004` are live. Render connects through Supabase's free IPv4 session pooler. The checkout Worker uses a new-format Supabase server secret (`sb_secret_...`), with legacy service-role compatibility only; it must never expose either key to the public site. Cloudflare D1 remains appropriate for the existing Worker queues.

## Operating rules for this chat and future agents

- Keep one primary operating chat unless the owner explicitly asks for delegated agents.
- Read this file and inspect current code/runtime evidence before proposing work.
- Do not treat old checklists as current truth.
- Lead with verified current state, then unknowns, then the smallest safe next change.
- Never claim “working” from a successful HTTP response alone; prove the business outcome and durable record.
- Do not deploy, provision paid infrastructure, change billing, rotate keys, post publicly, or message members unless the request authorizes that action.
- Preserve user changes in the worktree. Audit/cursor/membership foundation is deployed; inspect `git status` before any new change.
- Update **Last verified**, **Production commit**, component state, backlog, and decision log after every material production change.
- Use sub-agents only after scope, ownership, interfaces, and acceptance tests are clear.

## Decision log

| Date | Decision / evidence | Owner | Status |
|---|---|---|---|
| 2026-09-12 | One root control file will govern project context and work across one primary chat. | Technical operator | Adopted |
| 2026-09-12 | Do not use sub-agents until shared scope and interfaces are established. | Technical operator | Superseded after the nine-step matrix was established |
| 2026-09-12 | Treat request/cost attribution, durable collector state, and production audit as P0. | Technical operator | Active |
| 2026-09-12 | Marketing is deferred until core membership and pick operations are reliable. | Technical operator | Adopted |
| 2026-09-12 | Kobe remains the human approval gate for source picks and Trends posts. | Kobe / existing code | Active |
| 2026-09-12 | Technical owner, billing/support owner, and final production approver are Zakai Martin. | Zakai Martin | Adopted |
| 2026-09-12 | X monitoring will continue while audit controls are deployed; no pause is authorized. | Zakai Martin | Adopted |
| 2026-09-12 | The 38 X sources are approved for monitoring only, not confirmed for republication. | Zakai Martin | Adopted |
| 2026-09-12 | Supabase free Postgres is the preferred initial production audit database. | Zakai Martin | Adopted |
| 2026-09-12 | Existing Supabase project `kobe betting hub` was selected; audit, membership, and table-security schemas were migrated successfully. | Zakai Martin | Live |
| 2026-09-12 | Use Stripe as payment/subscription authority, Discord OAuth as member identity, Supabase as durable mapping/event ledger, and Stripe Customer Portal for billing/cancellation. | Zakai Martin | Deployed; end-to-end member fixture still required |
| 2026-09-12 | Switch source extraction from `gpt-5-mini` to `gpt-5.6-luna` with no reasoning, bounded output, request metadata, prompt cache key, and versioned cost rates. | Zakai Martin | Live; next-window output verification pending |
| 2026-09-12 | Render must fail closed when the audit DB is unavailable. The session-pooler URL uses encrypted libpq-compatible SSL because the pooler chain is not accepted by the driver's strict CA verification on Render. | Zakai Martin | Live and startup-verified |
| 2026-09-12 | Temporary OpenAI hard stops are 50 requests/day, 500/month, $1/day, and $15/month until provider reconciliation supports a better limit. | Zakai Martin | Live |
| 2026-09-12 | Keep monitored-source publication disabled while monitoring/auditing continues. | Zakai Martin | Live |
| 2026-09-12 | Use Cloudflare KV for the public Free Pick state/media because R2 is not enabled on the selected free Cloudflare account. | Zakai Martin | Live |
| 2026-09-12 | Reconcile Stripe subscriptions to Discord roles daily at 09:15 Arizona in addition to webhook-driven updates. | Zakai Martin | Live |
| 2026-09-12 | A one-candidate `@CappersUSA` X/Luna smoke test may run with `--no-discord`; it completed as `SOURCE_EXTRACTED` and created no public/member post. | Zakai Martin | Completed safely |
| 2026-09-12 | Deploy the exact Bijan formatter regression before syncing the existing approved pick. Commit `f9b2141` is live on Render. | Zakai Martin | Deployed |
| 2026-09-12 | Owner explicitly confirmed a text-only public-site sync of canonical pick `20260912-148-X`, with no Discord or X side effect. The attempt returned HTTP `401`; no public item was written. | Zakai Martin | Failed safely; authorization repair required |
| 2026-09-12 | Scoped sub-agents may work from this nine-step matrix when each assignment names its files/interfaces, acceptance evidence, and owner questions; the primary operating chat remains the coordinator. | Zakai Martin | Active |
| 2026-09-12 | Deploy checkout replay protection, Stripe signature-rotation support, least-privilege portal OAuth, and exact Worker-version attribution. Checkout Worker `4b66c8f4-d5b0-4b7b-888e-f85584423f9a` returned health `200` after deployment. | Zakai Martin | Live |
| 2026-09-12 | Add durable Discord SDK REST response auditing with identifier/token redaction and payload hashes only; the combined suite passed 97/97. | Zakai Martin | Prepared for Render deployment |
| 2026-09-12 | Split Free Pick website publication from the broader queue credential. Publisher Worker `047bd71c-f7c5-4ea5-b624-af6615550213` is live; the new dedicated secret still requires action-time owner confirmation and cross-service alignment. | Zakai Martin | Code live; credential pending |
| 2026-09-12 | Owner confirmed creation and installation of the dedicated Free Pick website credential. It was stored encrypted in Cloudflare and Render; intermediate values surfaced by browser accessibility were immediately invalidated, and the final runtime match was verified only by a short hash. | Zakai Martin | Complete |
| 2026-09-12 | The authorized text-only Bijan sync returned `201` but initially remained unreadable because the Worker rejected persisted `objectKey: null`. The regression test and fix are now deployed as Publisher Worker `b0a60493-82c6-429a-b74d-7a4d8e24f9f9`; the current endpoint returns `200`, and the public page visibly renders the pick. | Zakai Martin | Complete |

## Owner answers still required

These cannot be learned safely from source code:

1. What are the daily and monthly budgets for OpenAI, X, Cloudflare, Render, and total infrastructure? At what dollar/request threshold should automation stop versus alert?
2. Who is the backup technical/billing operator and who is the legal/compliance owner?
3. Should the paid product remain live while Terms/Privacy and support/refund policy remain incomplete? The cancellation authentication, audit database, and scheduled entitlement reconciliation are now deployed, although their full test-identity acceptance run is still open.
4. Which Stripe account/mode, Discord server, Cloudflare account, Render workspace, GitHub account, X project, OpenAI organization/project, and Gmail account are the official production accounts? Record identifiers, never secrets.
5. What refund policy, grace period, supported jurisdictions, age rule, official business entity/address, and support/privacy email are approved?
6. What retention period is required for API logs, source content, model inputs/outputs, member identifiers, payment references, and incidents?

## Detailed references

- Pick architecture and audit: `docs/PICK_OPERATIONS_ARCHITECTURE_AND_AUDIT.md`
- Content operations: `docs/CONTENT_OPERATIONS.md`
- Membership design history: `docs/MEMBERSHIP_PAYMENT_FOUNDATION.md`
- Support cases: `docs/ISSUE_PLAYBOOKS.md`
- Onboarding history: `docs/MEMBER_ONBOARDING_PLAYBOOK.md`
- Launch tests: `docs/LAUNCH_TEST_PLAN.md`
- KPI requirements: `docs/KPI_DASHBOARD_REQUIREMENTS.md`
- Responsible gambling draft: `docs/RESPONSIBLE_GAMBLING.md`
- Runtime configuration template: `.env.example`
- Deployment definitions: `render.yaml`, `.github/workflows/deploy-pages.yml`
- OpenAI organization Usage/Costs API: <https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/usage>
- OpenAI request ID and debugging guidance: <https://developers.openai.com/api/reference/overview>
- OpenAI GPT-5 Mini: <https://developers.openai.com/api/docs/models/gpt-5-mini>
- OpenAI GPT-5.6 Luna: <https://developers.openai.com/api/docs/models/gpt-5.6-luna>
- Supabase database connections: <https://supabase.com/docs/guides/database/connecting-to-postgres>
- Supabase pricing: <https://supabase.com/pricing>
- Cloudflare D1 pricing: <https://developers.cloudflare.com/d1/platform/pricing/>
- DeepSeek model pricing: <https://api-docs.deepseek.com/quick_start/pricing/>
- DeepSeek Responses and vision support: <https://api-docs.deepseek.com/guides/responses_api/>
- Kimi multimodal documentation: <https://platform.moonshot.ai/docs/guide/prompt-best-practice>
