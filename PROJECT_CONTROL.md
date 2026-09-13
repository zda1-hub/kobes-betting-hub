# Kobe's Betting Hub — Project Control File

**Status:** Active production system with unresolved operational and compliance risks

**Last verified:** 2026-09-13 10:36 MST

**Production runtime change set:** repository/Render auto-deploy from `main`; Checkout Worker `ae9e52fb-c95b-46c5-8008-8ecaca8e2334`; Publisher Worker `33bdf3f7-f0aa-4d8b-b133-9b0ec2212365`; public-site Worker `0f79cda2-fc03-4382-8cf6-98a7acce08b6`

**Control-file owner:** Zakai Martin

**Business/content approver:** Kobe

**Technical owner:** Zakai Martin

**Billing/support owner:** Zakai Martin

**Technical/billing account email:** themartinventures@gmail.com

**Final production approver:** Zakai Martin

This is the authoritative project brain for humans and coding agents. Read this file before changing the project. Update it whenever production state, ownership, architecture, costs, risks, or priorities change. The other Markdown files contain detailed playbooks; when they conflict with this file, this file wins until the conflict is resolved.

The owners do not need to read every repository document. The operating chat should use this file to answer: what is live, what talks to what, what costs money, what failed, what is next, and which decisions require an owner.

## Executive state

Kobe's Betting Hub is a paid sports-pick membership centered on Discord. It also has a public website, Stripe checkout, Discord entitlement automation, a cash referral program, a monitored X-source pick pipeline, human approval in Discord, result grading through ESPN, recap email queues, a public Free Pick page, and optional X publishing.

The system is not a single application. It currently spans GitHub, Cloudflare Workers/D1/KV, Render, Discord, Stripe, X, OpenAI, ESPN, Gmail Apps Script, and Supabase Postgres. Supabase is the shared membership and pick/API audit ledger. OpenAI provider reconciliation is live through a dedicated read-only organization Admin key; Apps Script and some SDK-internal calls still need equivalent records before the ledger is literally exhaustive.

### Current controlled-test checkpoint

- One Stripe **test-mode** starter membership was created with client request ID `538bb01e-2bd6-4774-bacb-73070bd923cb` and Checkout Session `cs_test_b1CVOAryEQbWLUTGnKOcKe9lZruQwApLX4C9cxu9nKm6Huw9JACjGp8kwQ`. It charged test funds only: `$10` at checkout, with `$32.99/month` scheduled after the seven-day test trial. Do not create a replacement session; resume this one.
- The first return exposed a staging-isolation defect: Checkout success URLs were hard-coded to production. No production Discord endpoint was invoked. The Worker now uses a validated staging `SITE_ORIGIN`, permits the staging browser origin, and fails closed rather than returning to production.
- The dedicated test identity `832944927884312606` completed Discord OAuth, guild join, Stripe-to-Discord linking, role grant, authenticated Customer Portal entry, and owner-authorized cancellation at period end. The original test subscription `sub_1UF8Y4E6p9BmPii37J9VhpeS` was then canceled in test mode; terminal webhook `evt_1UFAQCE6p9BmPii3yw1gVYX1` is `PROCESSED/ROLE_REMOVED`, Supabase stores `canceled`, and the Discord role DELETE returned HTTP `204`.
- Fresh test clock `clock_1UFAPBE6p9BmPii34X93rbeb` created customer `cus_VFfml7z9hBMSMK` and subscription `sub_1UFATvE6p9BmPii3SBESa2O0`. It proved `ROLE_GRANTED`, a single `$8.25` renewal, return to `$32.99`, no-refund period-end cancellation, Supabase `canceled`, terminal webhook `evt_1UFFqTE6p9BmPii3UWYNvLwv` as `PROCESSED/ROLE_REMOVED`, and Discord DELETE HTTP `204`. The staging customer mapping was reassigned only after the old subscription was terminal, and the reassignment was written as `STAGING_TEST_IDENTITY_REASSIGNED`.
- The lifecycle exposed and fixed three staging defects: missing Supabase REST grants, Stripe Basil's item-level subscription periods, and lack of durable membership blocks for refunds/disputes. Migrations `007`, `008`, and additive migration `009_membership_entitlement_blocks` are applied only to staging. Exact source commit `e31e234966aae3b721bc75dc0c2853632a9d7110` is deployed as Checkout Worker `531ee711-60a1-4429-9147-6595ed13eb5a`; it is healthy, never overwrites entitlement-block fields during ordinary subscription persistence, handles `invoice.payment_failed`, and records/removes access for refund/dispute exceptions. Stripe staging destination `we_1UF61QE6p9BmPii30UGuNEMO` now listens to eight events. The full local suite passes 162/162.
- Stripe test coupon `VJxmdXFz` (`KBH 75% Retention — One Invoice`) is 75% off once and is configured in Customer Portal configuration `bpc_1UF9gPE6p9BmPii3pI6NPPAn`. Test invoice `in_1UFFj1E6p9BmPii37FBFrhWg` paid `$8.25`, after which the coupon disappeared and the next invoice preview returned to `$32.99`. The launch candidate no longer treats Stripe `duration=once` as a per-member limit: it provisions a unique 75%-off coupon with `max_redemptions=1` for each eligible customer, stores the coupon/redemption marker in Stripe customer metadata, and uses a fresh portal-session idempotency key. Automated tests pass; one isolated staging repeat-attempt acceptance remains before production promotion. No real payment, production write, or production Discord mutation occurred.
- The independent referral sandbox completed its isolated Stripe test payout lifecycle on branch `codex/referral-sandbox` at commit `ff58ce8` (integrated here as `430967d`). Supabase project `ctqmksvfqrysomvckqrm` was limited to `referral_sandbox_*` tables; Stripe sandbox account `acct_1UF5ApCiPGuWM4jq` sent a test `$1.50` reward as outbound payment `obp_test_65VOWHVWOH4OAM8gbld16VOT8BMtSQuwWyDk7pe56muI2S`. Production was untouched. This account is distinct from membership staging Stripe account `acct_1U5a7sE6p9BmPii3`.

### What is definitely live

