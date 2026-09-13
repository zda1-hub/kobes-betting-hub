# Kobe's Betting Hub — Beta and Public Launch Operations

**Status date:** 2026-09-13  
**Scope:** paid membership, member access, pick operations, support, incident response, and launch rollback  
**Technical owner:** Zakai Martin  
**Billing/support owner:** Zakai Martin  
**Final production approver:** Zakai Martin  
**Business/content approver:** Kobe  

`PROJECT_CONTROL.md` remains the authoritative statement of current production state. This file is the operational gate: do not mark an item complete because code exists or a test was planned. Record the dated evidence that proves it worked.

## Recommendation

Run an **invite-only, monitored beta capped at 20–30 concurrently active members**. Do not use an unrestricted public announcement as the beta.

Twenty to thirty known supporters is enough to expose onboarding, mobile checkout, Discord-linking, cancellation, support, and daily-pick workflow problems while one operator can still reconcile every account. Being a known supporter does not waive accurate billing disclosures, cancellation rights, privacy obligations, or responsible-gambling safeguards.

Enroll in three waves:

1. **Wave A — 5 members:** hold for one complete onboarding and pick day. Reconcile every member manually.
2. **Wave B — up to 15 total:** open only if Wave A has no unexplained billing/access exception and no P0/P1 defect.
3. **Wave C — up to 30 total:** open only if the same checks remain clean and support volume is manageable.

Close enrollment when the thirtieth active beta membership is reached. A link that is merely “not advertised” is not a technical cap; keep it in individually directed invitations, record the roster, and remove or disable the invitation when the cohort is full. Do not run paid marketing during the beta.

The beta should run at least **7–14 days** and long enough to observe one real renewal or trial conversion. Stripe test clocks can prove time-based mechanics but do not replace observation of the real production webhook and support flow.

## Current evidence — not a release approval

### Verified

- [x] Staging is isolated from production across Supabase, Stripe test mode, Discord guild/role, Checkout Worker, and site origin.
- [x] A staging test identity completed Checkout, Discord OAuth/linking, role grant, authenticated Customer Portal entry, and terminal cancellation; Supabase recorded `canceled`, the webhook recorded `ROLE_REMOVED`, and Discord returned HTTP `204` for the role DELETE.
- [x] Supabase staging stores membership, webhook, membership-event, and API-call evidence without storing OAuth tokens, card data, or raw secrets.
- [x] Stripe signatures, duplicate event IDs, Discord first-claim protection, and Checkout idempotency are covered by automated tests.
- [x] Staging migrations `007_service_role_rest_access`, `008_subscription_cancellation_fields`, and `009_membership_entitlement_blocks` fixed REST grants, current Stripe subscription-period persistence, and durable refund/dispute access blocking.
- [x] Current billing-control candidate passed the full repository suite: 162 tests, 0 failures; `git diff --check` also passed.
- [x] Stripe staging destination `we_1UF61QE6p9BmPii30UGuNEMO` listens to eight events including `invoice.payment_failed`; exact source commit `e31e234966aae3b721bc75dc0c2853632a9d7110` is deployed as Checkout Worker staging version `531ee711-60a1-4429-9147-6595ed13eb5a` and returned healthy with all six expected secret names.
- [x] Test coupon `VJxmdXFz` is 75% off once and is configured in Customer Portal configuration `bpc_1UF9gPE6p9BmPii3pI6NPPAn`.
- [x] A fully mocked pick lifecycle covers extraction, ESPN validation, private/public payload equivalence, canonical log, grading, unit math, recap, X copy, and Trends generation.
- [x] The Free Pick path validates JPEG/PNG/WebP, enforces a 5 MB limit, preserves exact bytes/MIME, and avoids duplicate X text/image posts in automated tests.
- [x] Production exposes read-only health/current-pick checks through `npm run smoke:production`; its previously recorded smoke run passed all five checks.
- [x] Production X monitoring is approval-first, and source-derived public publishing is disabled with `X_SOURCE_PUBLISHING_ENABLED=false`.
- [x] Private production `/hub-status` at 09:08 MST on 2026-09-13 reported workflow ready, canonical pick log configured, required database audit connected, ESPN grading on, and recap email connected. Zero Free Picks and zero pending Free Pick results were expected before today's first publication.

