# Kobe's Betting Hub — Project Control File

**Status:** Active production system with unresolved operational and compliance risks

**Last verified:** 2026-09-12 17:32 MST

**Production runtime change set:** `7e7846a` plus Checkout Worker version `d4edff4e-93ff-41cc-94d9-54c2bcab2d0b`

**Control-file owner:** Zakai Martin

**Business/content approver:** Kobe

**Technical owner:** Zakai Martin

**Billing/support owner:** Zakai Martin

**Final production approver:** Zakai Martin

This is the authoritative project brain for humans and coding agents. Read this file before changing the project. Update it whenever production state, ownership, architecture, costs, risks, or priorities change. The other Markdown files contain detailed playbooks; when they conflict with this file, this file wins until the conflict is resolved.

The owners do not need to read every repository document. The operating chat should use this file to answer: what is live, what talks to what, what costs money, what failed, what is next, and which decisions require an owner.

## Executive state

Kobe's Betting Hub is a paid sports-pick membership centered on Discord. It also has a public website, Stripe checkout, Discord entitlement automation, a monitored X-source pick pipeline, human approval in Discord, result grading through ESPN, recap email queues, a public Free Pick page, and optional X publishing.

The system is not a single application. It currently spans GitHub Pages, Cloudflare Workers/D1/R2, Render, Discord, Stripe, X, OpenAI, ESPN, Gmail Apps Script, and Supabase Postgres. Supabase is now the shared membership and pick/API audit ledger; provider billing reconciliation and several non-Node call paths still need to be added before the ledger is complete.

### What is definitely live

- `https://kobesbettinghub.com` serves the repository's public site from `main`; the membership-management link now targets Discord-authenticated Stripe Customer Portal access.
- Membership checkout is enabled. Offers shown publicly are `$10 / 7 days` or `2 days free`, followed by `$32.99/month` until canceled.
- The checkout Cloudflare Worker is reachable and reports healthy. The Discord-authenticated Stripe Customer Portal and Supabase membership/webhook ledger were deployed as Worker version `d4edff4e-93ff-41cc-94d9-54c2bcab2d0b` on 2026-09-12.
- Stripe Checkout creates subscriptions. After payment/trial confirmation, the customer connects Discord through OAuth and receives the configured paid-member role.
- Stripe subscription create/update/delete webhooks maintain the Supabase membership state and reconcile Discord access. The Stripe webhook endpoint is active and subscribed to all four required event classes, including Checkout completion.
- A Render background worker runs the Discord bot and X collector from `7e7846a`, with a 1 GB persistent disk at `/var/data`.
- The production X collector is enabled for 38 configured sources. Its effective interval is 15 minutes during the configured daily Arizona window.
- The Render environment and repository are configured for `gpt-5.6-luna` with bounded output, no reasoning, versioned pricing metadata, and reusable audited extractions.
- The free Supabase project `kobe betting hub` is healthy. Audit, membership, and audit-table security migrations `001`–`003` were applied successfully on 2026-09-12. The Checkout Worker uses a dedicated server secret; Render uses the encrypted session-pooler connection with fail-closed audit enforcement.
- The publisher Cloudflare Worker reports ready, connected to X, and configured with Free Pick media storage.
- Discord `#daily-free-play` contained a Kobe Bot pick at 3:05 PM Arizona on 2026-09-12. The separate public website Free Pick API had no current item when checked and returned `404 No current free pick`. Discord publication and website publication are distinct states and must be reconciled.
- The latest GitHub Pages deployment for `f7711bb` completed successfully.

Observed output-quality evidence: the 2026-09-12 Discord screenshot shows a published Bijan Robinson card with duplicated pick terms in the title/first bullet and an incomplete sentence ending in “including 82 yards at”. A successful Discord post is therefore not sufficient proof of a correct card. The audit must score completeness, duplication, formatting, and factual support in addition to transport success.

### What is not production-ready even though parts are live

- The public Terms and Privacy pages still say they are drafts/not effective and describe a pre-checkout site with no payment or member account integration. That is factually inconsistent with the live product.
- No owner-supplied proof of legal entity, jurisdiction, official support/privacy contact, refund policy, or counsel approval exists in the repository.
- Membership persistence now uses Supabase for normalized customer/subscription state and signed webhook event idempotency. Stripe remains the payment and subscription source of truth; Discord role state is the derived entitlement.
- The Checkout Worker now authenticates returning members with Discord OAuth and then creates a Stripe Customer Portal session. Discord proves which linked member is acting; Stripe authenticates and performs billing, recurring subscription, invoices, payment-method changes, and cancellation.
- All 38 X sources are approved for monitoring only and are marked `PENDING_SOURCE_TERMS`; none is marked `CONFIRMED` for reuse/publication. Production has a global override allowing source-derived publishing, which conflicts with the approved scope.
- Render has a pooled `DATABASE_URL` and `AUDIT_DATABASE_REQUIRED=true`. The audit-aware worker completed database initialization, registered Discord commands, and logged in as Kobe Bot after deployment.
- API calls across membership and Cloudflare services are not centrally logged or cost-attributed.
- Marketing is intentionally a future workstream, not the current priority.