- `https://kobesbettinghub.com` is served by the Cloudflare Worker `kobes-betting-hub` from a shared repository-generated static manifest. The same manifest is used by the GitHub Pages workflow so the two deployment paths cannot silently omit different files.
- Cloudflare's full cache was purged and the stale membership page was replaced. `cancel`, `cancel.html`, and `cancel.js` all return `200` on the custom domain.
- Membership checkout is enabled. Offers shown publicly are `$10 / 7 days` or `2 days free`, followed by `$32.99/month` until canceled.
- The checkout Cloudflare Worker is reachable and reports healthy. It now also runs a daily 09:15 Arizona Stripe-to-Supabase-to-Discord reconciliation and records success/failure membership events.
- Checkout hardening prevents an existing Stripe membership or Discord identity from being silently relinked through a replayed completion URL, accepts valid Stripe signatures during secret rotation, reduces portal OAuth to `identify`, and writes exact Cloudflare Worker version IDs into API audit events. Browser retries now reuse a validated UUID as Stripe's `Idempotency-Key`, preventing duplicate Checkout Sessions from ambiguous repeat submissions.
- Stripe Checkout creates subscriptions. After payment/trial confirmation, the customer connects Discord through OAuth and receives the configured paid-member role.
- Stripe subscription create/update/delete webhooks maintain the Supabase membership state and reconcile Discord access. The production destination has four core membership event classes within seven total configured events, including Checkout completion; `invoice.payment_failed` is staging-only until an approved production promotion.
- The US-only member referral flow is live at `https://kobesbettinghub.com/refer`. Discord OAuth provides the stable member identity; Stripe remains the payment and payout authority. Referral links expose only the two-day trial followed by `$32.99/month`. A qualifying first `$32.99` invoice starts a seven-day hold, after which the scheduled Worker can send the stored `$10` cash reward through Stripe Global Payouts. Self-referrals, refunds, disputes, missing referred-member identity, and incomplete payout onboarding are held or blocked. No live reward has been sent as part of deployment testing.
- Stripe restricted key `Kobe Referral Payouts` is stored only as encrypted Cloudflare secret `STRIPE_GLOBAL_PAYOUTS_KEY`. The production destination listens to seven total events: four core membership events plus `invoice.paid`, `charge.refunded`, and `charge.dispute.created` for referral qualification and reversal controls. `invoice.payment_failed` is not yet enabled in production.
- A Render background worker runs the Discord bot and X collector from `main`, with a 1 GB persistent disk at `/var/data`.
- The production X collector is enabled for 38 configured sources. Its effective interval is 15 minutes during the configured daily Arizona window.
- The Render environment and repository are configured for `gpt-5.6-luna` with bounded output, no reasoning, versioned pricing metadata, and reusable audited extractions.
- The free Supabase project `kobe betting hub` is healthy. Migrations `001`–`006` are live, including the API ledger, normalized membership state, referral profiles/rewards/events/auth sessions, and the `$10` default for new referral rewards. Production verification found eight durable API events immediately after the original cutover. The Checkout Worker uses a dedicated server secret; Render uses the encrypted session-pooler connection with fail-closed audit enforcement. A first 48-hour OpenAI import wrote 14 hourly usage rows and three daily cost rows. The migration sequence preserves the initial project-only cost rows under the explicit `openai_costs_api_unscoped` label and preserves any already-recorded `$20` referral obligation while new rewards use `$10`.
- The publisher Cloudflare Worker reports ready, connected to X, and configured with free-tier KV Free Pick media storage. All five outbound X media/post/token call paths now append redacted, immutable D1 audit rows with status, latency, provider request ID, hashes, trigger, and Worker version; no token, OAuth code, tweet text, media, or raw response is retained.
- `node scripts/production-smoke.mjs` performs five credential-free read-only checks covering Checkout health, Publisher health, current Free Pick shape, public Free Pick HTML, and the client asset. The first post-deploy run correctly detected KV propagation lag; the retry passed all five checks and the live page visibly rendered the Bijan pick.
- At 09:08 MST on 2026-09-13, private production `/hub-status` reported `Workflow: ready`, pick log configured, required database audit connected, ESPN automatic grading on, and recap email connected. It also correctly reported zero Free Picks and zero pending Free Pick results for the new day; the X monitor was outside its active window. The 09:04 MST production smoke passed 5/5.
- The launch candidate includes a production-locked migration command for exactly `007`–`009`. It defaults to a read-only plan, accepts only Supabase project `mpajyubbnnsdpgdizvht` over encrypted transport, pins migration hashes, requires an exact project-bound confirmation for apply mode, uses one advisory-locked transaction, verifies schema/RLS/grants before commit, and sanitizes output. It has not connected to or changed production.
- The customer-specific retention guard is deployed only to isolated Checkout staging. Current Worker version `4fe6301a-307c-446b-87ee-7a772c38bbfb` is healthy; an authenticated second cancellation review on the legacy test customer showed no repeat offer after its pre-deployment fixture marker was backfilled. Outbound Discord role calls now write member-attributed API rows; the acceptance probe returned HTTP `204`. Production is unchanged.
- At 09:40 MST, a read-only production promotion check confirmed Checkout Worker `ae9e52fb-c95b-46c5-8008-8ecaca8e2334` remains healthy and all seven expected encrypted secret names are present. The candidate production dry run compiled without deployment. Production retention configuration IDs, the database recovery checkpoint/migration apply, and the new Worker deployment remain intentionally absent pending final approval.
- At 10:19 MST, the first two production X-monitor cycles proved that the 12-way intake scanner is fast but the downstream queue is not launch-ready. The 10:00/10:15 cycles produced 853 distinct deferred posts and 994 `MODEL_CALL_LIMIT_REACHED` events under the two-calls-per-run guard; only four Luna runs occurred (4.311 s average), and zero approval cards were created. Two extracted plays passed event gates but were correctly held for insufficient breakdown evidence. See `docs/X_MONITOR_LATENCY_AUDIT_2026-09-13.md`; no production write occurred during the audit.
- Discord `#daily-free-play` contains canonical record `20260912-148-X` (Bijan Robinson over 29.5 receiving yards, -140). A dedicated website-publication credential is now encrypted independently in Render and Cloudflare. The owner-approved text-only synchronization returned `201`, the KV current endpoint returned `200`, and the live public page rendered the same Bijan selection. No Discord or X action occurred during this repair.
- A controlled manual audit checked one recent `@CappersUSA` X candidate through Luna with a one-candidate cap and `--no-discord`. It was held as `SOURCE_EXTRACTED`; no member or Discord publication occurred.
- Commit `f9b2141` is deployed on Render. It contains the exact Bijan production formatting regression fixture and formatter corrections for duplicated `YDs`/`Yards` terms, a repeated shorthand selection bullet, and the dangling URL-dependent clause.

Observed output-quality evidence: the 2026-09-12 Discord screenshot shows a published Bijan Robinson card with duplicated pick terms in the title/first bullet and an incomplete sentence ending in “including 82 yards at”. That exact case is now a passing regression fixture: future rendering collapses `YDs`/`Yards` duplicates, removes the repeated selection bullet, and trims the broken URL-dependent clause. A successful transport remains insufficient proof of a correct card.

### What is not production-ready even though parts are live

- The public Terms and Privacy drafts now describe the paid membership, Discord identity, Stripe billing, and referral data flow, but they are still explicitly drafts and are not owner/counsel approved.
- The owner selected an all-sales-final membership policy, except where applicable law, card-network rules, or a written owner exception requires otherwise. Cancellation stops future renewal but does not retroactively refund the starter payment, current month, or partial period. Legal entity, jurisdiction, official support/privacy contact, and counsel approval remain missing.
- The owner selected a one-time cancellation-retention offer: 75% off the next `$32.99` monthly invoice (approximately `$8.25`), then automatic return to `$32.99/month` until canceled. The discounted invoice, return to full price, and terminal cancellation passed in staging. The launch candidate now uses a customer-specific single-redemption coupon and durable redemption marker; customers may decline without obstruction. A second-attempt staging acceptance must confirm the guard before production promotion.
- Membership persistence now uses Supabase for normalized customer/subscription state and signed webhook event idempotency. Stripe remains the payment and subscription source of truth; Discord role state is the derived entitlement.
- The Checkout Worker now authenticates returning members with Discord OAuth and then creates a Stripe Customer Portal session. Discord proves which linked member is acting; Stripe authenticates and performs billing, recurring subscription, invoices, payment-method changes, and cancellation.
- All 38 X sources are approved for monitoring only and are marked `PENDING_SOURCE_TERMS`; none is marked `CONFIRMED` for reuse/publication. `X_SOURCE_PUBLISHING_ENABLED=false` now enforces that owner decision in production.
- Render has a pooled `DATABASE_URL` and `AUDIT_DATABASE_REQUIRED=true`. The audit-aware worker completed database initialization, registered Discord commands, and logged in as Kobe Bot after deployment.
- Provider calls from the Node collector/bot and Checkout Worker are written to Supabase with endpoint class, payload hashes, outcome, latency, provider request ID where available, and workflow references. Apps Script and Discord SDK-internal traffic remain separate gaps.
- The OpenAI reconciliation workflow is isolated in GitHub Actions with encrypted production Supabase and read-only Admin credentials. Final key `key_Y50uH3VCo3mzNJM5` expires 2026-12-11 and is not present on Render. The original key and both replacement attempts whose values appeared in browser accessibility output are revoked. Manual GitHub run `34736914218` completed successfully and wrote a correlated three-call audit operation to Supabase.
- Marketing is intentionally a future workstream, not the current priority.

