# Kobe's Betting Hub — Project Control File

**Status:** PUBLIC BETA GO recorded 2026-09-14 21:51 MST; production is open for monitored organic invitations

**Last verified:** 2026-09-17 approximately 18:46 MST (341/341 tests; latest Render 01d8a5a live. Owner authorized daily extraction request cap 50→100; runtime verifies 100, monthly requests 500, daily budget $1 and monthly budget $15. Audit attributes the prior 51 requests to 51 distinct successful Twitter/X extractions, estimated $0.0391992, not Telegram retries. Telegram full-photo download fixed; zero-byte images cannot reach extraction. Cloud recovered never-delivered messages 27755/27756, which are now HELD_UNCLEAR_TERMS; 27757 deferred by the two-model-calls-per-run safety cap, not a broken connection. No Telegram approval delivery claimed yet. Recap polling and 21:00 Arizona review eligibility confirmed; today awaits final results. Last billing check: 9 active/trialing records, 6 unlinked, no failed/stuck webhooks, reconciliation failures or referral safety holds. Welcome lifecycle emails and all-market grading remain unfinished.)

**Production runtime change set:** Render `01d8a5a39dd468f3d7728442a58b68279fae732f`, live deploy `dep-dam9fdrtqb8s73bh7g90`; Checkout Worker `1fbd7477-1158-4461-bb05-4bc813b7f20c`; Publisher remains `2f3418de-62bc-4f36-b169-e8521d77d815`; static website Worker `739a4271-937e-4c3f-abcb-5b6fe4451a4e`. Telegram cloud session and image extraction work; unclear terms remain privately held and model work is bounded per run. Per-wager lossless-source ledger deployed, with unsupported markets pending. Intake cutoff 16:00 and private unresolved-review eligibility 21:00 Arizona remain configured. Migration 010 is applied. Six-month $134.99 and annual $194.99 recurring Stripe offers and both monthly intros remain. No existing subscription migration or Stripe Tax change was made.

**Control-file owner:** Zakai Martin

### September 19 — four private approval lanes, verified player teams and referral entry

Created two private Discord channels by duplicating the existing private
approval-channel permissions: `exclusive-recap-approvals`
(`1550992219555762216`) and `writeup-recap-approvals`
(`1550992474367983677`). The cloud bot routes exclusive recap drafts only to
the first and football/baseball writeup recap drafts only to the second.
Exclusive approvals can publish only to `vip-expert-wins`; writeup approvals
can publish only to `vip-write-up-recaps`. Both retain the exact-card Kobe-only
Approve/Reject gate, privacy preflight, pending-result block, durable receipts,
stale-button protection and no automatic member publication. Existing private
pick and exclusive-pick approval channels are unchanged, producing four distinct
approval lanes in total.

Future regular player-prop writeups place the verified player team directly
under the bold player name and above the exact wager terms. Team identity comes
only from the matched ESPN event roster; unavailable verification preserves the
old exact wager line and never guesses a team. The approval/member copy lock is
unchanged, so a post-verification edit requires a fresh approval.

The existing abuse-resistant $10 referral backend and website remain the
authority. The bot now maintains one simple information card in
`refer-and-earn` (`1550942922520928256`) with secure Get my referral link and
Check earnings buttons. It does not copy the reference server's 20% terms.
Self-referrals, duplicates, reused qualifying payments, refunds, disputes and
fraud remain ineligible; the first $32.99 payment and seven-day review still
control reward eligibility.

Meta's `Bettinhub Story Connection` app was opened in Arc for the owner. The
intended connection is the `@kobeslocks` professional Instagram account with
only basic/profile and content-publishing access. Ad-account, messaging,
comments and broader business access remain outside scope, and Instagram
publishing remains disabled pending real account authorization.

### September 19 — injury report typography

Future NFL and MLB injury boards keep each team heading bold and now render
every player name in italics, including both questionable/doubtful/day-to-day
entries and the compact out/inactive list. Status labels, symbols, source-only
summaries, 15-minute refreshes and fail-closed delivery behavior are unchanged.
The changed content fingerprint causes the next scheduled refresh to edit the
existing daily board in place rather than creating another report. Focused
formatting, pagination, edit/deduplication and failure-safety tests pass 14/14.

### September 19 — evidence-led Free Pick X format

Owner requested future approved Free Pick posts use a concise, recognizable X
format modeled on strong sports-pick accounts without copying unsupported hype:
alert header, exact approved wager terms, as many as four complete verified
evidence bullets that fit, one engagement question, the Hub link, and a 21+
responsible-gambling/no-guarantees footer. Text-only fallback and image-backed
website/X publication now share the same builder, so the two paths cannot drift.
Evidence is never cut mid-claim; approved terms and the safety footer are never
removed to make room. Oversized mandatory copy fails closed. Stable per-pick X
IDs and the existing image/text duplicate guard are unchanged.

No existing X post was deleted, repeated or replaced. The September 19 Free Pick
remains the canonical post; any expanded same-day commentary belongs in a reply,
not a second standalone duplicate. Focused X/site/publisher/recovery tests pass
19/19. The wider suite passes 394/402; the same eight date-sensitive Telegram
reader fixtures described below remain unrelated to this copy-only change.

### September 19 — one-day 8 AM intake window live

Owner requested the existing production collector run from 08:00 through its
regular 16:00 Arizona cutoff on September 19 only. Commit `2c7aec3` added a
date-bound start override. Its first live startup exposed a pre-existing
before-window scheduling bug that repeatedly logged a past start time without
scanning or publishing. Commit `85bda75` corrected the calculation and added
focused coverage. Render deploy `dep-dan8pnff3r2c73dq90qg` is live; its startup
receipt states `2026-09-19T15:00:00.000Z (08:00 Arizona time)`. The stop remains
16:00. The dated override expires after September 19, so the recurring 10:00
Arizona start returns automatically. Focused schedule tests pass 3/3 and syntax
validation passes. The full suite is 388/396; the eight failures are unrelated,
date-sensitive Telegram reader fixtures that rolled past their hardcoded day.

### September 18 — exclusive recap button-approval flow

Immediate delivery recovery: route recap review cards to existing private
`pick-approvals` (`1539135477355905094`) while the intended daily-recap channel
(`1539062059306848368`) remains member-visible. Do not weaken the privacy
preflight or alter channel permissions. Exclusive-wins remains bot-inaccessible
and requires owner permission repair before Kobe's approval can publish there.
September 17 cached exclusive ledger contains 68 capper groups: 52 fully verified
and 16 with 25 unresolved wagers. Unresolved groups must remain approval-disabled.
The failed Membership operations alert run `35394710346` is a genuine warning:
seven active memberships remain unlinked beyond the grace window; zero failed or
stuck payment webhooks and zero reconciliation failures. Do not suppress this
alert or guess customer Discord identities to make the check pass.

Owner requested the recap channel operate like private pick approvals, with Kobe
making the final decision to send to exclusive wins. Prepared a persistent,
per-capper recap review queue in the existing Render worker. Trusted routing is
versioned in `data/recap-workflow.json`: private daily-recap
`1539062059306848368`, exclusive-wins `1550535535041187920`, source publications
from exclusives `1539055850075852911`, and reviewer Kobe `1209660006383755265`.
Cards retain the requested capper record and original wager lines with ☘️/💥/
↔️/🚫/⏳ results. Any unverified wager blocks that capper card's approval; it
does not block another fully verified capper. Draft revisions edit the existing
cards; stale buttons are rejected. Both private and public sends have durable
per-part reservations and real Discord receipts. An uncertain send is reconciled,
never blindly replayed. Public send recovery still requires Kobe's explicit click.
Reject and repeat clicks do not publish; the legacy `/publish-recap` command now
queues review only and cannot bypass the button gate. Existing recap emails remain
unchanged and Instagram stays disabled.

Read-only channel inspection found daily-recap still visible to Website VIP and
the bot blocked from exclusive-wins (403). Asked the owner for action-time
confirmation to make recap private and give only the existing bot the four needed
channel permissions. Until those permissions are repaired, the private-channel
preflight fails closed and no draft/member publication should be claimed.
Deployment and real private-card acceptance are recorded below when verified.

Deployment receipt: commit `038793ff3b406e70cc66675d82e594c72d666212`, Render
`dep-damnr9oae00c73bmvlh0` LIVE at 2026-09-18 18:06:59 UTC. All 394 automated
tests and five production read-only smoke checks passed. Bot startup confirms
the new capper approval flow plus existing five-minute recap, 21:00 nightly,
07:00 morning, Telegram and other cloud schedules. At 18:07:08 UTC the real
private-channel preflight withheld drafts because Website VIP still has recap
visibility. Yesterday retains 25 unresolved wagers; no result was guessed and
no recap was sent to exclusive-wins. Permission confirmation/repair and a real
private recap-card receipt remain outstanding; no owner approval or public
recap acceptance has been performed by the operator.

### September 17, 20:35 Arizona — Stripe billing notices saved; welcome sender hand-off

20:41 Arizona activation receipt: owner entered and saved the dedicated Google
connection credential. testMemberWelcomeConnection completed successfully at
20:39:24; installMemberWelcomeEmails completed at 20:39:59. The trigger table
shows exactly one deliverMemberWelcomeEmails trigger. Its saved editor visually
confirms Time-driven, Minutes timer, Every 5 minutes. A live manual sender check
completed at 20:41:24 without errors. Authenticated production queue GET remains
200 with zero queued messages. Existing recap/Trends triggers remain present and
were not modified. Welcome confirmation is now activated for new eligible
checkouts after the cutoff below, runs in Google/Cloudflare with the laptop off,
and includes plan, total, next billing date, private Connect Discord and management
links. No historical customer backfill or actual customer welcome delivery has
been verified; next eligible real checkout supplies the end-to-end mail receipt.
This activation receipt supersedes the pending hand-off notes immediately below.