### Still open at this status date

- [x] Finish fresh test clock `clock_1UFAPBE6p9BmPii34X93rbeb`: coupon `VJxmdXFz` produced paid invoice `in_1UFFj1E6p9BmPii37FBFrhWg` for `$8.25`, then Stripe returned to `$32.99`; period-end cancellation produced event `evt_1UFFqTE6p9BmPii3UWYNvLwv`, Supabase `canceled`, `PROCESSED/ROLE_REMOVED`, and Discord DELETE `204`.
- [x] Deploy the customer-specific single-redemption retention guard to isolated staging and prove the same member cannot receive the 75%-off Customer Portal offer twice. Staging Worker `4fe6301a-307c-446b-87ee-7a772c38bbfb` is healthy; an authenticated repeat review on the legacy fixture showed no second offer after its pre-deployment marker was backfilled.
- [ ] Approve the failed-payment grace/restoration policy and retain isolated external failed-payment/refund/dispute scenario evidence. The dedicated handler and durable entitlement blocks are implemented, deployed to staging, and covered by automated tests. Explicitly test partial versus full refunds, dispute created/won/lost/closed states, payment recovery, and either audited restoration or an approved manual exception path.
- [x] Automated failed-payment coverage proves an `active` subscription retains its role, a `past_due` subscription loses its role, and a later eligible `active` subscription update restores the role. Isolated external Stripe/Supabase/Discord evidence is still required.
- [ ] Apply reviewed production migrations `007`, `008`, and `009`, then deploy the tested Checkout Worker source only after final production approval.
- [ ] Add an external owner alert for paid-without-access and reconciliation failures, or approve the manual monitoring schedule below for the limited beta.
- [ ] Add server-side checkout abuse protection before a broad public launch. Idempotency exists; rate limiting/Turnstile does not.
- [ ] Complete one real, owner-authorized production acceptance purchase/cancel cycle. No production transaction is authorized by this document.
- [ ] Complete one real approval-to-Discord pick, ESPN final grade, recap email, Trends intake/approval, and X acceptance after deliberate deployment.
- [ ] Approve effective Terms, Privacy, recurring-billing, refund/cancellation, age/location, and responsible-gambling language. The public legal documents are still drafts.
- [ ] Define the official public support/privacy address, staffed hours/timezone, backup operator, ticket location, and data-retention/deletion period.
- [x] Add a credential-free read-only production-health workflow for the existing five public smoke checks and repository tests that prevent billing-disclosure drift. The workflow becomes active only after the candidate reaches the default branch; direct owner alerting remains open.

## Owner decisions that cannot be invented

Record each answer and approval date before beta payments open:

- [ ] Legal business/entity name and public business address.
- [ ] Governing jurisdiction and the locations in which membership will be offered.
- [ ] Legal/compliance reviewer and approval of Terms, Privacy, recurring billing, and responsible-gambling language.
- [ ] Official support/privacy email. `themartinventures@gmail.com` is recorded as the technical/billing account email; it is **not automatically the public support address**.
- [ ] Staffed support hours and timezone.
- [ ] Backup operator when Zakai is unavailable.
- [x] Failed-payment rule: suspend access when Stripe reports `past_due`; automatically restore only when Stripe returns to `active` or `trialing`. Automated coverage passes; isolated external evidence remains below.
- [ ] Mandatory refund/dispute access effect and exception authority. Standard policy is no voluntary refunds, except where law, card-network rules, or a written owner exception requires otherwise.
- [ ] Discord-account relink verification and who may authorize it.
- [x] Provisional retention selected: membership/API audit records 24 months and ordinary support tickets 12 months, subject to legal/privacy review. Support-ticket storage is not yet implemented.
- [ ] Alert destination for paid-without-access and reconciliation failures.
- [x] Pick-operation assignments: Kobe approves and publishes; deterministic ESPN automation grades supported markets; Zakai performs daily closeout and owns exceptions. Unsupported/ambiguous markets remain pending for manual grading.