### Isolated membership staging state

- Supabase project `Kobe Betting Hub Staging` (`ctqmksvfqrysomvckqrm`, East US / Ohio) is separate from production project `mpajyubbnnsdpgdizvht`. Repository migrations `001`–`009` are recorded; all protected tables retain RLS; `anon` and `authenticated` have zero table grants; and the server-only `service_role` has only the REST permissions required by the backend. Migration `009` adds durable entitlement-block fields without deleting or rewriting prior rows.
- Supabase server credential `kbh_staging_worker` is installed only as encrypted Cloudflare staging secret `SUPABASE_SECRET_KEY`. Its value is not committed or retained in the repository; the owner does not need a local copy.
- Checkout Worker `kobes-betting-hub-checkout-staging` is deployed at `https://kobes-betting-hub-checkout-staging.kobedirwin.workers.dev`. Current version `4fe6301a-307c-446b-87ee-7a772c38bbfb` includes Stripe Basil compatibility, race-safe durable refund/dispute entitlement blocking, failed-payment auditing, the repeat-offer guard, and member-attributed outbound Discord audit context. Health returned `200`; all six expected encrypted secret names remain present; cron is disabled; the isolated Discord guild/active-role bindings are present; `STRIPE_GLOBAL_PAYOUTS_KEY` is intentionally absent.
- Static site Worker `kobes-betting-hub-staging` is deployed at `https://kobes-betting-hub-staging.kobedirwin.workers.dev`, version `1ce02b72-1f87-460e-a6b5-1187408af831`. Its generated membership pages point only to the staging Checkout Worker, while local generated output was restored to production configuration after deployment.
- Stripe test products already present in the intended `Kobesbettinghub` test account are pinned in staging configuration: monthly product `prod_V8mOKsNfRQSQbk` / price `price_1U8UpxE6p9BmPii3GoBjAXII` ($32.99/month) and starter product `prod_V8mOyRBS66iOwo` / price `price_1U8UpLE6p9BmPii3ErYC4FPr` ($10 one-time). Every restricted-key value that surfaced in browser output was immediately rotated with expiration set to `now`; the final replacement was installed only as encrypted Cloudflare staging secret `STRIPE_SECRET_KEY`. Correct-account event destination `we_1UF61QE6p9BmPii30UGuNEMO` sends eight membership/refund/dispute/failed-payment events to the staging Worker, and its signing secret is encrypted as `STRIPE_WEBHOOK_SECRET`. Coupon `VJxmdXFz` is attached to the test Customer Portal as a 75%-off-once cancellation offer. The unrelated `Kobe Referral Sandbox` account is out of scope.
- Discord staging application `Kobe Betting Hub Staging` (`1548556799513333770`) has two intentional staging callbacks: the membership callback `https://kobes-betting-hub-checkout-staging.kobedirwin.workers.dev/discord/callback` and the referral-sandbox callback. Its final client secret, bot token, and independent OAuth-state secret are encrypted in Cloudflare staging; no secret value is committed. Test guild `Kobe Betting Hub Staging` (`1548568770123927562`) contains the authorized bot with `Manage Roles`. Active role `KBH Staging Member Active` (`1548578573177061416`) is below the bot and is the only member role bound to the Worker. Test user `832944927884312606` has now demonstrated both grant and terminal removal through audited HTTP `204` calls, then a fresh grant for the new test-clock subscription. No real payment, referral payout from the membership account, or production write occurred.

## System map