Saved and visually verified Stripe production customer emails for upcoming renewals
(existing seven-day timing), expiring cards, failed card payments and failed bank
debit payments. Enabled the subscription-management link to Stripe Customer Portal.
Payment-update links now use Stripe-hosted pages, replacing the legacy mixed setup
whose custom URLs pointed at the homepage. Stripe warned this legacy migration
cannot be reversed. The seven-day trial reminder remains off; it is not a welcome
email. No subscriptions, prices, tax settings, retry policy or payment charges changed.

Deployed prepared checkout welcome code with preserved production bindings:
Worker `e803f13b-15bb-47a7-8117-45b963d14988`; future-only checkout/event cutoff
`2026-09-18T03:35:15Z`. Dedicated MEMBER_WELCOME_QUEUE_SECRET is stored as a
Cloudflare secret, not source/config. Health and authenticated queue GET both
return 200, queue count zero, proving migration 011's table is available. All
367 tests and five public production smoke checks pass. No customer welcome sent.

Google's new property-name row is prepared in Arc; its secret Value is blank.
Owner must enter the private connection credential and Save script properties.
Do not have the UI agent enter or submit a new authentication credential. The
five-minute welcome trigger, Google connection test and actual email delivery
remain unfinished. Existing owner-only recap sender/schedules were not changed.
This receipt supersedes the older prepared/not-deployed welcome notes below.

### September 17 — expanded grading and morning review prepared

Added dedicated F5, football/basketball first-half, MLB NRFI/YRFI, football
anytime/first-touchdown, explicit parlay, team-total and milestone graders.
Additional ESPN routing covers NBA, WNBA, men's college basketball, eight soccer
leagues, and date-filtered ATP/WTA singles moneylines/game/set handicaps. Exact
player box-score resolution supports source terms without an opponent; multi-wager
siblings no longer inherit the first wager's sport/event. Profit still uses only
the original published combined/straight odds and risk, never provider prices.
Missing odds/risk leave profit unknown, not invented. The previous-day unresolved
private review becomes eligible at 07:00 Arizona using separate restart-safe IDs;
complete final recaps remain result-driven. No public recap posting was enabled.

Live read-only ESPN canaries passed for Yankees F5, Yankees/Marlins NRFI,
Bills first-half spread, Chase Brown first touchdown, Bills ML/total parlay,
and NYCFC 90-minute moneyline. No test wagers, customer changes or public posts.
Release verified: 367/367 tests pass; Render commit
`5cc40c2afccd15363e4e3fb1a383a170640ac439`, deploy
`dep-damatp9srm7s73cvkcu0`, live 2026-09-18 03:24:47 UTC (20:24 Arizona).
Startup confirms Kobe Bot login, laptop-independent Telegram reader, five-minute
recap checks, 21:00 nightly and 07:00 previous-day review eligibility. All five
read-only production smoke checks pass. Production grading is running and still
reports live games, unmatched identities, unclear parlays and grouped parent
holds; no claim is made that all of today's wagers have settled or that a final
recap/graphic has been delivered. Per-wager grouped expansion runs separately.

Explicit remaining grading exceptions: unavailable challenger/ITF results,
nonstandard/retired tennis matches, teasers, second-half overtime rules not stated,
parlay push/void payout adjustments, DNP without participation evidence, missing
or ambiguous event/player identity, incomplete period/stat/scorer data, and
markets outside these implementations. These remain PENDING and appear in the
private review; they are not forced into a fabricated final recap. Automated
social recap graphic rendering and welcome-queue credential/trigger activation
remain separate unfinished work.

### September 17 — future-only customer onboarding prepared, activation pending

Owner requested that new customers connect their own Discord accounts, confirmed
Instagram should remain off, and accepted tomorrow's regularly scheduled Telegram
card and X verification. The existing daily 10:30 Arizona desktop follow-up now
includes September 18 Telegram-card and genuine current-day website/X receipts.
It is an audit, not the production scheduler, and requires the app to be available;
the existing Render/Cloudflare production services run with the laptop off.

Prepared a separate Supabase member-welcome outbox (migration 011), verified fresh
Stripe checkout/subscription terms, future-only activation cutoff, exact standard
plan renewal price and billing date, private checkout-specific Connect Discord
link, /managemembership and support/reply-to zakai@kaimaz.com. Zero-dollar trials
are included. No old customers are backfilled and identities are never guessed.
The new restricted queue cannot accept arbitrary recipients or message creation.
Atomic claims, subscription-level deduplication, sender locks and quota checks
protect against repeated sends. Unknown send/receipt outcomes are held for human
review rather than automatically replayed; this favors duplicate safety over
guaranteed delivery. The Kobe-only recap queue is unchanged.

These welcome changes are prepared locally, NOT deployed or activated. Migration
011 is NOT applied. No customer welcome has been sent. Activation requires the
owner's action-time approval for the existing Google sender to receive verified
customer email addresses and private connection links, a dedicated queue secret,
installation of the new sender code and five-minute trigger, and live connection
verification. Existing Stripe receipts/cancellation automation remain unchanged.

September 17 approximately 20:00 Arizona follow-up: owner requested welcome-email
activation. The tested sender is now saved as a separate MemberWelcome.gs file
in the existing Google project 1qqkTvrCH1TF66urlVjeoqsxTxrcOG1gso3FHniCZiWCSCxR9U-hMHKgp;
existing Code.gs and recap/Trends schedules were not overwritten. Google exposes
testMemberWelcomeConnection, installMemberWelcomeEmails and
deliverMemberWelcomeEmails. No welcome trigger installed, credential entered,
customer email sent, checkout Worker deployed or migration 011 applied by this
follow-up. Action-time Google customer-data access confirmation and user entry
of the dedicated authentication key remain required before activation.
Owner subsequently approved new-customer welcome email data access in chat.
Arc is now open to this project's /settings page, with existing script properties
untouched and credential values withheld from tool output. User entry of a new
dedicated queue credential and matching Cloudflare configuration, migration 011,
Worker deployment, connection test and trigger installation still remain.
Generated one preview-only sample recap design using the built-in image generator;
it is visibly labeled SAMPLE / NOT REAL RESULTS, contains no claimed numeric
performance, and is not integrated with a live automated graphic renderer.
Owner accepted 07:00 Arizona as a potential morning recap target; no new 07:00
production schedule was installed by this follow-up. All-market automated grading
remains unfinished and must not be represented as complete from waiting overnight.
The 19:51 Arizona Render recap check still awaited the last ESPN final. Full
recap delivery is result-driven (five-minute grading/queue checks and five-minute
email checks), not a promised fixed evening finish time. The 21:00 review is
not an all-results-final recap. Unsupported wagers remain pending.
Instagram content publishing authorization does not authorize ad-account access;
Instagram and paid advertising remain disabled. Unlinked members must use their
private checkout confirmation to connect Discord; a public management link alone
does not establish identity or access.

### September 17 — wager-ledger and Telegram follow-up

Telegram authorization succeeded: an encrypted account session is on the existing
Render persistent disk. Live polling at 01:11 and 01:26 UTC September 18 returned
DEFERRED_EXTRACTION for message 27755; this confirms cloud connectivity but NOT
successful approval delivery. Prepared bounded extraction retries: preserve the
original unreadable message in a held review packet after three failures and
continue later messages, without automatically publishing anything.

Prepared separate persistent per-wager results for lossless source publications,
with original terms, stable parent/child identities, term-change detection and
atomic per-result checkpoints. Canonical publication CSV remains unchanged.
Straight team moneylines/spreads and two-team totals can resolve an exact unique
same-day MLB/NFL/NCAAF schedule without an opponent being supplied. Ambiguity,
periods, parlays, special markets and blank box-score stats fail closed. ESPN
responses are cached only within each grading batch. Nightly private review uses
expanded entries; unsupported results remain pending, not invented profits.

Wager-ledger rollout 4a17f82 is live in Render deploy dep-dam99gtg1s2s73crchlg.
337 tests and five read-only production smoke checks passed. Fresh billing check
confirms 9 active/trialing records, 6 unlinked, zero failed/stuck webhooks, zero
reconciliation failures and zero referral safety holds. Bot login and fresh
injury boards verified. Follow-up removes historical-research startup blocking:
all independent services now start before awaiting approval-card refresh.

Welcome/trial/access lifecycle email delivery, fully automatic results across all
exclusive markets, Instagram authorization, unlinked member identity confirmation,
and a genuine new Free Pick social publication remain unfinished. Existing Stripe
receipts do not constitute free-trial welcome emails. No Stripe Tax setting,
existing subscription, refund or public pick was changed by this follow-up.

**Business/content approver:** Kobe

**Technical owner:** Zakai Martin

**Billing/support owner:** Zakai Martin

**Final production approver:** Zakai Martin

This is the authoritative project brain for humans and coding agents. Read this file before changing the project. Update it whenever production state, ownership, architecture, costs, risks, or priorities change. The other Markdown files contain detailed playbooks; when they conflict with this file, this file wins until the conflict is resolved.

The owners do not need to read every repository document. The operating chat should use this file to answer: what is live, what talks to what, what costs money, what failed, what is next, and which decisions require an owner.

## Executive state

### September 17 — management address and diagnostic fixes deployed