## Gate 1 — Required before the first paid beta invitation

### Billing and cancellation

- [x] Fresh Stripe test-clock lifecycle passes from new simulated customer through terminal role removal. Repeat subscription `sub_1UFGmRE6p9BmPii35bC5Oteh` ended in event `evt_1UFHpPE6p9BmPii39F5ZuPiF`, Supabase `canceled`, and Discord DELETE `204` / `SUCCEEDED`.
- [x] The cancellation offer is optional: accepting it discounts exactly one eligible next monthly invoice; declining it completes cancellation without obstruction. A same-customer fresh portal session recorded `retention_offer_included=false` and completed cancellation.
- [x] Cancellation is effective at the paid-through date, and the Customer Portal clearly displays the end date and future-charge state. The repeat fixture displayed December 13, no further invoice, then ended after clock advancement to December 14.
- [ ] Price and cadence match everywhere: join page, Stripe Checkout, portal, receipt, FAQ, Terms, and support replies.
- [ ] The `$10 / 7 days` and `2 days free` offers each produce the intended `$32.99/month` recurring subscription. No ambiguous “$10 per week” representation remains.
- [ ] Abandoned, declined, pending, replayed, and duplicate Checkout submissions grant no access and create no duplicate charge/subscription.
- [ ] Failed payment and recovery have an approved grace/access state, test evidence, and support response.
- [ ] Partial and full refunds each have an approved entitlement rule and external test evidence; current staging code blocks access on any `charge.refunded` event until policy says otherwise.
- [ ] Dispute creation and won/lost/closed outcomes have an approved entitlement/restoration rule and external test evidence; current staging automation blocks on `charge.dispute.created` but does not auto-restore.
- [ ] An audited owner-approved manual restore/exception path is drilled without affecting any other member.
- [x] Stripe test-mode lifecycle evidence is attached to `MEMBERSHIP_TEST_CLOCK_AUDIT_2026-09-13.md`: test customer, subscriptions, event IDs, expected/actual results, timestamps, Worker version, Supabase rows, and Discord role results. No card data or secret value is recorded.

### Production change approval

- [ ] Zakai reviews the exact source commit, schema plan, Worker variables, secret names, and rollback version IDs.
- [ ] Production Supabase migration plan includes reviewed additive migrations `007`, `008`, and `009` in order. The sanitized target reference is the production project `mpajyubbnnsdpgdizvht`.
- [x] A production-locked migration tool now defaults to a read-only plan, pins only `007`–`009`, hard-checks project `mpajyubbnnsdpgdizvht`, requires encrypted transport and a project-bound apply confirmation, uses one advisory-locked transaction, and verifies the result before commit. It has not been run against production.
- [ ] A current encrypted backup or point-in-time recovery method is verified for the production database. Record how restoration was tested; do not put credentials in the launch record.
- [ ] Production Discord bot role remains above the paid-member role and has only the permissions needed for join/role operations.
- [ ] Stripe production webhook destination and subscribed event set are reviewed. Add any newly required billing event only as part of the approved deployment.
- [ ] Zakai gives action-time final approval before any production migration, deploy, real transaction, customer message, or public post.

### Customer-facing policy and support

- [ ] Remove “DRAFT / NOT YET EFFECTIVE” only after owner/legal approval and publish the effective date.
- [ ] Show `$32.99/month`, introductory timing/amount, automatic renewal, cancel-at-period-end effect, and the no-voluntary-refund rule before payment.
- [ ] State the required exceptions to “all sales final” rather than representing the rule as absolute.
- [ ] Display and test the official support route from join, success, membership, cancellation, FAQ, Terms, and Privacy pages.
- [ ] Publish the support hours/timezone and response target.
- [ ] Confirm 21+ and responsible-gambling disclosures and current help resources.
- [ ] Pin a Discord support warning: never send card details, passwords, one-time codes, crypto, or device access.
- [ ] Create the beta roster with only necessary fields: internal beta ID, Stripe customer/subscription references, Discord user ID, invite/activation time, current state, last reconciliation, open ticket, and consent to beta communications.