```text
Visitor
  └─> kobesbettinghub.com (Cloudflare static Worker built from the repository)
       ├─> Checkout Worker ─> Stripe Checkout / subscriptions
       │                     └─> Discord OAuth + paid-member role
       ├─> Referral page ─> Discord OAuth identity
       │                  ├─> Stripe recipient onboarding / cash payout
       │                  └─> Supabase referral reward and event ledger
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
| Referral cash rewards | Checkout Worker + Stripe Global Payouts | `refer.html`, `referral.js`, `cloudflare/kobes-checkout-worker.js` | Supabase reward/event ledger + Stripe recipient/outbound-payment records | Live; no-money smoke only, first controlled full lifecycle still required |
| Member access | Discord | Checkout Worker OAuth/role calls | Stripe status governs Discord role | Live with daily reconciliation; full test-identity lifecycle still required |
| Discord operations | Render Node worker | `bot/index.js`, `bot/commands.js` | Discord messages + Supabase workflow events + local logs | Live on `f9b2141` |
| X monitoring | Render Node worker | `pipeline/collect-x.js`, `data/twitter-sources.json` | source roster + persistent cursor | Live; cursor/dedupe root is on `/var/data` |
| Model extraction | OpenAI Responses API | `pipeline/enrich-pick.js` | response/request IDs + structured output | Luna + extraction audit live; next-window production evidence pending |
| Pick approval | private Discord channel | `bot/lib/source-review.js`, `bot/index.js` | Kobe button action | Live |
| Pick publication | Discord | `bot/index.js` | Discord message ID + audit event | Live |
| Pick log | Render persistent disk | `bot/lib/pick-log.js` | `/var/data/pick-log.csv` | Live, single-host CSV |
| Pick/member/referral audit DB | Supabase Postgres | `pipeline/audit-store.js`, `pipeline/migrations/` | Supabase Postgres | Migrations `001`–`006` live; Worker and Render connected |
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

Remaining controls after the production cutover: unmatched-account recovery, an external alert path for reconciliation/role failures, support tickets, required refund/chargeback exception and restoration rules, the fresh retention-clock terminal sequence, and an approved public policy. The original staging subscription already proved terminal role removal. Daily Stripe-to-Supabase-to-Discord reconciliation is deployed.

### Cash referrals

1. An active US member opens `refer.html` and signs in with the Discord account linked to membership; Discord's stable user ID is the identity, not the editable username.
2. The Worker creates or retrieves a Supabase referral profile and returns a personal `KBH-...` link.
3. The referrer completes Stripe-hosted recipient and payout-method onboarding; bank details are entered directly into Stripe and are not stored by the website or Supabase.
4. A new customer using that link can choose only the two-day trial followed by the `$32.99/month` subscription. Stripe metadata retains the referral code and referrer's Discord user ID.
5. A successful first `$32.99` invoice creates or advances one immutable reward and sets eligibility seven days later.
6. Refund and dispute webhooks void an unpaid reward or flag an already-sent reward for review. The scheduled Worker rechecks the invoice, member identities, recipient capability, and payout method before sending.
7. Stripe creates the outbound payment with a reward-specific idempotency key; Supabase stores status changes and the non-secret outbound-payment identifier. New rewards are `$10`; any previously stored `$20` obligation remains payable at its recorded amount.

Acceptance still required: a controlled Stripe/Discord test identity must complete attribution, first paid invoice, hold expiry, recipient onboarding, one test-mode payout, refund/dispute reversal behavior, and ledger reconciliation. Production smoke deliberately sent no money.

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
| Browser | Checkout Worker `/referrals/login` and `/referrals/onboard` | Member requests a referral link or payout setup | Cloudflare/Discord/Stripe API quota | Supabase `api_call_events`, `referral_profiles`, `referral_auth_sessions`, and `referral_events` | Remove payout key or disable referral routes in Worker |
| Checkout Worker | Stripe `/v1/checkout/sessions` | New checkout | Stripe fees after payment | Supabase `api_call_events` + Stripe | Remove/disable prices or Worker route |
| Checkout Worker | Stripe session/subscription GET | Discord connect, membership management, daily reconciliation | Stripe API quota | Supabase `api_call_events` + Stripe | Disable routes/cron |
| Checkout Worker | Stripe subscription update | retention/cancel | Business revenue impact | Supabase `api_call_events` + Stripe | Disable retention/cancel routes |
| Checkout Worker | Stripe v2 recipient/account-link/payout-method/outbound-payment APIs | Referral onboarding and eligible scheduled reward | Cash outflow plus Stripe quota/fees | Supabase API audit + referral event/reward rows + Stripe | Remove `STRIPE_GLOBAL_PAYOUTS_KEY`; pause cron/code; policy limits still required |
| Stripe | Checkout Worker `/stripe-webhook` | checkout, subscription, invoice, refund, and dispute events | Cloudflare requests | Stripe delivery log + idempotent Supabase webhook/referral events | Stripe webhook setting |
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

- The OpenAI dashboard screenshot showed **3,046 Responses and Chat Completions requests on 2026-09-12**, plus 6,121 requests, 38,006,461 input tokens, and $76.91 total spend for the selected seven-day account view.
- The organization Usage API now confirms that all 3,046 requests were made between 10:00 and 16:00 Arizona time by project `proj_8DxPJSInvFUVEZgs8KMld4rz` (`Default project`), API key `key_TDES2zUP3W9UZaej` (`Kobe Pick Monitor`), and model `gpt-5-mini-2025-08-07`.
- Those requests consumed 5,519,913 input tokens, including 1,650,176 cached input tokens, and 7,085,809 output tokens. That is about 1,812 input and 2,326 output tokens per request.
- The first Costs API import attributes $16.10030665 to that project for the UTC 2026-09-12 daily bucket. That initial import was grouped by project/day; the hardened sync now filters and groups new cost snapshots by the expected project and API key. The Usage API shows no other project, key, or model usage in the imported incident hours.
- The controlled post-cutover test is separate: one `gpt-5.6-luna` request at 18:00 Arizona used 1,846 input and 554 output tokens. Its internal extraction record estimates $0.001034; the provider's UTC 2026-09-13 project cost bucket currently reports $0.00112615.
- The first 48-hour reconciliation imported 14 hourly usage rows and three daily cost rows into Supabase. The `/organization/usage/completions`, `/organization/costs`, project-list, and project-key-list requests were themselves durably audited with successful response metadata and no secret values.
- There were **21 pushes to `main` on 2026-09-12**. Each push triggered both GitHub Pages deployment and Render auto-deployment/restart.
- Production monitors 38 X sources.
- At incident commit `f7711bb`, the collector stored `state.json` under the application checkout rather than the Render persistent disk.
- On restart, a missing state makes every source a daily catch-up: typically at least one X username lookup and one timeline request per source, plus pagination.
- Rejected/handled posts are remembered only in that state. Approval packets are durable, but rejected candidates can be rediscovered and re-sent to OpenAI after restarts.
- A normal five-hour window at 15-minute cadence is roughly 21 passes. With 38 sources, timeline polling alone is roughly 798 requests before pagination, restarts, username resolution, ESPN calls, Discord calls, and model extraction.

### Working diagnosis

Billing attribution is now conclusive: the incident came from the Kobe Pick Monitor key on the Default project and used the old GPT-5 Mini configuration. The six hourly buckets rose from 123 and 240 requests to 1,143 at noon Arizona, then 854, 629, and 57. Because the durable per-call database audit was deployed after the incident, the provider export cannot retroactively identify each source post. The strongest code-and-deployment diagnosis is repeated full-day rediscovery after frequent Render restarts while cursor/dedupe state was non-durable: each restart immediately collected, state was not saved until all 38 sources completed, all media posts could reach extraction before event rejection, and the old candidate cap limited accepted review packets rather than model calls. The old OpenAI path had no retry loop, so retries are not supported as the primary cause. This causal diagnosis is evidence-supported but not provable per request. The unexpectedly high 7.09 million output tokens also made output length a major cost driver; the old request set no output-token limit and always used high image detail, whereas Luna now runs with bounded output and no reasoning.

### Containment deployed

- Collector cursor/dedupe state now defaults beside the durable review queue.
- Render configuration now points `X_MONITORING_ROOT` to `/var/data/x-monitoring`.
- Routine weekly cleanup no longer deletes the spend-control cursor.
- The local Postgres audit implementation records OpenAI request ID, response ID, tokens, latency, prompt/model/pricing versions, status, error, payload hashes, and cost estimate.
- Identical successful source/model/prompt/input extractions can be reused instead of billed again once the audit database is active.
- Production hard stops are `50` OpenAI requests/day, `500`/month, `$1` estimated/day, and `$15` estimated/month. The pre-call guard stops before sending the next model request when any threshold is reached.
- The X collector now reserves from a concurrency-safe limit immediately before each OpenAI call. Production is configured for at most two new model calls per 15-minute collection run; cache hits and deterministic rejections do not consume the cap, and deferred candidates retain their old cursor for the next interval.
- Migration `004_api_call_ledger` is live and the ledger was verified with eight production ESPN calls immediately after cutover.
- Historical/superseded: the first read-only OpenAI Admin key was briefly stored as encrypted Render secret `OPENAI_ADMIN_KEY`; it was revoked and removed. The final read-only reconciliation key is isolated in GitHub Actions as described in the current architecture section and is not present on Render.
- `scripts/sync-openai-usage.mjs` imported the first 48-hour provider window into Supabase: 14 usage rows and three cost rows. The hardened sync preflights the expected project/key identity, filters and validates both datasets to that pair, fetches all provider data before database writes, and correlates every provider call under one operation ID. The reconciliation calls are recorded in `api_call_events`.

The incident is **contained and billing-attributed**. Final causal closure requires one normal monitoring window proving bounded production behavior in the durable per-call ledger.

### Closure record

1. **Complete:** provider usage is imported by hourly project/API key/model bucket with explicit Arizona/UTC interpretation.
2. **Complete:** the production pair is `Default project` / `Kobe Pick Monitor`; it accounts for the full 3,046-request dashboard anomaly.
3. **Partial:** deploy count, monitoring window, source count, and old state placement support the restart/redelivery diagnosis, but pre-cutover per-call evidence cannot be reconstructed.
4. **Complete:** request, token, and provider-billed project cost totals are separated above.
5. **Pending acceptance test:** observe a normal monitoring window under Luna, durable state, and hard limits; verify that model requests reconcile to durable extraction/API events with no unexplained traffic.

Detailed immutable reconciliation notes are in `docs/OPENAI_USAGE_RECONCILIATION_2026-09-12.md`.

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
| Secrets | Render/Cloudflare/GitHub/Apps Script settings | Critical | OpenAI Admin reconciliation key has a 90-day expiry; comprehensive cross-provider rotation schedule still missing |

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
| 1 | Cloudflare stale site | **Complete** | Full cache purge completed; custom-domain static Worker `0f79cda2-fc03-4382-8cf6-98a7acce08b6` and shared site manifest deployed; the live `/refer` page renders the `$10` offer and the production smoke passed all five credential-free checks. | Recheck after future public-site deployments and record the deployed Worker version. |
| 2 | Membership lifecycle | **Partial; retention, repeat guard, and terminal cancellation verified in staging** | Production membership controls remain untouched. Staging migration `009` is applied; Worker `4fe6301a-307c-446b-87ee-7a772c38bbfb` is healthy. Fresh clock `clock_1UFAPBE6p9BmPii34X93rbeb` proved role grant, paid `$8.25` invoice, return to `$32.99`, and no-refund terminal cancellation with Supabase `canceled`, `PROCESSED/ROLE_REMOVED`, and Discord DELETE `204`. An authenticated second review proved the customer-specific offer guard; an entitlement probe produced a member-attributed Discord PUT `204` audit row. | With action-time confirmation, cancel the active repeat-test subscription and advance its clock. Then run isolated external partial/full-refund, dispute creation/resolution, failed-payment/recovery, audited restoration, and referral fixtures. |
| 3 | Luna/X monitoring proof | **Complete for bounded private intake; daily operating proof still required** | Production `main` deployed the audited intake remediation. Render startup at 10:35 MST scanned 38 sources with 12 bounded workers, used exactly 6/6 permitted Luna calls, and reduced cap-deferred candidates from 476 to 85 (82%). The first remediated startup created one private review packet. `X_SOURCE_PUBLISHING_ENABLED=false` remains enforced. | During today's real pick window, prove one qualifying current pick reaches `#pick-approvals`, record its decision, and preserve the approval/publication trail. See `docs/X_MONITOR_LATENCY_AUDIT_2026-09-13.md`. |
| 4 | Durable API trail | **Partial / deployment acceptance pending** | Supabase migrations `001`–`006` are live; explicit Node and Checkout Worker calls write endpoint/outcome/latency/hash/workflow metadata; the staging entitlement probe now proves the outbound Discord role call is attributable to the affected member and returned `204`. Publisher Worker audits all outbound X calls. The current full suite passes 177/177. | Deploy the remaining audited Apps Script/Render paths, capture controlled external rows, then reconcile zero unclassified provider traffic for a controlled window. |
| 5 | Provider billing reconciliation | **Complete for isolated OpenAI automation** | The daily/manual GitHub Actions workflow has encrypted `DATABASE_URL` and final read-only key `key_Y50uH3VCo3mzNJM5`, pinned expected project/key IDs, and no Admin credential on Render. Run `34736914218` imported 14 usage and three cost rows. Supabase operation `39eb92c5-f391-47c5-ba4a-93b7f1bcf805` contains successful HTTP 200 key-preflight, Costs, and Usage calls. Original key `key_jtBdyNxNSPYbeNCZ` and exposed attempts `key_06qVlp80Cm0NUp9Z` / `key_toaVGldRCO1HXxOT` are inactive. | Merge and verify the prepared Node 24 Actions update, add equivalent X/Cloudflare billing exports where available, and prove one zero-unclassified controlled window. |
| 6 | Cost containment | **Complete for current beta limits** | Luna is active; durable X cursor/dedupe uses `/var/data`; generic media is filtered before the model; weak media-only intake is bounded per source; and production now permits six calls per run. Hard stops remain 50 requests/day, 500/month, $1/day, and $15/month. The observed cap increase adds about `$0.00196` per fully used cycle and at most about `$0.00392` today under the daily request ceiling. | Review the next full operating day for calls per approved pick, deferral age, and rejected-candidate reasons before considering any further cap change. |
| 7 | Free Pick mismatch | **Production text path complete; image path prepared locally** | A dedicated least-privilege credential is encrypted in Cloudflare and Render. Canonical pick `20260912-148-X` returned `201`, the current API and public page rendered it, and today's five-check production smoke passed. Local image work now carries an approved `/publish-pick` attachment into website/X publication, accepts only non-empty JPEG/PNG/WebP up to 5 MB, preserves exact bytes/type, prevents duplicate text-plus-image X posts, and reports partial delivery. The current 177-test suite covers the combined path. | Deliberately deploy, then use one controlled approved image to verify the Discord card, website image/media bytes, exactly one X post, and audit rows. The monitored-source approval UI still cannot add an image; the usable image workflow is private `/preview-pick` followed by manual `/publish-pick` to `#daily-free-play`. |
| 8 | Membership reconciliation | **Complete for scheduled control** | Checkout Worker `ae9e52fb-c95b-46c5-8008-8ecaca8e2334` runs Stripe → Supabase → Discord reconciliation plus eligible referral payout processing daily at `15 16 * * *` (09:15 Arizona) and records outcomes/failures. The payout processor uses the amount stored on each reward and a reward-specific Stripe idempotency key. The independent `$1.50` sandbox payout rail succeeded; it did not prove the live `$10` membership referral lifecycle. | Add an external alert destination for failed reconciliation/payouts, prove one mismatch repair, and complete the end-to-end `$10` membership referral lifecycle in test mode. |
| 9 | Legal/support operations | **Blocked on remaining owner/legal decisions** | Draft Terms, Privacy, support pages, and issue playbooks exist. The owner selected cancellation at period end, all sales final except legally/card-network-required or written exceptions, and a one-time 75%-off next-month retention offer before return to `$32.99/month`. Test coupon `VJxmdXFz` produced one `$8.25` invoice, returned to `$32.99`, and the authenticated repeat-attempt guard passed. The draft Terms remain unpublished and unapproved. | Supply the legal business identity/address, jurisdiction, support/privacy email, failed-payment grace rule, referral-program authority/termination language, tax reporting process, retention policy, backup operator, and legal approval; then publish timestamped policies. |