Owner explicitly authorized stopping the failed Telegram attempt and deploying.
The old raw-input process retried cancellation; a separate terminal validated
PID 182's exact `node scripts/authorize-telegram.mjs` command before terminating
only that process. Readback confirms `STALE_TELEGRAM_LOGIN_STOPPED`.
Render deploy `dep-dam8oass728c73auu4k0` for `c620d191610694fa631cef389a5e9af1cf311cb5`
is live at 00:56:43 UTC on tzzsf; bot login confirmed, no error-level logs in the
initial verification window. Safe Telegram error diagnosis and distinct-opponent/
ambiguous-event grading protections are live. Account authorization still pending.
The new hidden phone prompt is confirmed open on tzzsf (authorization PID 158).
Do not deploy/restart again while this attempt is active. Injury readback after
restart retains compact NFL 194/6 and MLB 278/4 daily receipts.

Static Worker `739a4271-937e-4c3f-abcb-5b6fe4451a4e` serves `/managemembership` (200).
Public management links use that address. `/cancel`, `/cancel/` and `/cancel.html`
permanently redirect there; live readback proves `?portal=returned` is preserved.
The new page is generated from the same configured source, not a separately
maintained portal implementation. Secure portal OAuth redirect returns 302 to
Discord. Full local suite 326/326; post-deploy public smoke 5/5. No payment,
cancellation, manual identity linkage or customer email was performed. Complete
all-exclusive automatic recap and welcome lifecycle emails remain unfinished.

### September 17 — recap and Telegram follow-up prepared; not deployed

Owner clarified the Free Pick channel was newly created and currently empty.
There is no current-day message to recover; wait for a genuine new approval,
without replaying historical picks. Automatic results → private email to Kobe
remains the intended recap workflow. The full all-exclusive automatic recap is
unfinished: grouped publications need individual-wager tracking and unsupported
markets need reliable result coverage. The 21:00 private review is only a fallback.

Prepared a grading safety correction: both distinct matchup opponents must match,
and multiple event matches stay pending rather than choosing the first event.
Prepared safe Telegram login diagnosis using only allowlisted provider error
codes; it explains phone/code/config failures without printing private inputs,
and stops rate-limited/unknown attempts rather than looping blindly. Full local
suite passes 326/326. These changes are NOT deployed: the active Render terminal
still shows two generic login rejections and is waiting for hidden phone input.
Stop/replace that attempt before restarting the worker. No account session was
created or customer email sent during this follow-up.

Welcome emails remain pending a separately restricted lifecycle delivery path.
They must use the verified checkout email, cover zero-dollar trials as well as
paid checkouts, show exact initial/renewal terms and include secure Discord
connection, membership management and support. Do not widen the Kobe-only recap
notification queue to arbitrary recipients. Existing Stripe payment receipts and
cancellation confirmation stay enabled, but do not prove welcome delivery.

### September 17 — latest authorized rollout receipt (supersedes earlier snapshots)

Current Render runtime is `aa6c5cf49a323eb4f99dde387d21aa6c267dc23e`, deploy
`dep-dam8cclg1s2s73cqm820`, live at 00:31:13 UTC on sbb9w. Cloudflare versions
and migrations remain unchanged. Authorized restart activated 16:00 cutoff and
compact injury formatting. Startup confirms next X intake 10:00 Arizona tomorrow,
recap checks every five minutes and private unresolved-review eligibility at
21:00 Arizona. NFL receipt is 194 relevant players/6 pages; MLB is 278/4.
Superseded full-list pages are marked no longer needed, not deleted. Direct
Discord readbacks confirm symbolized pages. All 323 tests and post-deploy 5/5
public smoke pass. Real-data review includes 87 official publication entries in
two parts (largest 10,953 characters). Queue read-only connection returns 200.
Final recap still needs verified grades and inbox acceptance. Recent Sent mail
proves September 15 recap-waiting and Story packages were delivered by the
existing sender; this is not proof of tonight's future final recap delivery.

Fresh membership DB read shows six missing Discord identities, none present in
their subscription metadata; all three linked accounts independently have VIP.
No billing was changed or identity guessed. Runtime bot/channel identity matches
the read-only Free Pick lookup; actual channel history permissions are present,
but latest 25 messages and today's canonical Free Pick ledger are empty. Owner
must provide the claimed current-day message link before delivery recovery.
Telegram browser login has not created a cloud session. The hidden cloud phone
prompt is now open on sbb9w; owner enters phone/code/2FA directly, not chat.
Do not restart again while this authorization is active. Welcome/access emails
remain unfinished: no suitable activated transactional sender/lifecycle test and
no welcome message sent. Existing payment receipts/cancellation automation stay
enabled; they do not replace trial-access onboarding.

### September 17 — prioritized member access, nightly review and authorized restart

Owner authorized worker reset and requested member access → recap → Telegram →
Free Pick → welcome emails priority. Fresh cloud DB inspection finds 9 active/
trialing records, 6 without Discord identity, zero failed/stuck webhooks and zero
reconciliation failures. All three actual connected accounts were independently
read from Discord and have VIP. None of the six missing links has a Discord ID in
Stripe subscription metadata; do not invent one or modify customer billing.
They require verified Connect Discord completion. No cloud Telegram session file
is present despite the browser account being signed in. Hidden phone/code/2FA
authorization is still required. Owner's reset authorization supersedes the prior
restart hold, but it does not turn browser login into cloud authorization.

Prepared nightly private recap review at 21:00 Arizona when unresolved entries
remain. It lists verified settled rows and explicitly unresolved original entries
with complete-post links, never calls publication-group counts a wager record or
claims final profit. Snapshot is persisted before idempotent per-part queueing.
The complete final recap still requires verified results. Long review/final bodies
are split losslessly below the notification limit rather than silently truncated.
Multi-wager source publications are blocked from first-wager-only auto-grading.
These changes are prepared for the authorized existing-worker deployment.
Live ledger contains 87 September 17 official rows and no Free Pick rows. The
source channel is the only matching Free Pick channel in the server inventory.
A genuine message URL is needed if today's Free Pick was posted elsewhere.

### September 17 — fresh verification, 4 PM saved and recap blockers

Owner requested the daily intake cutoff move back to 16:00 Arizona and a fresh
general readiness check. Render environment readback confirms
`X_MONITOR_DAILY_STOP_AT=16:00` saved with **Save only**. The running process still
has its earlier 15:00 value. Activation requires a restart, held because the
existing Telegram authorization terminal is still at the hidden phone prompt.
No new deployment or Telegram credential entry was performed. The recap close
time has no separate environment override and will inherit the new cutoff after
restart. Do not describe the new window or compact injury format as live yet.

Fresh tests: 317/317; public production smoke: 5/5; `/`, `/join`, `/cancel`,
`/refer`, `/exclusives`, `/support`, `/terms`, `/privacy`: HTTP 200 with shared
header. Join contains both longer prices and visible management/referral links.
The actual `/discord/login?intent=portal` and `/referrals/login` routes return
Discord OAuth redirects. Private approval and both injury channels are readable.
Cloud injury receipts refresh at 23:50, 00:05 and 00:20 UTC on the existing
worker; no error-level app logs were returned for the latest startup window.
These checks do not substitute for new real payments, cash payouts, inbox
delivery or a genuine new social publication.

Tonight's official recap checks are visibly running every five minutes. One
complete 00:18–00:19 UTC grading cycle contains 87 pending logged entries:
6 ESPN events not final, 10 no matching ESPN event, 71 unsupported league or
missing operating date. Thus 81 entries need event/market metadata or verified
manual grading, not merely waiting for games. Rows may group multiple wagers.
Final recap deliberately waits for every eligible official entry to be graded;
no result is invented. Its delivery target is Kobe's private review email,
not automatic public Discord publication. Final email/inbox acceptance remains
unverified. The Free Pick channel's latest-message read is empty; a new genuine
Kobe approval is still needed for current-day website/X acceptance. Previous
billing checks are retained with their timestamps, not represented as refreshed.

### September 17 — recurring exclusive intake and follow-up verified

Owner requested exclusives continue tomorrow and every day into Discord. Preserve
the existing private-approval-only boundary; Kobe chooses member publication.
Live Render logs from instance mxr4r explicitly schedule the next daily X intake
for `2026-09-18T17:00:00.000Z` (10:00 Arizona), after today's 15:00 cutoff. The
existing daily loop repeats and the collector paginates its first daily catch-up
from Pacific midnight, then polls new source posts. This is a 10:00–15:00 Arizona
window, not guaranteed 24-hour exclusive coverage. Original capper grouping,
exact supplied terms, stale/ambiguous holds and durable dedupe remain unchanged.
Focused exclusive/collector/recovery tests: 26/26 pass. No worker restart or
member publication was performed for this verification.

Created active thread heartbeat `daily-exclusive-approval-check` for 10:30 Arizona
daily, starting tomorrow, to audit existing cloud intake and private delivery
receipts, recover only safely deduplicated original private terms, and notify only
meaningful failures/omissions/recoveries or owner actions. This Codex follow-up is
not the production scheduler and must not be represented as laptop-independent
delivery. The authoritative daily collector already runs on Render without the
laptop. The old August-29 local collector automation remains paused; it was not
revived or duplicated. Telegram intake is still awaiting owner login.

### September 17 — customer receipt and cancellation emails enabled

Owner requested membership and cancellation confirmations. In the existing live
Kobesbettinghub Stripe account, Successful payments customer emails were disabled;
they are now enabled, with the enabled switch visually read back. One live Billing
automation, `Membership cancellation confirmation`, was created with trigger
`Subscription is canceled` and its sole action `Send cancellation confirmation
email` immediately after that trigger. The automation list reads **Active**. No
billing, retry, refund, subscription, or customer-access state was changed and no
test email or live transaction was submitted. Stripe's existing branded template
uses the existing support/reply address `kobedirwin@gmail.com`.