## System map

```text
Visitor
  └─> kobesbettinghub.com (GitHub Pages behind the custom domain)
       ├─> Checkout Worker ─> Stripe Checkout / subscriptions
       │                     └─> Discord OAuth + paid-member role
       └─> Publisher Worker ─> current Free Pick from R2

38 approved-for-monitoring X accounts
  └─> Render X collector ─> X API
                           ├─> OpenAI Responses extraction
                           ├─> ESPN event validation
                           └─> private Discord approval card
                                └─> Kobe approves/rejects
                                     ├─> public Discord channel
                                     ├─> persistent CSV pick log
                                     ├─> Publisher Worker queue / R2 / X
                                     └─> ESPN grading ─> recap queue ─> Gmail Apps Script ─> Kobe email

Kobe Trends email
  └─> Gmail Apps Script ─> Publisher D1 queue ─> Render bot
       └─> private Discord approval ─> approved Discord trends channel
```

## Components and sources of truth

| Area | Runtime / store | Repository entry points | Current source of truth | State |
|---|---|---|---|---|
| Public website | GitHub Pages + custom domain | root HTML/CSS/JS; `.github/workflows/deploy-pages.yml` | `main` deployment | Live |
| Checkout | Cloudflare Worker | `cloudflare/kobes-checkout-worker.js` | Stripe + Supabase | Secure Discord-authenticated portal and webhook persistence live |
| Payments | Stripe | called by Checkout Worker | Stripe subscription and invoice records | Live |
| Member access | Discord | Checkout Worker OAuth/role calls | Stripe status should govern Discord role | Live, needs reconciliation |
| Discord operations | Render Node worker | `bot/index.js`, `bot/commands.js` | Discord messages + Supabase workflow events + local logs | Live on `7e7846a` |
| X monitoring | Render Node worker | `pipeline/collect-x.js`, `data/twitter-sources.json` | source roster + persistent cursor | Live; cursor/dedupe root is on `/var/data` |
| Model extraction | OpenAI Responses API | `pipeline/enrich-pick.js` | response/request IDs + structured output | Luna + extraction audit live; next-window production evidence pending |
| Pick approval | private Discord channel | `bot/lib/source-review.js`, `bot/index.js` | Kobe button action | Live |
| Pick publication | Discord | `bot/index.js` | Discord message ID + audit event | Live |
| Pick log | Render persistent disk | `bot/lib/pick-log.js` | `/var/data/pick-log.csv` | Live, single-host CSV |
| Pick/member audit DB | Supabase Postgres | `pipeline/audit-store.js`, `pipeline/migrations/` | Supabase Postgres | Migrations `001`–`003` live; Worker and Render connected |
| Event/result verification | ESPN public APIs | `bot/lib/event-timing.js`, `bot/lib/espn-grading.js`, `bot/lib/espn-trends.js` | stored response snapshot/reference after audit cutover | Live, partial market coverage |
| Public Free Pick | Publisher Worker + R2 | `cloudflare/bettinghub-publisher.js`, `free-pick.js` | R2 `free-picks/current.json` | Service ready; no current pick |
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