## Current backlog

### P0 — contain cost and prevent untraceable production behavior

- [x] Export the exact OpenAI hourly usage/cost data grouped by project, API key, and model; the full September 12 anomaly is attributable to the Kobe Pick Monitor key.
- [x] Deploy and verify the durable X cursor/dedupe path on the Render persistent disk.
- [x] Provision free Supabase Postgres and apply audit/membership schema migrations.
- [x] Securely connect pooled `DATABASE_URL` to Render and a dedicated Supabase server secret to the checkout Worker; verify fail-closed startup and database migration completion.
- [x] Deploy the API/extraction audit path and prove one X candidate through Luna in `--no-discord` mode.
- [ ] Capture external evidence for a controlled approved fixture through Discord publication, real ESPN grading, and recap delivery. The equivalent no-publication mocked lifecycle now passes locally.
- [x] Implement the OpenAI provider-usage reconciliation job for Usage grouped by project/key/model and Costs grouped by project/key.
- [x] Historical step: after explicit owner confirmation, create the first read-only 90-day organization Admin API key and run reconciliation; that key was later revoked, removed from Render, and replaced by a final GitHub-Actions-only credential.
- [ ] Add equivalent X/Cloudflare billing exports where available and automate OpenAI imports before the reconciliation key expires.
- [x] Set temporary OpenAI daily/monthly request and dollar hard stops; owner can revise the conservative caps after provider reconciliation.
- [x] Move the collection-run cap to the actual pre-provider boundary; production permits two new model calls per run and defers overflow without losing its cursor.
- [ ] Reduce production deploy churn: batch changes, use local tests/staging, and do not use `main` as the test loop.
- [x] Enforce the owner decision that the 38 sources are approved for monitoring only by setting `X_SOURCE_PUBLISHING_ENABLED=false`.
- [ ] Make public Terms/Privacy/support claims match the live paid product, with owner/legal approval.