### Member access

- [ ] One trusted non-owner production acceptance account completes checkout, Discord connection, role grant, intended paid-channel visibility, portal login, cancellation, and expected access removal. Use an owner-authorized real transaction only after the production deployment is approved.
- [ ] Verify `@everyone` cannot see paid channels and paid members cannot see staff-only channels.
- [ ] Verify first-claim protection fails closed when a Stripe membership or Discord identity is already linked.
- [ ] Write and drill an audited manual restore for one verified paid member; it must not affect any other member.
- [ ] Write and drill an owner-approved Discord relink path before support promises relinking.

### Pick-day readiness

- [ ] Assign the day's reviewer, Kobe as approver, publisher, grader, and closeout/checker.
- [ ] Run one real text pick privately and confirm exact selection, line, odds, units, attribution/rights, destination, and layout.
- [ ] Run one approved image-backed Free Pick using a real JPG/PNG/WebP and verify the image appears exactly once in Discord/website/X paths selected for the test.
- [ ] Confirm the published Discord message and canonical log row are identical for Pick ID, market, line, odds, units, post time, and destination reference.
- [ ] Grade at least one supported real final event from ESPN and confirm unit arithmetic and recap output. Unsupported markets use `/grade-pick`; they may not be silently guessed.
- [ ] Complete the recap email and Trends email intake/approval tests without automatic public posting.
- [ ] Keep all 38 X sources approval-first. `PENDING_SOURCE_TERMS` content may be monitored for candidate review but may not be reused/published without confirmed rights.

### Go/no-go record

- [ ] No unresolved P0 or P1 defect.
- [ ] No unexplained Stripe ↔ Supabase ↔ Discord mismatch.
- [ ] No secret, customer data, source image, or private message appears in repository/log evidence.
- [ ] Rollback owner and support coverage are scheduled for the first beta wave.
- [ ] Zakai records `BETA GO`, date/time/timezone, source commit, deployed versions, cohort cap, and accepted residual risks.

## Gate 2 — Monitored beta operating routine

### Before each enrollment wave

1. Record the active member count and available slots.
2. Run the five read-only production smoke checks.
3. Check the Checkout Worker health/version, Render deployment/worker status, Stripe webhook delivery state, Supabase reconciliation events, and Discord bot/role hierarchy.
4. Verify the current price/policy copy and Customer Portal cancellation path.
5. Confirm Zakai is available for billing/support and name the backup. If no backup exists, do not open a new wave while Zakai is unavailable.
6. Send invitations only to the next named cohort. Record invite time and activation result; do not publish the link broadly.

### For every beta activation

Within five minutes of `checkout.session.completed`:

1. Match one Stripe customer and one subscription to the beta roster.
2. Confirm the corresponding Supabase customer/subscription and processed webhook rows.
3. Confirm exactly one Discord identity link and the intended paid-member role.
4. Confirm the member can see paid channels but not staff-only channels.
5. Confirm the member has the billing portal and support routes.
6. Record pass/fail, UTC timestamp, event/reference IDs, and operator. Do not record card data, OAuth tokens, or raw email when a masked value suffices.
7. If any check fails, stop new invitations and follow the paid-without-access incident flow.

### Monitoring cadence during beta

**First activation day**

- After every activation: run the per-member check above.
- Every 30 minutes while invitations are active: check failed webhooks, new Checkout Sessions/subscriptions, Discord grants, and support.
- At the end of the day: reconcile all Stripe active/trialing subscriptions to Supabase and Discord; reconcile all official picks to the canonical log and recap.

**Remainder of beta**