This is configuration verification, **not inbox-delivery acceptance**. Successful
payment receipts are not free-trial welcome/access emails. Scheduled cancellation
acknowledgement timing still requires an isolated acceptance check; do not claim
the canceled trigger proves a message at the moment `cancel_at_period_end` is set.
A welcome email with exact plan/trial/renewal terms and Connect Discord/Manage
membership links, plus immediate scheduled-cancellation/access-end confirmation,
remain pending a suitable transactional sender and isolated lifecycle testing.
The existing recap sender is restricted to Kobe and must not be widened to member
recipients without authorized secure configuration. These dashboard changes are
already live and require no Render restart; local injury deployment remains held.

### September 17 — compact injury format prepared, deployment held

Owner requested symbolized injury boards with short questionable-player notes and
no summaries for confirmed unavailable players. Local formatting now omits Active
and Probable, retains exact Questionable/Doubtful/Day-To-Day labels, and groups
Out/Inactive/IR/IL/suspension as name/status-only lists. Uncertain-player notes use
only the injury type and dated source report, with availability explicitly
unconfirmed; no model is called, so AI summary cost is $0. Unrelated ESPN
performance commentary and projected return dates are not copied into notes.

Latest read-only real-feed formatting check: NFL 800 source entries → 194 relevant
players (133 uncertain, 61 unavailable), 6 pages instead of 15; MLB 278 relevant
players (12 uncertain, 266 unavailable), 4 pages instead of 6. All descriptions fit
Discord limits. Existing durable edit/dedupe behavior and 15-minute cadence remain.
The 14 focused injury tests pass. **These compact changes are not deployed yet:**
Render Web Shell is still at the Telegram phone prompt. Per the Render worker
restart-safety guidance, do not restart/deploy the worker during that login.
Finish or explicitly cancel authorization first, then publish and read back the
updated daily boards. Current production still uses the earlier full-list format.

### September 17 — laptop-independent operations, curated homepage and referral safety

See `docs/CLOUD_READINESS_2026-09-17.md` and `docs/REFERRAL_SAFETY.md` for current receipts and remaining actions. The newest state here supersedes the earlier September 17 snapshots below.

The homepage follows intro → historical wins → curation explanation/approach → exclusive directory → first reviews → value comparison → community → more wins/reviews. The public directory has 50 capper/rate rows, with AllBets, BL, SetPointBets, Shark and Spartan removed **only from the website**. Private intake is unchanged. The requested $8,000 claim remains unpublished because mixed weekly/monthly/one-time prices do not establish a verified comparison period.

@BettingBuddyy is an enabled source-only exclusive intake feed. Its catch-up produced 22 private cards; channel readback included all 22 without missing receipts. A subsequent source-only teaser correction recovered Troy West's four original wagers into private card `20260917-250-X`, message `1550293158968172607`, and Discord GET returned 200 with the exact terms. No operator approval or member publication occurred. Already queued groups are deduplicated; unclear capper/market groups stay held.

Football/baseball injury updates run in the existing Render worker every 15 minutes with durable disk receipts. Both daily boards are live (15 NFL pages/800 entries, 6 MLB pages/278 entries), and a subsequent cloud restart retained the same receipts. Bot permissions were granted only in the two authorized injury channels. Telegram API configuration and the selected-channel cloud reader are deployed; **the account session still requires the user's one-time hidden phone/code/2FA entry in Render Web Shell**.

The $10 referral is hardened without changing qualification or the seven-day hold. Per-person/card/charge uniqueness, atomic one-winner claims, fresh refund/dispute/risk checks, self/shared-card review and non-retryable unknown payout states are deployed. Migration plan reports nothing pending; the three columns/indexes and protected grants/RLS are verified. No real cash payout was run as a test. The private operations alarm also surfaces referral safety holds. No absolute fraud-prevention guarantee is made; late disputes and coordinated distinct-card fraud remain risks.

Live checks confirm VIP for all 3 distinct connected Discord accounts. The latest read-only membership alarm shows 9 active/trialing subscription records and 4 unlinked after grace, with zero reconciliation failures or failed/stuck webhooks. Subscription count is not a verified paying-person count; unlinked customers must finish the secure Connect Discord flow, and possible duplicate checkouts require owner review.

The verified configured Free Pick channel has no current-day canonical publication. Website current still says September 15; X is connected and its cloud bridge is enabled, but today's public X write/media acceptance remains pending a genuine new Free Pick approval. Old draft wagers were not replayed. Instagram tester/authorization remains pending Kobe. Recap rows show pending-result notice states, not a completed final recap. Telegram authorization, genuine Free Pick acceptance, final verified grades, unlinked customers, Instagram authorization and seller tax applicability are the explicit remaining items.

### September 17 — longer plans, visible member links and private exclusive batch

See `docs/MEMBERSHIP_PLANS_2026-09-17.md`. Live buttons open Stripe at $134.99 every six months and $194.99 every year, without trials or extra starter charges. Accurate savings, renewal terms, responsive cards, orange Manage membership link and a bordered referral panel are deployed. Black-on-black inherited link color is corrected. Monthly retention coupons are not offered to longer plans. No payment was submitted during acceptance checks.

All 44 capper-grouped private cards / 139 exact wager lines were delivered and read back with zero term mismatches. At readback 39 cards showed Kobe's completed approval footer; the import itself made zero member publications. Incomplete market terms remain held rather than guessed.

Fresh Discord reads confirmed VIP for both connected subscribers. A later membership-operations check reports three additional active two-day trial records without Discord linkage after the grace window, with zero failed/stuck webhooks or reconciliation failures. These are not confirmed paying members; review customer connection/possible duplicate checkout before counting access. No automatic cancellation was performed. Live `/cancel` and `/refer` navigation and their secure Discord entry points were checked; actual referral cash payout was not acceptance-tested.

Free Pick recovery runs in the existing cloud bot with a stable X queue ID per pick and no historical replay. At the read-only check no September 17 Free Pick existed in the configured channel; the site legitimately retained September 15. A genuine current-day approval is still needed to verify live X publication. Instagram has no authorized connection; delivered Story email packages do not prove automatic Instagram posting. A final recap still needs verified grades; unsupported/missing-event markets are not fabricated. Telegram application creation is complete, but independent session authorization and the cloud reader are not complete.

### September 17 — exclusive recovery and expanded private intake