### P1 — make memberships and operations reliable

- [x] Deploy the Discord-authenticated Stripe Customer Portal flow and retire Checkout Session-ID membership management.
- [x] Verify test-mode checkout creation and deploy daily Stripe-to-Discord entitlement reconciliation.
- [x] Make ambiguous browser retries reuse a validated Stripe Checkout idempotency key and retain that request ID in the audit event.
- [x] Complete the original test-identity lifecycle through terminal state: Checkout, Discord link, role grant, portal authentication, cancel at period end, Supabase `canceled`, terminal webhook `ROLE_REMOVED`, and Discord DELETE `204`.
- [ ] Complete one referral test-mode lifecycle: referrer Discord login, personal link, referred checkout, first paid invoice, seven-day hold, recipient onboarding, test outbound payment, refund/dispute path, and Supabase/Stripe audit reconciliation.
- [ ] Define the production referral cash reserve, maximum rewards per member/day/month, manual review threshold, fraud escalation, tax-information threshold/process, and pause switch before meaningful volume.
- [ ] Alert on failed webhook processing, Discord role grant/removal, unmatched payment, and duplicate access.
- [ ] Define and implement failed-payment grace, legally required refund/dispute exceptions, access restoration, and support escalation. The standard policy is all sales final except where required by law/card-network rules or written owner exception.
- [ ] Establish a shared support ticket system with named owner and response targets.
- [ ] Finish API audit coverage across Apps Script and Cloudflare. Checkout Worker and all Publisher outbound X call paths are live; commit `2b1fc85` prepares authenticated Apps Script request rows and Discord pre-response failure rows, with deployment and controlled production evidence still required.
- [ ] Verify real recap email, Trends email approval, and X delivery after deliberate deployment. Their local lifecycle and copy generation are tested; the text-only public Free Pick update is verified.
- [x] Finish the isolated staging environment. Separate Supabase, encrypted server credential, Checkout Worker, static-site Worker, Stripe webhook/portal, Discord MFA credentials, bot authorization, test guild, assignable member role, final non-exposed Stripe key, and obsolete-role cleanup are deployed/configured and recorded. The separate controlled lifecycle transaction remains a validation task, not an environment prerequisite.
- [ ] Merge the credential-free, read-only GitHub production-health workflow so the existing five checks run every 30 minutes; then add an owner alert destination plus bot heartbeat, stale-queue, and database-failure checks. The workflow and disclosure-drift tests are implemented locally and passing but are not active until merged to the default branch.

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