- At start and end of staffed hours: inspect failed/retrying Stripe events, `MEMBERSHIP_RECONCILIATION_FAILED`, `NO_DISCORD_LINK`, active/trialing vs. Discord-role mismatches, cancellations, disputes/refunds, and support backlog.
- After each scheduled daily reconciliation: record checked/granted/removed/no-link/failed counts. The production cron is currently scheduled for 09:15 Arizona time.
- Daily: reconcile every beta account, not a sample; review API-call anomalies and OpenAI usage/cost imports; close out picks and pending grades.
- Weekly: audit at least five Pick IDs end to end and review permissions, P0/P1 incidents, billing exceptions, API spend, and repeat support issues.

### Beta success criteria

- [ ] Zero unexplained charges or duplicate subscriptions.
- [ ] Zero unexplained access-without-eligible-payment or paid-without-access at daily close.
- [ ] At least 99% of eligible grants occur within five minutes; every miss has a recorded cause and resolution.
- [ ] Cancellation requests complete on the promised schedule with no renewal after a timely cancellation.
- [ ] At least one real renewal/trial conversion and one real period-end cancellation have reconciled end to end, or Zakai explicitly extends the beta until they do.
- [ ] Every official pick has an immutable approval, publication, grade/correction, and recap trail.
- [ ] No public pick is generated directly from unconfirmed source rights.
- [ ] Support meets the approved response target; no unresolved repeat P1 issue exists.
- [ ] API cost per monitored day/member is understood and no unexplained request spike exists.

## Incident runbook

### Severity

| Severity | Trigger | Immediate objective |
| --- | --- | --- |
| P0 | real-money charging is materially wrong; customer/secret exposure; unauthorized broad Discord access; account takeover; broad outage; gambling-harm/self-harm request | contain immediately; stop expansion and unsafe automation |
| P1 | one or more paid members lack access; access exists without eligible payment; duplicate charge; timely cancellation renews; wrong official pick reaches members; repeated webhook/reconciliation failure | stop enrollment/publication affected by the defect; restore correct individual state |
| P2 | isolated portal/help problem, refund/plan question, delayed noncritical recap, one content correction | acknowledge, assign, resolve during staffed hours |
| P3 | how-to, feedback, or feature request | record and schedule |

### Universal response — exact order

1. **Open an incident record:** `INC-YYYYMMDD-###`, detected UTC time, reporter, component, affected references, severity, current owner, and next update time.
2. **Freeze expansion:** stop new beta invitations. If charging or entitlement correctness is uncertain, remove public checkout invitations/CTAs or place the join flow in maintenance; do not delete customers or subscriptions.
3. **Contain the affected automation:** disable only the failing path. Keep `X_SOURCE_PUBLISHING_ENABLED=false`; stop public pick/recap posting if canonical-log or approval integrity is uncertain.
4. **Preserve evidence:** save provider event IDs, request IDs, timestamps, sanitized response status, Worker/Render version, commit, Supabase audit references, and Discord member/role result. Never paste secrets, raw tokens, card details, or full webhook payloads into chat/tickets.
5. **Determine source of truth:** Stripe for money/subscription; Supabase for durable mapping/events; Discord for observed entitlement; canonical pick log for official pick terms. A screenshot alone is not proof.
6. **Correct the smallest safe scope:** one customer, one entitlement, one pick, or one deployment. Do not bulk grant/remove roles while identity or payment state is uncertain.
7. **Reconcile:** compare before/after state across every affected system and search for other records with the same failure signature.
8. **Communicate:** acknowledge with ticket/incident ID, what is affected, the next update time, and any safe member step. Do not promise a refund or restoration before verification.
9. **Close:** record resolution, evidence, customer impact, owner approval, and follow-up. Every P0/P1 gets a root cause and prevention action before enrollment resumes.

### Paid but no access / access without payment

1. Stop the next enrollment wave.
2. Verify Stripe subscription and paid/trial eligibility; pending/failed is not eligible.
3. Compare Stripe customer/subscription, Supabase mapping/state/event, and Discord user/role.
4. If the paid identity is exact, retry the single-member reconciliation or make one audited manual role correction.
5. If identity is mismatched or already claimed, do not overwrite it; escalate to Zakai's relink process.
6. Search all active/trialing beta subscriptions for the same mismatch.
7. Resume enrollment only when daily reconciliation is clean and the cause is understood.