Recovered EZMSports source posts `2100620530697273349` (Emory Hunt, Lions +5.5 -114) and `2100620430998667690` (Joe Duffy, Detroit Lions +4' -110) using saved successful extractions, no new model calls. They reached private approvals; Kobe approved both. Direct Discord reads verified official #exclusives messages `1550263951177023540` and `1550263962208043139`. Release suite passed 233/233 and public smoke 5/5 for that deployed fix.

Owner subsequently requested all clear exclusives in private approvals, not only schedule-resolvable posts. Lossless capper + original wager-line intake is now live: no model-call cap for that direct text path, no researched breakdown or invented league/opponent/odds. Exclusive source-only approval no longer requires independent ESPN coverage; current Pacific-day source, clear original capper/market/context and player identity checks remain. Kobe remains the human publication gate; existing known event-start timestamps still block stale publication. Regular-pick event/roster/evidence/copy locks are unchanged. Image/model extraction remains bounded, but overflow now defers instead of marking unreviewed posts handled.

Today's saved posts yielded **29 private approval cards containing 54 original wagers**, with all 29 channel/content/no-image checks passing. This includes 27 new cards and the two earlier recovered cards. The initial batch hit Discord rate limits; all ten explicit 429 reservations were safely delivered using their existing pick IDs after the bounded retry fix. No batch reservations remain. At the 15:06 check, **27 cards had been approved by Kobe's account and two were undecided**; the operator did not approve or directly publish any card. Six other candidates remain held: two lack full player identity, four lack distinct original capper identity. Full release tests pass **240/240**, and public smoke passes **5/5**. See `docs/EXCLUSIVE_RECOVERY_2026-09-17.md`.

A separate `#exclusive-approvals` room is recommended due to volume, but has not been created or configured. Delivery stays in the existing pick-approvals room until the owner authorizes the separate route.

### September 17 — curated homepage and Instagram tester invitation

Follow-up website coherence check fixed the shared sticky header's unconditional ticker offset. Headers without a ticker now use top zero; only an immediately preceding visible ticker reserves 34px desktop/30px mobile. All six shared-header pages use the same cache-busted stylesheet. Regular Arc checks cover desktop Free Pick and mobile Free Pick (including scroll), referrals, and membership management. Two new regression tests pass; the full release suite is **228/228**. Existing non-sticky support/legal/editorial headers do not reserve ticker offsets.

Rechecked the actual live Stripe subscription detail: the starter invoice is **$10.00 Paid**, the Discord connection metadata is present, and the next invoice is **$32.99 on September 24**. Stripe's trialing label represents the seven-day starter interval, not an unpaid invoice. The earlier launch-day Discord role check remains the direct role-presence evidence. No customer billing data or subscription was changed.

The live homepage now leads with “Real cappers. Real plays. One Hub.” and explicitly describes picks curated from other bettors and reviewed by Kobe. Existing historical results/reviews/slips follow the hero, then a three-step curation explanation. No wins, performance totals, or expert credentials were invented. Selected-example and betting-risk disclosures remain; trial links, navigation, and the image viewer remain functional. Regular Arc previews passed at desktop, 400px and 320px phone widths, including mobile full-screen proof viewing. Release tests passed **226/226**. Deployed only the static website Worker; no bot restart or billing mutation is needed.

Submitted the Instagram-only tester invitation for `kobeslocks` in Bettinhub Story Connection. Meta's Instagram Testers view confirms **Pending**. Kobe must accept through Instagram's Apps and Websites invitation settings before authorization. This does not grant app administration or activate automatic Story publishing. The connection remains unauthorised until he completes the next step.

### September 17 — launch-day evidence isolation hotfix

Reproduced the owner's Josh Allen/Gibbs/DJ Moore cross-play breakdown contamination. A scoped fix requires per-play source attribution, refuses parent/shared evidence inheritance, researches only each play's missing facts, blocks stale unsafe copy, and corrects/holds today's undecided private cards at startup. The locked pick-first format and matching approval/member copy are unchanged. First deployment `cad28db` confirmed separate Gibbs/DJ Moore evidence; final tightening excludes wager headers and matchup hashtags without deleting historical over/under facts. Local release tests passed **223/223**; no migration or credential change is needed. Final deployment `4d4b106` is live; direct Discord reads verified four Gibbs rushing-attempt facts and four DJ Moore receiving-yard facts, no inherited passing prose or duplicated wager bullet, and both saved approval-copy hashes match. The next genuine owner approval remains the public content acceptance. See `docs/PICK_EVIDENCE_ISOLATION_2026-09-17.md` for rollout and rollback precautions.

Read-only launch checks confirm the new starter member's Discord link and live membership role, with processed live-mode checkout/invoice and role-grant webhooks. Today's pick log contains three paid publications and no Free Pick; site/X delivery has no corresponding API/queue records today and the public current item still says September 15. Instagram's `kobeslocks` connection table is empty. These are explicit remaining delivery/access checks, not evidence that all marketing automation is ready.

### September 16 — pre-Thursday X repair

Restored the missing original encrypted-token key, refreshed X authorization successfully and confirmed @kobesbettinghub. Aligned Render's existing delivery key through a dedicated X-only Publisher binding without changing other queue credentials. The production bot's X queue GET now returns 200, malformed POST returns 400 without a write, and that key cannot reconnect the X account. X account reconnection now requires the operator credential; daily/recap asynchronous authorization defects are fixed. Source release tests passed 217/217, exact-live-bundle checks passed 29 assertions and website smoke passed 5/5. Render restarted successfully and logged in as Kobe Bot.

Twenty-four outdated queued wagers were reversibly held in draft with original rows preserved before restoring dispatch authorization. No public test, old wager, email, payment or membership change was made. **X write/media acceptance remains pending one genuine new Free Pick approval and recorded matching post ID/URL.** Ordinary channel messages/manual `/publish-pick` are not automatically included in this bridge. Locked Discord formatting and live image/Story features were preserved. Tax settings were unchanged; applicability remains a seller decision. See `docs/X_LAUNCH_REPAIR_2026-09-16.md` for versions, rollback, evidence and launch checklist. The earlier row-presence-only "X connected" statement is not sufficient delivery evidence.

Kobe's Betting Hub is a paid sports-pick membership centered on Discord. It also has a public website, Stripe checkout, Discord entitlement automation, a monitored X-source pick pipeline, human approval in Discord, result grading through ESPN, recap email queues, a public Free Pick page, and optional X publishing.

The system is not a single application. It currently spans GitHub, Cloudflare Workers/D1/KV, Render, Discord, Stripe, X, OpenAI, ESPN, Gmail Apps Script, and Supabase Postgres. Supabase is the shared membership and pick/API audit ledger. OpenAI provider reconciliation is live through a dedicated read-only organization Admin key; Apps Script and some SDK-internal calls still need equivalent records before the ledger is literally exhaustive.

### Immediate launch gate

- **Passed:** production website, Checkout health, Publisher health, current Free Pick API, Free Pick page, and client asset passed the post-hotfix `5/5` read-only smoke suite.
- **Passed:** Discord approval-verification hotfix `6989dd1` is live on Render. Startup registered commands, logged in as Kobe Bot, refreshed three pending locked-format cards, and stopped X monitoring at the expected 15:00 Arizona cutoff.
- **Passed:** the once-daily Apps Script email remains enabled at 0% displayed error and now exits silently when no approved picks exist. The failing five-minute recap trigger was deleted after owner approval.
- **Passed:** the Apps Script source is now version-controlled with four no-send/credential/trigger invariants. Three additional tests prove exact image-byte multipart publication, text-only fallback, and fail-closed credential behavior; the complete release suite passes `194/194`.
- **Passed:** the image-backed Free Pick path now has a dedicated Cloudflare staging Worker, D1 database, KV namespace, and publish secret. An isolated PNG published with `201`, returned identical bytes and metadata, proved unauthorized requests receive `401`, and proved X was disconnected/not called. Both fixture keys were deleted and the staging current endpoint returned `404` afterward.
- **Passed:** checkout abuse protection is live in Checkout Worker `ff778d91-c34c-4b49-92c9-dfa02785fa37`. Staging proved the 10-attempt/60-second binding returns `429` with `Retry-After: 60` before Stripe is called; production health, seven secret names, the 09:15 Arizona reconciliation cron, and the `5/5` smoke remained intact after deployment.
- **Passed:** the private membership-operations alarm reads production Supabase in a read-only transaction every two hours and fails visibly on paid-but-unlinked memberships, unresolved reconciliation failures, failed webhooks, stuck webhooks, or stale reconciliation. It emits counts/timestamps only, never customer, subscription, or Discord identifiers. After the role repair and reconciliation, GitHub Actions run `34795945247` passed with 2 active subscriptions, 0 unlinked members, 0 reconciliation failures, 0 failed/stuck webhooks, and `reconciliationStale=false`.
- **Membership access synchronized:** production reconciliation discovers Stripe subscriptions rather than only rows already known to Supabase. It imported both observed live subscriptions and carries their Stripe-stored Discord IDs into normalized customer rows. The owner moved the active managed role `Kobe's Betting Hub` above `VIP`; readiness returned `manageRoles=true`, `hierarchyReady=true`, and `ready=true`. Controlled reconciliation then checked 2 subscriptions and granted 2 roles with 0 failures. The unrelated `Kobe Bot` integration role remains cleaned up without `Manage Roles`.
- **Launch operations expanded:** the scheduled private Actions alarm now includes a read-only aggregate pick dashboard for stuck approvals/publications, unresolved post failures, recap failures, recent network failures, publication volume, OpenAI request volume, and estimated extraction cost. Discord pre-response failures now produce redacted audit rows. ESPN grading covers additional common football props plus explicit spreads and full-game totals. A fixture-only recap/Trends acceptance passed with zero external delivery. A deterministic 1080×1920 Instagram Story asset now derives only from the Kobe-approved Free Pick terms; the same approval avoids duplicate X posting and queues a private social-package email. The Google operations source is consolidated into one generated bundle with activation timestamps that exclude old queued mail. The complete release suite passes `210/210`.
- **Private Trends transport activated:** one dedicated credential is aligned across the Publisher Worker, Render, and Apps Script without entering the repository or this control file. Render polls every five minutes. The first Render poll correctly failed closed because the private approval channel was absent from `ALLOWED_CHANNEL_IDS`; the production allowlist was repaired, the replacement deployment succeeded, Kobe Bot logged in, and startup no longer reports the allowlist error. Google authorization and the read-only Trends connection passed. `queueKobeTrendEmails` is installed every five minutes with the backlog-exclusion timestamp in force. Its first scheduled Apps Script runs exposed a missing `Kobe Trends` Gmail label; the label was created and an immediate empty-label worker run completed successfully without queuing or publishing content.
- **Recap delivery activated:** with explicit owner approval, the existing production Render recap credential was copied directly into the matching Apps Script property without entering the repository or audit text. The read-only connection test then completed, `deliverKobeRecapNotifications` was installed on a five-minute trigger, and its first scheduled run completed successfully. The backlog-exclusion timestamp remains in force, so the five pre-activation rows were not replayed.
- **Free Pick social fallback activated:** text-only Kobe-approved Free Picks can now use the X queue when the image-backed Publisher path did not already post. The duplicate-post guard remains in force, and activation made no public test post.
- **Render restart recovered:** repeated audit initialization exposed a non-repeat-safe referral constraint migration after the release push. Commit `65a128f` now removes the named constraint before recreating it; the production restart registered commands, logged in as Kobe Bot, refreshed three pending cards, and resumed its normal grading/recap loop.
- **Fresh Discord acceptance passed:** on 2026-09-14 Kobe approved and published the Travis Kelce over 3.5 receptions Free Pick to `#daily-free-play`; the locked member-facing card appeared normally and no disappearing approval result was observed. This closes the fresh approval-card terminal-result gate. A separate source card exposed the irrelevant engagement CTA `150 ❤️s if you want some parlays`; the formatter now removes engagement bait while preserving the wager and relevant support, with the complete release suite passing `211/211`.
- **Live cancellation acceptance passed:** at 21:23 MST on 2026-09-14, Kobe used the production Discord-authenticated Stripe Customer Portal to schedule exactly one of his two live memberships to end on 2026-09-30 at 08:38 Pacific/Arizona time. Stripe kept it active through the paid period, showed no further invoice, and did not alter the second subscription. Its signed `customer.subscription.updated` delivery returned `200`; production Supabase recorded one scheduled cancellation through `cancel_at`, retained two currently active memberships, kept the scheduled membership unblocked, and marked the webhook `PROCESSED` with `ROLE_GRANTED`. GitHub Actions run `34930217840` independently passed with zero unlinked memberships, reconciliation failures, failed/stuck webhooks, or stale-reconciliation alerts.
- **PUBLIC BETA GO:** Zakai Martin recorded GO at 2026-09-14 21:51 MST. Organic invitations may open to the active Discord audience. Verify the first five paid signups end to end and pause new invitations on any charge/access, duplicate-subscription, or portal failure. Paid advertising and referral promotion remain held until the first operating day closes cleanly.
- **Staging time-based proof passed:** an isolated Stripe test clock produced the `$8.25` one-time discounted invoice, returned the following invoice to `$32.99`, ended the canceled subscription, persisted Supabase `canceled`, recorded `PROCESSED/ROLE_REMOVED`, and received Discord role DELETE `204`.
- **Post-launch acceptance still required:** monitor the scheduled membership at its 2026-09-30 entitlement end and confirm the terminal webhook, Supabase `canceled` state, and Discord role removal. The isolated terminal path already passed. Do not publish test content publicly without explicit approval.
- **Known exception under control:** two live `$32.99/month` subscriptions remain visible for the same member email, but exactly one is now scheduled to end September 30 and the other remains active. Do not modify the remaining subscription without a new explicit member request.

### What is definitely live

- `https://kobesbettinghub.com` is served by the Cloudflare Worker `kobes-betting-hub` from a shared repository-generated static manifest. The same manifest is used by the GitHub Pages workflow so the two deployment paths cannot silently omit different files.
- Cloudflare's full cache was purged and the stale membership page was replaced. `cancel`, `cancel.html`, and `cancel.js` all return `200` on the custom domain.
- Membership checkout is enabled. Offers shown publicly are `$10 / 7 days` or `2 days free`, followed by `$32.99/month` until canceled.
- The checkout Cloudflare Worker is reachable and reports healthy. It now also runs a daily 09:15 Arizona Stripe-to-Supabase-to-Discord reconciliation and records success/failure membership events.
- Checkout hardening prevents an existing Stripe membership or Discord identity from being silently relinked through a replayed completion URL, accepts valid Stripe signatures during secret rotation, reduces portal OAuth to `identify`, and writes exact Cloudflare Worker version IDs into API audit events. Browser retries now reuse a validated UUID as Stripe's `Idempotency-Key`, preventing duplicate Checkout Sessions from ambiguous repeat submissions.
- Stripe Checkout creates subscriptions. After payment/trial confirmation, the customer connects Discord through OAuth and receives the configured paid-member role.
- Stripe checkout/subscription/invoice/refund/dispute webhooks maintain Supabase membership state and reconcile Discord access. The live Stripe event destination is active for the eight approved event types, including Checkout completion and invoice payment failure.
- A Render background worker runs the Discord bot and X collector from `main`, with a 1 GB persistent disk at `/var/data`.
- The production X collector is enabled for 38 configured sources. Its effective interval is 15 minutes during the configured daily Arizona window.
- The Render environment and repository are configured for `gpt-5.6-luna` with bounded output, no reasoning, versioned pricing metadata, and reusable audited extractions.
- The free Supabase project `kobe betting hub` is healthy. Migrations through `009` are live, including the API ledger, cancellation fields, server-role grants, and entitlement blocks. The Checkout Worker uses a dedicated server secret; Render uses the encrypted session-pooler connection with fail-closed audit enforcement. A first 48-hour OpenAI import wrote 14 hourly usage rows and three daily cost rows. Migration `005` preserves those initial project-only cost rows under the explicit `openai_costs_api_unscoped` label before new project-and-key-scoped imports are stored.
- The publisher Cloudflare Worker reports ready, connected to X, and configured with free-tier KV Free Pick media storage. All five outbound X media/post/token call paths now append redacted, immutable D1 audit rows with status, latency, provider request ID, hashes, trigger, and Worker version; no token, OAuth code, tweet text, media, or raw response is retained.
- `node scripts/production-smoke.mjs` performs five credential-free read-only checks covering Checkout health, Publisher health, current Free Pick shape, public Free Pick HTML, and the client asset. The first post-deploy run correctly detected KV propagation lag; the retry passed all five checks and the live page visibly rendered the Bijan pick.
- Discord `#daily-free-play` contains canonical record `20260912-148-X` (Bijan Robinson over 29.5 receiving yards, -140). A dedicated website-publication credential is now encrypted independently in Render and Cloudflare. The owner-approved text-only synchronization returned `201`, the KV current endpoint returned `200`, and the live public page rendered the same Bijan selection. No Discord or X action occurred during this repair.
- A controlled manual audit checked one recent `@CappersUSA` X candidate through Luna with a one-candidate cap and `--no-discord`. It was held as `SOURCE_EXTRACTED`; no member or Discord publication occurred.
- Current Render commit `6989dd1` includes the exact Bijan production formatting regression fixture and formatter corrections for duplicated `YDs`/`Yards` terms, a repeated shorthand selection bullet, and the dangling URL-dependent clause.

Observed output-quality evidence: the 2026-09-12 Discord screenshot shows a published Bijan Robinson card with duplicated pick terms in the title/first bullet and an incomplete sentence ending in “including 82 yards at”. That exact case is now a passing regression fixture: future rendering collapses `YDs`/`Yards` duplicates, removes the repeated selection bullet, and trims the broken URL-dependent clause. A successful transport remains insufficient proof of a correct card.

### What is not production-ready even though parts are live

- Effective public Terms and Privacy pages are live for Kobe Irwin operating publicly as Kobe's Betting Hub in California. They disclose recurring billing, public-beta status, cancellation, refund exceptions, retention offers, and dispute-based access suspension. Counsel review and a legal/compliance owner remain operational follow-ups, not proof that the technical lifecycle works.
- `support@kobesbettinghub.com` is active and forwards to `themartinventures@gmail.com`. Public support hours are Monday through Saturday, 9:00 AM–7:00 PM Pacific Time, with a response target of one business day.
- Membership persistence now uses Supabase for normalized customer/subscription state and signed webhook event idempotency. Stripe remains the payment and subscription source of truth; Discord role state is the derived entitlement.
- The Checkout Worker now authenticates returning members with Discord OAuth and then creates a Stripe Customer Portal session. Discord proves which linked member is acting; Stripe authenticates and performs billing, recurring subscription, invoices, payment-method changes, and cancellation.
- All 38 X sources are approved for monitoring only and are marked `PENDING_SOURCE_TERMS`; none is marked `CONFIRMED` for reuse/publication. `X_SOURCE_PUBLISHING_ENABLED=false` now enforces that owner decision in production.
- Render has a pooled `DATABASE_URL` and `AUDIT_DATABASE_REQUIRED=true`. The audit-aware worker completed database initialization, registered Discord commands, and logged in as Kobe Bot after deployment.
- Provider calls from the Node collector/bot and Checkout Worker are written to Supabase with endpoint class, payload hashes, outcome, latency, provider request ID where available, and workflow references. Apps Script and Discord SDK-internal traffic remain separate gaps.
- The read-only OpenAI organization Admin key is isolated in GitHub Actions for reconciliation rather than inherited by the long-lived production bot.
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
| Discord operations | Render Node worker | `bot/index.js`, `bot/commands.js` | Discord messages + Supabase workflow events + local logs | Live on `6989dd1`; bounded approval verification deployed |
| X monitoring | Render Node worker | `pipeline/collect-x.js`, `data/twitter-sources.json` | source roster + persistent cursor | Live; cursor/dedupe root is on `/var/data` |
| Model extraction | OpenAI Responses API | `pipeline/enrich-pick.js` | response/request IDs + structured output | Luna + extraction audit live; next-window production evidence pending |
| Pick approval | private Discord channel | `bot/lib/source-review.js`, `bot/index.js` | Kobe button action | Live |
| Pick publication | Discord | `bot/index.js` | Discord message ID + audit event | Live |
| Pick log | Render persistent disk | `bot/lib/pick-log.js` | `/var/data/pick-log.csv` | Live, single-host CSV |
| Pick/member audit DB | Supabase Postgres | `pipeline/audit-store.js`, `pipeline/migrations/` | Supabase Postgres | Migrations through `009` live; Worker and Render connected |
| Event/result verification | ESPN public APIs | `bot/lib/event-timing.js`, `bot/lib/espn-grading.js`, `bot/lib/espn-trends.js` | stored response snapshot/reference after audit cutover | Live, partial market coverage |
| Public Free Pick | Publisher Worker + KV | `cloudflare/bettinghub-publisher.js`, `free-pick.js` | KV `free-picks/current.json` | Live with canonical Bijan text-only item; dedicated cross-service credential verified by hash only |
| X publishing | Publisher Worker + D1 | `cloudflare/bettinghub-publisher.js` | D1 queue/delivery log + X post ID | Connected |
| Trends inbox | Gmail Apps Script + D1 + Render | `cloudflare/kobe-trends-inbox.gs`, publisher Worker, bot | D1 queue + approval packet | Credential aligned; Render poll and five-minute Google trigger live; empty-label worker proof passed; one fresh private-card acceptance remains |
| Recap email | Render + D1 + Gmail Apps Script | `bot/index.js`, `cloudflare/kobe-daily-picks-email.gs` | CSV grades + D1 notification status | Credential aligned; read-only test and first scheduled five-minute delivery run passed; daily zero-pick email suppressed; one future legitimate approved-pick recap remains for content acceptance |
| Support | static support page/manual action | `support.html`, `docs/ISSUE_PLAYBOOKS.md` | `support@kobesbettinghub.com` forwarding to owner | Live manually; Mon–Sat 9:00 AM–7:00 PM Pacific, one-business-day response target |
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
- A dedicated OpenAI organization Admin key named `Kobe Betting Hub Usage Reconciliation` (non-secret ID `key_jtBdyNxNSPYbeNCZ`) is read-only, expires 2026-12-11 19:12 MST, and is stored only as encrypted Render secret `OPENAI_ADMIN_KEY`. Its value is not stored in this repository, Supabase, terminal output, or audit records.
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
| 1 | Cloudflare stale site | **Complete** | Corrected public-site Worker `59485719-9cab-42eb-bf90-1074c21f0156` is live; the responsive membership page and effective policy/support pages were verified; the post-Render-hotfix production smoke again passed all five public checks. | Recheck after future public-site deployments and record the deployed Worker version. |
| 2 | Membership lifecycle | **Complete through live cancellation scheduling** | The isolated test-clock lifecycle passed one-time 75%-off billing, return to `$32.99`, terminal cancellation, Supabase `canceled`, processed role removal, and Discord DELETE `204`. Live portal acceptance then scheduled exactly one production membership to end September 30, preserved paid-through access, returned a signed webhook `200`, persisted one scheduled cancellation, and recorded `PROCESSED/ROLE_GRANTED`; the other subscription remained unchanged. | Monitor the September 30 terminal event and verify production `canceled` plus Discord role removal. Reconcile the first five new public-beta signups individually. |
| 3 | Luna/X monitoring proof | **Complete for the authorized smoke test** | `X_TEST_CANDIDATE_LIMIT=1 node pipeline/test-real-x-pick.js --no-discord` checked one recent `@CappersUSA` post through `gpt-5.6-luna`; outcome was `SOURCE_EXTRACTED`; no Discord, X, member, or public-site publication occurred. | Use the same no-publication harness for future model/prompt changes; the next normal window must still prove bounded production behavior in the durable ledger. |
| 4 | Durable API trail | **Partial / operational** | Supabase migrations `001`–`005` are live; explicit Node and Checkout Worker calls write endpoint/outcome/latency/hash/workflow metadata; eight production ESPN events were observed immediately after cutover. Discord SDK REST responses and pre-response failures are audited without route identifiers, tokens, or bodies. Publisher Worker `33bdf3f7-f0aa-4d8b-b133-9b0ec2212365` routes all five outbound X calls through an append-only, redacted D1 ledger with Worker-version attribution. | Capture the first production Publisher X/OAuth audit row without generating an unauthorized post; add equivalent explicit Apps Script request records; then reconcile zero unclassified provider traffic for a controlled window. |
| 5 | Provider billing reconciliation | **Complete for first OpenAI reconciliation** | Dedicated read-only, 90-day Admin key is isolated in GitHub Actions. The first 48-hour import wrote 14 usage and three cost rows; audited provider data attributes all 3,046 incident requests to `Default project` / `Kobe Pick Monitor` / `gpt-5-mini-2025-08-07`, with 5,519,913 input tokens, 7,085,809 output tokens, and $16.10030665 in the UTC September 12 project cost bucket. | Operate imports before credential expiry, add equivalent X/Cloudflare billing exports where available, and prove one zero-unclassified controlled window. |
| 6 | Cost containment | **Complete, monitoring required** | Luna is active; durable X cursor/dedupe uses `/var/data`; hard pre-call limits are 50 OpenAI requests/day, 500/month, $1 estimated/day, and $15 estimated/month; a concurrency-safe cap permits at most two new model calls per collection run and defers overflow without advancing its cursor; monitored-source publishing is disabled. | Verify the first production deferral/cutoff events and confirm deferred candidates drain across later intervals without unexplained provider traffic. |
| 7 | Free Pick mismatch | **Complete through isolated image acceptance** | A dedicated least-privilege production credential is encrypted in Cloudflare and Render. Canonical pick `20260912-148-X` returned `201`, the current endpoint returned `200`, and the public page rendered it. The separate staging Worker then accepted an authorized PNG with `201`, rejected unauthorized publication with `401`, returned the exact 68 bytes under `image/png`, and had X disabled. Both KV fixture keys were removed after verification. | Use the first real image Free Pick as monitored production acceptance; do not create a public test post. |
| 8 | Membership reconciliation | **Complete — production acceptance passed** | Checkout Worker `bbdf7a3e-1d2c-4ebe-a908-35416b3c0f51` runs Stripe → Supabase → Discord reconciliation daily at `15 16 * * *` (09:15 Arizona) and records outcomes/failures. Role readiness passed after the owner moved `Kobe's Betting Hub` above `VIP`; controlled reconciliation checked 2 active subscriptions, granted 2 VIP roles, and returned 0 failures. GitHub Actions run `34795945247` independently passed with zero access, reconciliation, or webhook alerts. | Continue scheduled monitoring and verify future cancel/payment-failure entitlement changes as they occur. |
| 9 | Legal/support operations | **Partial — customer pages live** | Effective Terms, Privacy, and support pages identify Kobe Irwin operating publicly as Kobe's Betting Hub in California; disclose recurring billing, cancellation, no-refund exceptions, the 75%-off retention option, public beta, and dispute-based access suspension; `support@kobesbettinghub.com` forwards to the owner. Public support hours are Mon–Sat 9:00 AM–7:00 PM Pacific with a one-business-day response target. | Choose retention periods, backup operator, age/jurisdiction controls, and legal/compliance reviewer. A street address is not required merely to prove the technical payment lifecycle, but applicable business/email-marketing laws may separately require one. |

## Current backlog

### P0 — contain cost and prevent untraceable production behavior

- [x] Export the exact OpenAI hourly usage/cost data grouped by project, API key, and model; the full September 12 anomaly is attributable to the Kobe Pick Monitor key.
- [x] Deploy and verify the durable X cursor/dedupe path on the Render persistent disk.
- [x] Provision free Supabase Postgres and apply audit/membership schema migrations.
- [x] Securely connect pooled `DATABASE_URL` to Render and a dedicated Supabase server secret to the checkout Worker; verify fail-closed startup and database migration completion.
- [x] Deploy the API/extraction audit path and prove one X candidate through Luna in `--no-discord` mode.
- [ ] Prove a separate approved test fixture end to end through approval, publication, grade, and recap.
- [x] Implement the OpenAI provider-usage reconciliation job for Usage grouped by project/key/model and Costs grouped by project/key.
- [x] After explicit owner confirmation, create/store a read-only 90-day organization Admin API key in Render and run the first OpenAI reconciliation.
- [ ] Add equivalent X/Cloudflare billing exports where available and automate OpenAI imports before the reconciliation key expires.
- [x] Set temporary OpenAI daily/monthly request and dollar hard stops; owner can revise the conservative caps after provider reconciliation.
- [x] Move the collection-run cap to the actual pre-provider boundary; production permits two new model calls per run and defers overflow without losing its cursor.
- [ ] Reduce production deploy churn: batch changes, use local tests/staging, and do not use `main` as the test loop.
- [x] Enforce the owner decision that the 38 sources are approved for monitoring only by setting `X_SOURCE_PUBLISHING_ENABLED=false`.
- [x] Make public Terms/Privacy/support claims match the live paid product and publish them with the owner-approved operating identity and policy.

### P1 — make memberships and operations reliable

- [x] Deploy the Discord-authenticated Stripe Customer Portal flow and retire Checkout Session-ID membership management.
- [x] Verify test-mode checkout creation and deploy daily Stripe-to-Discord entitlement reconciliation.
- [x] Make ambiguous browser retries reuse a validated Stripe Checkout idempotency key and retain that request ID in the audit event.
- [ ] Complete a live test-identity lifecycle: Checkout, Discord link, portal, cancel, and role removal.
- [ ] Alert on failed webhook processing, Discord role grant/removal, unmatched payment, and duplicate access.
- [x] Implement the owner-approved no-refund exceptions, failed-payment/dispute access suspension, and payment-recovered restoration behavior; support escalation remains manual.
- [ ] Establish a shared support ticket system with named owner and response targets.
- [ ] Finish API audit coverage across Apps Script and Cloudflare. Checkout Worker and all Publisher outbound X call paths are covered; Apps Script requests and Discord pre-response failures remain.
- [ ] Verify end-to-end recap email, Trends email approval, and X delivery with test evidence. The text-only public Free Pick update is verified.
- [x] Establish an isolated staging environment with separate Stripe test mode, Discord test guild/role, API keys, Supabase project, and Worker origin; retain the September 13 test-clock audit.
- [ ] Extend the deployed read-only production smoke command into scheduled alerting and add bot heartbeat, stale-queue, and database-failure checks. The website, Checkout health, Publisher health, current Free Pick API, and client asset checks are implemented and passing.

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
| 2026-09-17 | Publish shared VIP benefit panels on homepage and join page, with icon-led bold labels and orange accent; no unverified capper count, completeness or instant-access claim. Static Worker `e9e73764-5001-4a1f-88f3-981bc0926c62`, commit `7b71810`; 243 tests, 5/5 public smoke and exact production assets pass; regular Arc desktop/320px/400px visuals checked. | Zakai Martin | Live. Existing $10/seven-day and two-day-free intros unchanged, both then $32.99/month. New prepaid plan duration clarification pending before billing implementation. |
| 2026-09-17 | Source-only exclusive private intake, same-day backfill and safe Discord 429 handling. Final quarantine commit `b076acf`, Render `dep-dam69k4s728c73asmm00` live. 240 tests and 5/5 smoke pass; direct reads verify 29 approval cards / 54 exact source wagers. | Zakai Martin / Kobe | 27 owner approvals and two undecided at 15:06; no operator approval/direct publication. Six unclear source candidates held. Separate approval room proposed, not configured. |
| 2026-09-17 | Recover two EZMSports exclusives through private approvals; Kobe approved both and direct reads confirm exact source bets in #exclusives. Deploy `94b4e53` / `dep-dam631n40ujc73ap89bg`; 233 tests and 5/5 smoke pass. | Zakai Martin / Kobe | Initial recovery verified; superseded by broader source-term intake above. |
| 2026-09-17 | Remove phantom ticker spacing across shared-header pages; static Worker `2b8e3541-070c-452d-8416-24699150df15`. 228 release tests and regular Arc visual checks pass; live paid starter invoice/link and September 24 renewal rechecked read-only. | Zakai Martin | Website live; no billing or social-post mutation. |
| 2026-09-17 | Publish curated slogan → existing historical proof → explanation homepage with responsive layout and three new regression tests. Static Worker `2adc34d6-026f-4629-9a3b-f1fe201030d8`; 226/226 release tests and regular Arc desktop/400px/320px visual checks passed. Submit Instagram tester invitation to `kobeslocks`; Meta confirms Pending. | Zakai Martin | Website live; Kobe's tester acceptance and Instagram authorization remain. No billing or social-post mutation. |
| 2026-09-17 | Deploy evidence isolation `4d4b106` through Render `dep-dam5lbfqj5pc73e5smj0`. Release tests passed 223/223; bot login and 5/5 public smoke passed. Direct live Gibbs/DJ Moore card reads show four own-market facts each and matching copy locks. New starter member is linked with VIP present and processed live-mode payment/link webhooks. No Free Pick site/X delivery exists today; Instagram connection is empty. | Zakai Martin | Pick evidence correction live; today's Free Pick message link and Instagram tester/authorization still needed. No billing or public fixture mutation. |
| 2026-09-16 | Deploy source fix `dbd23fd` and Publisher `2f3418de-62bc-4f36-b169-e8521d77d815`: restore original X encryption key, inherit existing Render delivery key into X-only binding, protect X account reconnect and await email authorization. Hold 24 outdated wagers reversibly. X refresh/identity and Render credential checks passed; 217 release tests, 29 live-bundle assertions and 5/5 public smoke passed. | Zakai Martin | Authentication/transport repaired; first genuine X write still required. No public fixture or membership mutation. |
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
| 2026-09-13 | Use a public beta rather than a closed cohort. Invitations may open after the customer-facing acceptance gate, while backend improvements continue without degrading the member experience. | Zakai Martin | Adopted |
| 2026-09-13 | Publish effective policies under Kobe Irwin operating publicly as Kobe's Betting Hub in California; use `support@kobesbettinghub.com` forwarding to the owner. | Zakai Martin | Live |
| 2026-09-13 | Deploy the bounded Discord approval-verification hotfix. Render deployment `dep-dajifs7qj5pc73b9j7pg` made commit `6989dd1` live; startup was healthy and the post-deploy read-only smoke suite passed `5/5`. | Zakai Martin | Complete; fresh approval-card acceptance still required |
| 2026-09-13 | Keep the daily approved-picks Apps Script email but make zero-pick days silent. Delete only the failing `deliverKobeRecapNotifications` five-minute trigger; the Apps Script trigger page then showed two remaining triggers and `sendDailyPackage` at 0% error. | Zakai Martin | Complete |
| 2026-09-13 | Bring the formerly Google-only daily email implementation under repository control and add four invariants covering zero-pick silence, no empty X queue call, no embedded credentials, and trigger-disabled recap polling. Add three image-backed Free Pick transport/fallback/fail-closed tests. | Zakai Martin | Complete; release suite later expanded to `188/188` |
| 2026-09-13 | Create a fully isolated Publisher staging environment with its own D1/KV/secret and no cron, X connection, recap recipient, Discord path, or production binding. Publish/retrieve an exact PNG, reject unauthorized publication, then delete only the fixture keys. | Zakai Martin | Complete; see `docs/STAGING_IMAGE_FREE_PICK_AUDIT_2026-09-13.md` |
| 2026-09-13 | Add a hashed client/network checkout limiter at 10 attempts per 60 seconds. Staging returned `429` plus `Retry-After: 60` before Stripe; production Worker `ff778d91-c34c-4b49-92c9-dfa02785fa37` retained all seven secret names, the reconciliation cron, and `5/5` health. | Zakai Martin | Complete; see `docs/CHECKOUT_RATE_LIMIT_AUDIT_2026-09-13.md` |
| 2026-09-13 | Diagnose the production Discord `403` without exposing identifiers. Readiness proved the active `Kobe's Betting Hub` bot role has `Manage Roles` but is below `VIP`. Disable the mistakenly enabled permission on the separate `Kobe Bot` role. An audited API reorder failed safely because Discord does not let a bot raise its own managed role; the temporary repair route was removed, leaving the owner-UI drag as the only remaining hierarchy action. | Zakai Martin | Cleanup complete; hierarchy drag waiting |
| 2026-09-13 | Complete the Discord hierarchy repair in the owner UI. Production readiness returned `ready=true`; controlled reconciliation checked both active subscriptions and granted both VIP roles with zero failures. GitHub Actions run `34795945247` independently reported 2 active subscriptions, zero unlinked members, zero reconciliation failures, zero failed/stuck webhooks, and a fresh reconciliation timestamp. | Zakai Martin | Complete |
| 2026-09-13 | Add a private read-only pick-operations dashboard to the scheduled owner alarm; expand deterministic ESPN grading for common football props and explicit spreads/full-game totals; audit Discord failures that occur before a response; and add a fixture-only recap/Trends acceptance with no external delivery. | Zakai Martin | `202/202` local release tests pass; production alarm acceptance follows deployment |
| 2026-09-13 | Publish public support hours Monday through Saturday, 9:00 AM–7:00 PM Pacific, with a one-business-day response target. Generate a deterministic Instagram Story PNG from the approved Free Pick terms, keep image-backed X publication single-shot, and queue the Story link to Kobe through the private notification path. | Zakai Martin | Implemented; live email/Trends trigger activation still requires credential alignment and backlog-safe acceptance |
| 2026-09-13 | Consolidate the controlled daily, recap, and Trends Google Apps Script source into one reproducible bundle. Require separate activation timestamps for Trends and recap polling so pre-activation queue rows cannot be emailed, and add read-only connection tests before installing either five-minute trigger. | Zakai Martin | Complete in source; `210/210` tests pass; account-side credential alignment and trigger installation remain |
| 2026-09-13 | Align a rotated dedicated Trends credential across Publisher, Render, and Apps Script; enable five-minute production polling and text-only Free Pick X fallback; save backlog-safe Apps Script activation timestamps. The first poll exposed a missing private approval-channel allowlist entry, which was added before a successful replacement deploy. Google authorization then completed, the Trends connection passed, and its five-minute trigger was installed. No credential value or public test content was retained in the audit. | Zakai Martin | Trends transport live; one fresh private-card acceptance remains |
| 2026-09-13 | With explicit owner approval, copy the existing Render recap credential directly into Apps Script, rerun the read-only connection test, and install the five-minute delivery trigger. The test and first scheduled recap execution completed. Create the missing `Kobe Trends` Gmail label after the first scheduled Trends error, then prove the worker completes with the new empty label and no external delivery. | Zakai Martin | Recap and Trends transports active; one fresh post-activation Trends card and one future legitimate recap/social package remain for content acceptance |

## Owner answers still required

### 2026-09-17 paid-member Discord handoff repair

- Static production version `48f4f5c1-f82e-4d27-96c4-211f3296d25a` and Checkout Worker version `f2bb33a3-b02b-44ec-81bf-25ca0cedd251` are live. Existing Dashboard variables/secrets were preserved with `--keep-vars`.
- Checkout success and future welcome links now land directly on `/join?...#connect-discord`. Paid-return screens put Discord authorization first, hide purchase offers, and independently prevent another checkout submission. Normal plan and referral pricing is unchanged.
- A portal login for an unlinked Discord account returns to the branded management page with private-link recovery instructions instead of a plain-text error. It does not infer the member identity, charge again, or grant access. OAuth tokens still receive best-effort revocation.
- Customer-specific Stripe inspection confirmed a successful $10 starter payment, a valid seven-day subscription period, and no linked Discord metadata. The original checkout passed the live subscription gate and returned a Discord authorization redirect with only `identify guilds.join`. The private recovery link was supplied to the owner for the affected customer only; identifiers and bearer links are deliberately omitted here.
- All 374 automated tests passed, both deploy dry runs passed, and production read-only smoke passed 5/5. The deployed confirmation screen was visually checked and phone-width inspection showed no horizontal overflow (390px viewport/document); purchase offers were hidden and the connection button visible. The branded portal recovery message was visibly verified live.
- Remaining acceptance: the affected customer must authorize their own intended Discord account, after which the VIP role and channel access must be confirmed. Neither a completed customer OAuth nor an Apple Pay purchase-to-access end-to-end run was performed by the operator. Do not claim either has passed yet.

These cannot be learned safely from source code:

1. OpenAI's temporary hard stops are already approved and live. What are the daily/monthly budgets and stop-versus-alert thresholds for X, Cloudflare, Render, and total infrastructure?
2. Who is the backup technical/billing operator and who is the legal/compliance owner?
3. Which Stripe account/mode, Discord server, Cloudflare account, Render workspace, GitHub account, X project, OpenAI organization/project, and Gmail account are the official production accounts? Record identifiers, never secrets.
4. The operating identity, California jurisdiction, support email, cancellation/no-refund exceptions, retention offer, and payment-dispute suspension rules are approved. What age/jurisdiction restrictions, records-retention policy, and legal-review owner should be adopted?
5. What retention period is required for API logs, source content, model inputs/outputs, member identifiers, payment references, and incidents?

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
- September 13 isolated membership clock evidence: `docs/MEMBERSHIP_TEST_CLOCK_AUDIT_2026-09-13.md`
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