Database direction: the existing free Supabase Postgres project is the first production audit, membership, and referral ledger because the implemented Node client already uses PostgreSQL. Migrations `001`–`006` are live. Render connects through Supabase's free IPv4 session pooler. The checkout Worker uses a new-format Supabase server secret (`sb_secret_...`), with legacy service-role compatibility only; it must never expose either key to the public site. Cloudflare D1 remains appropriate for the existing Worker queues.

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
| 2026-09-12 | Deploy release `2075964`: Checkout Worker `0cf0d235-aa26-432c-8478-df6239efed48` validates/reuses browser request UUIDs as Stripe idempotency keys; Publisher Worker `33bdf3f7-f0aa-4d8b-b133-9b0ec2212365` audits every outbound X call path into append-only D1; public-site Worker `5fcc4678-1b88-4b09-8616-2203db498b1b` serves the matching client. | Zakai Martin | Live; 110/110 tests passed |
| 2026-09-12 | The new credential-free production smoke detected the expected cross-location KV propagation window immediately after restoring the approved item, then passed all five checks. A browser reload visibly confirmed the canonical Bijan pick. | Zakai Martin | Complete |
| 2026-09-12 | Owner confirmed a dedicated OpenAI organization Admin credential for billing reconciliation. `Kobe Betting Hub Usage Reconciliation` (non-secret ID `key_jtBdyNxNSPYbeNCZ`) was created read-only with expiry at 2026-12-11 19:12 MST, stored only as encrypted Render secret `OPENAI_ADMIN_KEY`, and verified through deployment `dep-daj0dcdg1s2s73900a9g`. | Zakai Martin | Complete |
| 2026-09-12 | The first 48-hour OpenAI reconciliation imported 14 hourly usage and three daily cost rows. It attributed all 3,046 September 12 requests to `Default project` / `Kobe Pick Monitor` / `gpt-5-mini-2025-08-07`; the UTC September 12 project cost was $16.10030665. | Zakai Martin | Complete; next normal-window causal acceptance test remains |
| 2026-09-12 | Deploy `2d73527` on Render as `dep-daj0ogu7bikc73abcsdg`: harden OpenAI reconciliation to preflight, filter, and validate the expected production project/key; fetch usage and costs before writes; correlate calls with one operation ID; and preserve the initial project-only cost rows under an explicit unscoped label. Operation `85814110-ae15-4ba9-8c7b-f62973360df1` recorded three successful HTTP 200 calls under the same commit. | Zakai Martin | Live and production-verified |
| 2026-09-12 | Replace the post-extraction approval-card cap with a concurrency-safe pre-provider reservation. Production now permits two new OpenAI extraction calls per 15-minute pass and retains deferred posts for the next interval. The worker restarted after the daily cutoff, so no X scan or Discord publication occurred during this rollout. | Zakai Martin | Live; 121/121 tests passed |
| 2026-09-12 | Credential-free post-deploy smoke passed Checkout health, Publisher health, current Free Pick API, public Free Pick page, and Free Pick client asset. | Zakai Martin | Complete |
| 2026-09-12 | Isolate OpenAI reconciliation in a daily/manual GitHub Actions workflow and install production `DATABASE_URL` plus final read-only Admin key `key_Y50uH3VCo3mzNJM5` as encrypted repository secrets. Original key `key_jtBdyNxNSPYbeNCZ` and exposed attempts `key_06qVlp80Cm0NUp9Z` / `key_toaVGldRCO1HXxOT` were revoked; the final value never entered Git or application output. Render no longer has `OPENAI_ADMIN_KEY`, and cleanup deploy `dep-daj22t3m8hqs73elspv0` is live. GitHub run `34736914218` returned 14 usage rows and three cost rows; Supabase operation `39eb92c5-f391-47c5-ba4a-93b7f1bcf805` recorded all three provider calls as HTTP 200 `SUCCEEDED`. | Zakai Martin | Complete |
| 2026-09-12 | Prepare Node 24 for the isolated GitHub reconciliation workflow and add redacted coverage for authenticated Apps Script Publisher requests plus Discord SDK failures that occur before an HTTP response. The combined local suite passed 132/132. | Zakai Martin | Code committed on `codex/audit-membership-foundation`; deployment acceptance pending |
| 2026-09-12 | Membership lifecycle acceptance must use separate Stripe test objects, Discord application/guild/role, Supabase data, Worker configuration, and browser URLs. Do not set `STRIPE_GLOBAL_PAYOUTS_KEY` for this run. Production-looking IDs or a non-test Stripe event are a stop condition. | Zakai Martin | Staging prerequisites are required before any test subscription or cancellation |
| 2026-09-12 | Launch a US-only `$10` cash referral program for the `$32.99/month` membership: referred customers receive only the two-day trial; rewards require the first successful `$32.99` invoice plus a seven-day hold. Discord user ID is the stable member identity, Stripe Checkout remains the subscription authority, Stripe Global Payouts handles recipient onboarding and cash delivery, and Supabase stores the reward/event trail. Refunds, disputes, duplicates, fraud, and self-referrals do not qualify. | Zakai Martin | Adopted and deployed; controlled full-lifecycle acceptance test remains |
| 2026-09-12 | Apply Supabase migrations `005_referral_cash_rewards` and `006_referral_reward_ten_dollars`; create the restricted Stripe key `Kobe Referral Payouts` and store it only as encrypted Cloudflare secret `STRIPE_GLOBAL_PAYOUTS_KEY`; expand Stripe webhook destination `we_1U7p1cE6p9BmPii3meFaIjH4` from four to seven events; deploy Checkout Worker `ae9e52fb-c95b-46c5-8008-8ecaca8e2334` and public-site Worker `0f79cda2-fc03-4382-8cf6-98a7acce08b6`. The suite passed 125/125, Worker health passed, the five-check production smoke passed, and `/refer` visibly serves the `$10` program. No live payout was sent. | Zakai Martin | Live; the independent `$1.50` payout rail is proven, but the end-to-end `$10` membership referral lifecycle and legal approval remain |
| 2026-09-12 | Create the isolated membership staging foundation: Supabase project `ctqmksvfqrysomvckqrm` with seven migrations, 19 RLS-protected tables, zero unsafe browser-role grants, and zero copied membership/API rows; encrypted server credential `kbh_staging_worker`; Checkout Worker `397e7ee3-e79c-4a18-9c32-393eae2a59b2`; static-site Worker `1ce02b72-1f87-460e-a6b5-1187408af831`. Staging cron is empty, payouts are unconfigured, checkout fails closed without test Stripe configuration, both health/configuration checks passed, and the full local suite passed 147/147. | Zakai Martin | Partial; Stripe and Discord test resources await authenticated account access |
| 2026-09-12 | Owner confirmed `themartinventures@gmail.com` as the Stripe/Discord technical and billing account. Reuse the existing intended-account Stripe test prices `price_1U8UpxE6p9BmPii3GoBjAXII` and `price_1U8UpLE6p9BmPii3ErYC4FPr`; create Discord staging app `1548556799513333770`; save the isolated callback; and encrypt a separate OAuth-state secret in Cloudflare staging. A first least-privilege Stripe restricted key surfaced in accessibility output and is quarantined pending secure replacement/revocation. Do not create staging resources under unrelated account `acct_1UF5ApCiPGuWM4jq`. | Zakai Martin | Partial; owner MFA and secure credential capture remain |
| 2026-09-12 | Complete secure staging credential capture after MFA: install replacement Stripe restricted key, Discord client secret and bot token, OAuth-state secret, Supabase server key, and Stripe webhook secret only as encrypted Cloudflare staging secrets. Create correct-account webhook `we_1UF61QE6p9BmPii30UGuNEMO`, verify test Customer Portal end-of-period cancellation, create Discord guild `1548568770123927562` and member role `1548568981906919464`, deploy Checkout Worker `4eb7f294-5558-406f-bbde-b27935c7da7c`, receive health `200`, and pass 146/146 tests. No checkout, charge, cancellation, role grant/removal, payout, or production write occurred. | Zakai Martin | Bot authorization and controlled lifecycle test pending explicit action-time confirmations |
| 2026-09-12 | Owner confirmed the staging bot permission and cleanup actions. Discord authorized the bot with `Manage Roles`; active role `1548578573177061416` is below the bot and is bound in Checkout Worker `105b81e4-f4d1-4cda-af7f-d41d6d51bde5`, whose health returned `200`. The incorrect cross-environment Discord callback was removed, leaving only the staging callback. The original exposed Stripe restricted key was expired. While verifying that deletion, the dashboard rendered the full v2 key in a browser screenshot; v2 is therefore quarantined pending a newly confirmed secure rotation. No checkout, charge, cancellation, member role mutation, payout, or production write occurred. | Zakai Martin | Final Stripe key rotation and controlled lifecycle test pending |
| 2026-09-12 | Owner confirmed final staging credential hygiene and obsolete-role deletion. Every restricted Stripe test key value surfaced by browser automation was rotated with immediate expiration; final replacement was installed only as encrypted Cloudflare staging `STRIPE_SECRET_KEY`, with active secret-change deployment `18b83c76-0f37-486d-aa09-bba6d73255d3`, and the clipboard was cleared. Exact obsolete Discord role `1548568981906919464` was verified as `KBH Staging Member` with zero members and deleted. Final guild roles retain the bot above active member role `1548578573177061416`. Cloudflare lists the six expected encrypted secret names, staging health returned `200`, and 146/146 tests passed. No Checkout Session, charge, subscription, cancellation, entitlement mutation, payout, or production write occurred. | Zakai Martin | Isolated staging complete; controlled test-identity lifecycle requires separate transaction-time confirmation |
| 2026-09-13 | Complete the owner-authorized membership staging lifecycle through cancel-at-period-end. Final Discord credentials were rotated and installed only as encrypted Cloudflare secrets. Test identity `832944927884312606` linked successfully, joined the staging guild, received role `1548578573177061416`, authenticated into the Stripe test Customer Portal, and scheduled subscription `sub_1UF8Y4E6p9BmPii37J9VhpeS` to end at `2026-09-20T08:14:02Z`. Supabase migrations `007` and `008` fixed backend REST grants and Stripe Basil cancellation/period persistence. Worker `30cea51e-5ef2-4d24-baae-f36565152726` processed the refresh webhook and recorded the correct `cancel_at`/period end. Production was untouched. | Zakai Martin | Superseded by the terminal verification in the next entry; adverse billing scenarios remain |
| 2026-09-13 | Close the original staging membership at terminal state and start the isolated test-clock acceptance run. Original subscription `sub_1UF8Y4E6p9BmPii37J9VhpeS` reached `canceled`; webhook `evt_1UFAQCE6p9BmPii3yw1gVYX1` recorded `ROLE_REMOVED`, and Discord DELETE returned `204`. Test clock `clock_1UFAPBE6p9BmPii34X93rbeb` created customer `cus_VFfml7z9hBMSMK` and subscription `sub_1UFATvE6p9BmPii3SBESa2O0`; webhook `evt_1UFATxE6p9BmPii35o31amyx` recorded `ROLE_GRANTED`, and Discord PUT returned `204`. Apply staging-only migration `009`, freeze source commit `e31e234966aae3b721bc75dc0c2853632a9d7110`, deploy it as Checkout Worker `531ee711-60a1-4429-9147-6595ed13eb5a`, retain all six encrypted secrets, expand staging Stripe destination `we_1UF61QE6p9BmPii30UGuNEMO` to eight events including `invoice.payment_failed`, and configure test coupon `VJxmdXFz` in portal configuration `bpc_1UF9gPE6p9BmPii3pI6NPPAn`. Full suite: 162/162. Production was untouched. | Zakai Martin | Retention coupon application and test-clock advancement are prepared; final UI actions require action-time financial confirmation |
| 2026-09-13 | Adopt an all-sales-final membership policy except where law, card-network rules, or a written owner exception requires otherwise. Cancellation stops future renewal without retroactive refund and preserves access through the paid period. Before cancellation, offer a one-time 75% discount on the next `$32.99` monthly invoice (approximately `$8.25`), then return to `$32.99/month`; declining the offer must continue cancellation without obstruction. | Zakai Martin | Policy selected; Stripe test coupon/configuration, disclosure consistency, and legal approval remain |
| 2026-09-13 | Add a non-public end-to-end pick fixture covering Luna-shaped extraction, ESPN validation, private/public copy equality, canonical logging, final grading/unit math, recap, X copy, and Trends generation. Harden image Free Pick publication to accept typed images up to 5 MB, preserve stored media, route manual approved attachments to the site/X path, and prevent duplicate image-plus-text X posts. | Zakai Martin | Local only; included in the current 162/162 passing suite, no deployment/post/email occurred, controlled external acceptance remains |
| 2026-09-13 | Review found and corrected a staging billing race: a normal subscription update could overwrite a refund/dispute block written concurrently. Subscription persistence now inserts only when absent and patches Stripe-owned fields without ever writing entitlement-block fields. Exact source commit `e31e234966aae3b721bc75dc0c2853632a9d7110` is deployed as staging Worker `531ee711-60a1-4429-9147-6595ed13eb5a`; health is `200`, all six expected secret names remain, and 162/162 tests plus `git diff --check` pass. | Zakai Martin | Staging verified; production promotion requires the complete beta checklist and final approval |
| 2026-09-13 | Complete the authorized retention clock. Coupon `VJxmdXFz` created paid test invoice `in_1UFFj1E6p9BmPii37FBFrhWg` for `$8.25`, then expired so the next preview returned to `$32.99`. No-refund period-end cancellation of `sub_1UFATvE6p9BmPii3SBESa2O0` produced terminal event `evt_1UFFqTE6p9BmPii3UWYNvLwv`; Supabase recorded `canceled`, webhook `PROCESSED/ROLE_REMOVED`, and Discord DELETE `204` / `SUCCEEDED`. The 09:04 MST read-only production smoke passed 5/5. | Zakai Martin | Staging lifecycle passed; repeat-offer enforcement, adverse billing fixtures, legal/support decisions, and production approval remain |
| 2026-09-13 | Complete authenticated repeat-offer acceptance on the isolated legacy fixture and close the outbound Discord attribution gap. After backfilling only the pre-guard test customer marker, fresh Discord-authenticated portal reviews showed no second retention offer. Staging Worker `4fe6301a-307c-446b-87ee-7a772c38bbfb` is healthy; its entitlement probe wrote a member-attributed Discord role PUT with `membership_entitlement_sync` and HTTP `204`. The owner-authorized repeat subscription `sub_1UFGmRE6p9BmPii35bC5Oteh` then scheduled no-refund cancellation for December 13 and advanced through terminal event `evt_1UFHpPE6p9BmPii39F5ZuPiF`: Supabase `canceled`, webhook `PROCESSED/ROLE_REMOVED`, and Discord DELETE HTTP `204` / `SUCCEEDED`. | Zakai Martin | Staging lifecycle complete; production untouched; adverse billing fixtures remain |
| 2026-09-13 | Prepare a founder/platform-operator negotiation draft separating revenue share from equity. Proposed anchor: 50/50 for a 60-day launch phase, then a 35% continuing-operator floor with paid-member growth tiers up to 50/50; no time-only step-down while marketing, daily operations, support, or new development remain assigned. Expenses are reimbursed separately, and the draft includes audit access, scope/change control, IP/license treatment, termination transition, buyout/tail protection, and independent legal/tax review. | Zakai Martin | Draft only; no compensation terms are adopted or signed |
| 2026-09-13 | Treat automatic X-to-approval latency as a launch blocker after the first live production window. Read-only Supabase evidence for the 10:00 and 10:15 cycles shows 853 distinct deferred posts, 994 deferral events, four Luna runs at 4.311 s average, and zero approval cards. Preserve the 12 intake workers; remediate candidate selection and deferred persistence before increasing the per-run model allowance. | Zakai Martin | Diagnose-only audit complete; production remediation requires explicit deployment/configuration approval |
| 2026-09-13 | Deploy the approved X intake remediation to production and raise only `X_MONITOR_MAX_MODEL_CALLS_PER_RUN` from 2 to 6. Render deployed the audited code and environment change; the live 10:35 MST startup scanned 38 sources with 12 workers, used 6/6 Luna calls, and reduced cap-deferred candidates from 476 to 85. The prior remediated startup created one private review packet. Daily/monthly request and dollar hard stops remain unchanged, and automatic source publishing remains disabled. | Zakai Martin | Live and verified; today's qualifying-pick approval/publication trail remains an operating acceptance task |
| 2026-09-13 | Approve immediate entitlement suspension while Stripe reports a subscription `past_due`, with automatic restoration only when Stripe returns the subscription to an eligible `active` or `trialing` state. Preserve webhook and Discord role evidence for both transitions. | Zakai Martin | Policy approved; automated coverage passes, isolated external evidence remains |
| 2026-09-13 | Approve provisional retention of membership/API audit records for 24 months and ordinary support tickets for 12 months, subject to legal/privacy review before unrestricted public launch. | Zakai Martin | Provisional policy adopted; support-ticket storage is not yet implemented |
| 2026-09-13 | Assign Kobe as pick approver and publisher, deterministic ESPN automation as grader for supported markets, and Zakai Martin as daily closeout/checker and exception owner. Unsupported or ambiguous markets remain pending for `/grade-pick`; automation may not guess. | Zakai Martin | Adopted for beta operations |