### Cancellation, refund exception, dispute, or failed payment

1. Verify identity through the linked Discord/Stripe-supported path; never ask for card details.
2. Inspect Stripe's current subscription/invoice/charge state and effective timestamps.
3. Apply the published policy consistently: cancellation ends future renewal at period end; no voluntary refund except required/written exceptions; a customer may decline retention and cancel.
4. Do not use the retention offer for a gambling-harm request. Stop promotional language and route the request through the responsible-gambling playbook.
5. For a required refund/dispute/failed payment, follow the approved entitlement rule. Until automated handling is proven, reconcile Supabase and Discord manually and record the owner action.
6. Recheck Stripe after the action and after the next relevant webhook/reconciliation cycle.
7. Treat a charge after a timely confirmed cancellation as P1.

### Wrong or unlogged pick

1. Stop publishing that pick/daily recap and preserve the original message/reference.
2. Set `CORRECTION_REQUIRED`; never overwrite or delete the canonical history to hide the error.
3. Verify the exact approved event, market, selection, line, odds, units, and destination.
4. Publish a timestamped correction to the same audience, then append the correction event/reference to the log.
5. Regrade/recalculate only from the exact published line and official result source; issue a corrected recap when needed.
6. Search that day's releases for the same formatter/source/approval defect before resuming.

### Credential or data exposure

1. Stop the affected service/path and restrict access to the incident record.
2. Revoke or expire the exact exposed credential at its provider; do not reveal it again while identifying it.
3. Create a least-privilege replacement, install it only in the encrypted runtime secret store, and clear transient copies.
4. Inspect provider/audit activity from before exposure through revocation for misuse.
5. Verify health with non-secret identifiers and a controlled request.
6. Determine notification/legal duties with the designated reviewer before closing.

## Deployment rollback runbook

Rollback is a controlled incident action, not deletion. Preserve Stripe/Supabase/audit records and do not reverse money automatically.

### Production promotion sequence — after final approval only

Use this order; do not combine the production database, Worker, site, Render, and real-money acceptance into one unobserved change.

1. Freeze the candidate source commit. Record `git status`, commit, full `npm test` result, and the exact files changed since the currently deployed version.
2. Record the current known-good version/deployment for checkout, static site, publisher, and Render. Confirm each is still healthy before changing it.
3. Produce a sanitized production database migration plan against project `mpajyubbnnsdpgdizvht`. Review every pending SQL file, grants, new columns/constraints, and whether old application code remains compatible.
4. Verify the database backup/recovery method and record the restore checkpoint/time. Do not proceed on the assumption that the free tier includes an unverified recovery feature.
5. Review production Worker variable names/IDs against `wrangler.jsonc`, Stripe live-mode account/destination, Discord production application/guild/role, and Supabase production URL. Compare identifiers only; never expose secret values.
6. Obtain Zakai's action-time approval naming the commit, migrations, components, and acceptance scope.
7. Apply only the approved database migrations. Verify the recorded migration versions, required tables/columns, RLS, browser-role revocation, server-role grants, and preservation of existing row counts.
8. Deploy only the approved Checkout Worker candidate. Keep the current site and Render bot unchanged during this observation point.
9. Verify Checkout `/health`, version ID, Stripe webhook signature handling with a provider test event, one idempotent duplicate delivery, Supabase event persistence, and Discord no-op/reconciliation behavior. Do not create a real transaction without the separately recorded acceptance authorization.
10. Deploy the public site candidate from the same reviewed source using `npm run build:site`; confirm its production Checkout origin, then run `npm run smoke:production`.
11. Deploy the Render bot/pick candidate only if included in the approved scope. Verify `DATABASE_URL`, `AUDIT_DATABASE_REQUIRED=true`, persistent `PICK_LOG_PATH`, Luna configuration, two-call collection cap, and both public-X publishing controls before startup.
12. Deploy the Publisher candidate only if included. Verify D1/KV bindings, health, current-pick shape, and an audited non-public request before outbound publication is enabled.
13. With separate owner authorization, run one production acceptance member through exact price/renewal disclosure, payment, Discord link/role, portal, cancellation, Supabase/webhook audit, and expected terminal removal. Record/refund only according to the approved policy; this document does not authorize money movement.
14. Reconcile Stripe ↔ Supabase ↔ Discord, run all five production smoke checks, inspect failed/retrying webhook events, and record the candidate as accepted or roll it back.
15. Hold the first invitation wave while Zakai monitors for two staffed hours. Do not advance from 5 to 15 members until the Wave A closeout is signed.