Missing controls after the pending cutover: unmatched-account recovery, daily Stripe-to-Discord reconciliation, support tickets, failed-role alerting, refund implementation, and an approved public policy.

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
| Browser | Checkout Worker `/create-checkout` | Join button | Cloudflare request; downstream Stripe | None centralized | Disable checkout in code/Worker |
| Checkout Worker | Stripe `/v1/checkout/sessions` | New checkout | Stripe fees after payment | Stripe records; no local request ledger | Remove/disable prices or Worker route |
| Checkout Worker | Stripe session/subscription GET | Discord connect and membership management | Stripe API quota | Stripe only | Disable routes |
| Checkout Worker | Stripe subscription update | retention/cancel | Business revenue impact | Stripe only | Disable retention/cancel routes |
| Stripe | Checkout Worker `/stripe-webhook` | subscription events | Cloudflare requests | Stripe delivery log only | Stripe webhook setting |
| Checkout Worker | Discord OAuth token/user/join/role/revoke | Member connects Discord | Discord rate limits | Discord/Stripe metadata only | Remove Worker Discord credentials |
| Render collector | X user lookup | missing source cursor, notably after state loss | X API plan/quota | Console only; source user ID in cursor | `X_MONITOR_ENABLED`, source `enabled` |
| Render collector | X user timeline | every source each collector pass; pagination on catch-up | Major X call-volume driver | Local audit logs posts, not every HTTP attempt | daily window, interval, candidate cap |
| Render collector | ESPN NFL/NCAAF scoreboards | each collector pass | Public API availability | Console only | stop X monitor |
| Render collector | OpenAI `/v1/responses` | each candidate passing prefilter | Token-based spend | Full request metadata implemented locally, not deployed | `ENRICHMENT_ENABLED`, model, monitor switch |
| Render collector | ESPN event scoreboards | candidate event validation | Public API availability | Gate outcome locally audited after DB cutover | stop X monitor |
| Render collector | Discord channel/message REST | label lookup and approval card send | Discord rate limits | Approval result locally audited after DB cutover | pause file / stop monitor |
| Discord bot | Discord Gateway/REST | always connected; commands/buttons/posts | Discord rate limits | message IDs partly logged | stop Render service / pause picks |
| Discord bot | ESPN scoreboards/summaries | grading, trends, event checks | Public API availability | grade attempt locally audited after DB cutover | `AUTO_GRADE_FREE_PICKS=false` |
| Discord bot | Publisher queue endpoints | Free Pick/X/daily pick/trends/recap | Cloudflare/D1/R2/X downstream | partial D1 state; pick DB locally implemented | feature-specific enabled vars |
| Publisher Worker | X media upload/post/token refresh | approved/scheduled X post | X API plan/quota | D1 logs text-post deliveries; Free Pick state in R2 | disconnect X / remove queue secret |
| Browser | Publisher `/api/free-pick/current` | every Free Pick page load | Cloudflare/R2 reads | Cloudflare platform logs only | remove page integration |
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
| Free Pick image/current state | Cloudflare R2 | Public/business | Cleanup/version policy missing |
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

## Current backlog

### P0 — contain cost and prevent untraceable production behavior

- [ ] Export the exact OpenAI hourly usage/cost data grouped by project, API key, and model; separate Kobe's Betting Hub from other account usage.
- [x] Deploy and verify the durable X cursor/dedupe path on the Render persistent disk.
- [x] Provision free Supabase Postgres and apply audit/membership schema migrations.
- [x] Securely connect pooled `DATABASE_URL` to Render and a dedicated Supabase server secret to the checkout Worker; verify fail-closed startup and database migration completion.
- [ ] Deploy the OpenAI/pick audit path and prove one candidate from source post through extraction, gates, approval, publication, grade, and recap.
- [ ] Add a provider-usage reconciliation job: OpenAI Usage grouped by project/key/model and Costs grouped by project; equivalent X/Cloudflare exports where available.
- [ ] Set named monthly/daily API budgets, anomaly thresholds, and an automated stop/alert rule.
- [ ] Reduce production deploy churn: batch changes, use local tests/staging, and do not use `main` as the test loop.
- [ ] Enforce the owner decision that the 38 sources are approved for monitoring only: disable the global source-publication override after defining how Kobe-authored picks may use monitored facts without republishing protected source material.
- [ ] Make public Terms/Privacy/support claims match the live paid product, with owner/legal approval.

### P1 — make memberships and operations reliable

- [x] Deploy the Discord-authenticated Stripe Customer Portal flow and retire Checkout Session-ID membership management.
- [ ] Verify the deployed durable membership/webhook event ledger with test-mode fixtures, then add daily Stripe-to-Discord entitlement reconciliation.
- [ ] Alert on failed webhook processing, Discord role grant/removal, unmatched payment, and duplicate access.
- [ ] Define and implement refund, past-due/grace, dispute, access restoration, and support escalation policy.
- [ ] Establish a shared support ticket system with named owner and response targets.
- [ ] Add API audit events to both Cloudflare Workers and Apps Script queues, not only the Node pick pipeline.
- [ ] Verify end-to-end recap email, Trends email approval, public Free Pick update, and X delivery with test evidence.
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

Database direction: the existing free Supabase Postgres project is the first production audit and membership ledger because the implemented Node client already uses PostgreSQL. Both schema migrations are live. Render should connect through Supabase's free IPv4 session pooler. The checkout Worker uses a new-format Supabase server secret (`sb_secret_...`), with legacy service-role compatibility only; it must never expose either key to the public site. Cloudflare D1 remains appropriate for the existing Worker queues.

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
| 2026-09-12 | Do not use sub-agents until shared scope and interfaces are established. | Technical operator | Adopted |
| 2026-09-12 | Treat request/cost attribution, durable collector state, and production audit as P0. | Technical operator | Proposed for final approval |
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

## Owner answers still required

These cannot be learned safely from source code:

1. What are the daily and monthly budgets for OpenAI, X, Cloudflare, Render, and total infrastructure? At what dollar/request threshold should automation stop versus alert?
2. Who is the backup technical/billing operator and who is the legal/compliance owner?
3. Should the paid product remain live while Terms/Privacy, cancellation authentication, audit DB, and entitlement reconciliation are incomplete?
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