## Owner answers still required

These cannot be learned safely from source code:

1. What are the daily and monthly budgets for OpenAI, X, Cloudflare, Render, and total infrastructure? At what dollar/request threshold should automation stop versus alert?
2. Who is the backup technical/billing operator and who is the legal/compliance owner?
3. Should the paid product remain live while Terms/Privacy and support/refund policy remain incomplete? Checkout, Discord authentication, audit persistence, portal cancellation, and scheduled entitlement reconciliation are deployed. Both terminal removal tests and the `$8.25`-then-`$32.99` clock sequence are proven; repeat-offer enforcement and adverse billing scenarios remain open.
4. Which Stripe account/mode, Discord server, Cloudflare account, Render workspace, GitHub account, X project, OpenAI organization/project, and Gmail account are the official production accounts? Record identifiers, never secrets.
5. What failed-payment grace period, supported jurisdictions, age rule, official business entity/address, and support/privacy email are approved? The standard refund decision is recorded; legally required and chargeback exceptions still need an operating owner.
6. What retention period is required for API logs, source content, model inputs/outputs, member identifiers, payment references, and incidents?
7. What monthly cash reserve and per-member reward limits are approved for referrals, and who may pause payouts or approve suspicious/manual-review cases?
8. Who will handle referral tax reporting and requests for taxpayer information if annual payments approach the applicable reporting threshold?

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
- September 12 OpenAI reconciliation: `docs/OPENAI_USAGE_RECONCILIATION_2026-09-12.md`
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