### Before any production deployment

Record in the deployment ticket:

- source commit and test count/result;
- current and candidate Cloudflare Worker version IDs for checkout, site, and publisher;
- current Render deploy/commit;
- Supabase migration plan and backup/recovery evidence;
- production secret **names** and non-secret binding IDs, never values;
- acceptance tester, support coverage, smoke commands, rollback owner, and Zakai's action-time approval.

### Rollback triggers

Rollback immediately for a wrong production origin/account binding, invalid webhook signatures after configuration is checked, duplicate charges/subscriptions caused by the release, broad grant/removal of Discord access, failure to persist membership/audit state, exposed secret/customer data, or a reproducible P0/P1 introduced by the candidate version.

### Checkout Worker rollback

1. Stop enrollment and record the candidate/current version IDs.
2. In Cloudflare, select `kobes-betting-hub-checkout` → Deployments and roll back traffic to the recorded previous known-good version. Do not copy staging variables or secrets into production.
3. Confirm `/health` returns `ok: true` and the expected restored version ID.
4. Inspect Stripe webhook deliveries during the incident window. Retry only failed events after the restored Worker and Supabase are healthy; duplicate event IDs must be harmless.
5. Run reconciliation and compare every incident-window Stripe subscription to Supabase and Discord.
6. Keep enrollment closed until Zakai signs off on the reconciled result.

### Static site rollback

1. If copy/links are unsafe, remove invitations and record the affected site Worker version/commit.
2. Restore the previous known-good Cloudflare static Worker deployment or revert the bad source commit through the normal reviewed `main` workflow. Build with `npm run build:site`; do not hand-edit `.public-site`.
3. Confirm join, membership, cancel, support, Terms, Privacy, FAQ, and Free Pick routes on mobile and desktop.
4. Run `npm run smoke:production` and save the five-check result.

### Render bot/pick pipeline rollback

1. Keep source-derived public publishing disabled. If official-post integrity is affected, pause the Render worker or the failing publication path after recording its deploy/commit and current queue state.
2. Restore the last known-good Render deployment/commit through Render's deployment history.
3. Confirm the persistent disk and canonical `PICK_LOG_PATH` remain intact; never replace the production ledger with the repository sample.
4. Start the worker, confirm database-required audit startup and Discord login, then run only a private approval test.
5. Reconcile pending approval cards, publication attempts, grades, and recaps before any public post resumes.

### Publisher Worker rollback

1. Pause outbound X/Free Pick publication affected by the defect; preserve D1/KV audit/current-pick state.
2. Restore the recorded prior `bettinghub-publisher` Worker version without deleting D1 or KV data.
3. Confirm `/health`, current Free Pick API shape, and D1 audit writes using a non-public controlled test.
4. Run the production smoke checks. Resume public publication only after the canonical Discord record and website/X payload are identical and approved.

### Database rollback rule

Migrations `007` and `008` are additive security/schema changes; any newer billing-control migration must be reviewed for the same rollback assumption before production. Do **not** drop columns, tables, grants, audit rows, or membership records during an application rollback. Roll back application traffic first, preserve the additive schema, and use the verified database recovery mechanism only for demonstrated data corruption with separate Zakai approval.

## Support launch desk

Until an approved ticket tool exists, use one restricted support log with the required fields in `docs/OPERATIONS_FOUNDATION.md`. Never use public Discord for personal billing details.

### Member response sequence

1. Acknowledge with ticket ID, issue summary, owner, and next update time.
2. Verify via checkout email/provider-safe method and provider references; do not accept a screenshot alone.
3. Classify P0–P3 and assign the due time.
4. Follow `docs/ISSUE_PLAYBOOKS.md`; use Stripe-hosted pages for billing/payment-method actions.
5. Confirm action/effective date/member next step in writing.
6. Reconcile provider, Supabase, and Discord state before closing.

### Minimum first-wave staffing

- Zakai is online for the invitation window and the next two staffed hours.
- A named backup can pause invitations/public posting and escalate to Zakai. **Unresolved: backup name.**
- Kobe or a named pick delegate is available for exact-copy approval; support may not invent/alter a pick.
- The official support channel/email is monitored. **Unresolved: public address and staffed hours.**

## Gate 3 — Public-launch requirements

Do not convert the beta into a broad public launch merely because 20–30 people joined successfully. Public launch requires:

- [ ] All beta success criteria pass through a real renewal/trial conversion and real period-end cancellation.
- [ ] No unresolved P0/P1; every prior P0/P1 has a root cause and prevention action.
- [ ] Automated external alerts cover paid-without-access and reconciliation failures; one operator manually watching dashboards is no longer the control.
- [ ] Server-side checkout abuse controls are enabled and tested without blocking valid purchases.
- [ ] Failed-payment recovery, mandatory refund exceptions, and disputes update membership/access according to the approved policy and have end-to-end evidence.
- [ ] Production migrations/deployments have a clean audit trail, known-good rollback versions, and a completed recovery drill.
- [ ] Effective legal/privacy/support documents are owner/legal approved for every served jurisdiction.
- [ ] A backup technical/billing operator is trained and has least-privilege access plus MFA.
- [ ] Support hours, escalation, privacy requests, gambling-harm handling, and outage messaging have been drilled.
- [ ] Browser/mobile matrix passes in current Chrome, Safari, and one other supported browser.
- [ ] The pick workflow has at least three clean operating days with complete approval, publication, grading/correction, and recap trails.
- [ ] Source-reuse rights are `CONFIRMED` before any source-derived material is published; monitoring approval alone is insufficient.
- [ ] API/provider spend limits and alerts are set, OpenAI usage reconciles to the internal ledger, and no unexplained request spike remains.
- [ ] Marketing/performance claims are backed by dated records, methodology, units/ROI context, and responsible-gambling disclosure.
- [ ] Capacity and operating budget are approved for the planned audience.
- [ ] Zakai records final `PUBLIC LAUNCH GO`, date/time/timezone, source commit, deployed versions, owner coverage, and accepted residual risks.

## Work that can wait until after the limited beta

These do not block Wave A when all Gate 1 items are complete:

- polished internal KPI dashboard, provided every beta account is reconciled manually;
- a 100-post alternate-model benchmark;
- paid marketing, affiliate campaigns, and broader source activation;
- nonessential social automation;
- additional sport-specific Discord channels;
- convenience automation that does not improve billing, entitlement, audit, safety, or support correctness.

They do not automatically become optional for public launch. Alerting, abuse controls, backup coverage, legal approval, and proven billing exception behavior are public-launch gates.

## Evidence template

Use one row per test, deployment, member activation, reconciliation exception, or incident. Store only non-secret references.

| Field | Value |
| --- | --- |
| Record ID | `BETA-YYYYMMDD-###` / `TEST-...` / `INC-...` |
| UTC timestamp | |
| Environment | staging / production |
| Actor/owner | |
| Source commit | |
| Runtime version/deployment | |
| Stripe customer/subscription/event references | masked/non-secret identifiers only |
| Supabase event/audit references | |
| Discord user/role result | stable ID + granted/removed/no-link; no OAuth token |
| Expected result | |
| Actual result | |
| Status | PASS / FAIL / BLOCKED / ACCEPTED RISK |
| Defect/incident link | |
| Follow-up owner/due time | |
| Zakai approval | required for production change/go-no-go |
