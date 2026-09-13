# Kobe's Betting Hub — launch execution board — 2026-09-13

**Objective:** finish everything that can be safely completed today and enter a small, monitored paid beta only after the production membership and pick acceptance gates pass.

**Release position:** not approved for an unrestricted public launch. The technically responsible target is an invite-only Wave A of five trusted members, followed by up to 15 and then 30 only after clean reconciliation checkpoints.

## Verified today

- [x] Production public smoke: 5/5 passing.
- [x] Full current repository suite: 181/181 passing.
- [x] Production X collector is Live with 38 sources, 12 workers, a six-call Luna cap, unchanged daily/monthly cost stops, and public source publishing disabled.
- [x] The first remediated X startup created one private review packet; the six-call acceptance run reduced deferred candidates from 476 to 85.
- [x] Stripe test-clock cancellation, one-time 75%-off invoice, return to `$32.99`, terminal Supabase cancellation, and Discord role removal passed in isolated staging.
- [x] The same-member repeat retention-offer guard passed in isolated staging.
- [x] The repeat-test subscription completed authenticated cancellation and terminal clock advancement: Stripe/Supabase `canceled`, event `evt_1UFHpPE6p9BmPii39F5ZuPiF` `PROCESSED/ROLE_REMOVED`, and member-attributed Discord DELETE `204`.
- [x] Today's production X-to-private-approval path delivered a real current candidate at 10:36 Arizona: Jaxson Dart over 204.5 passing yards (-115). It remains pending in `#pick-approvals`; no member-facing post was made. Kobe must choose the destination or reject it before the publication/log/grade/recap acceptance can continue.
- [x] X throughput was re-audited against the 11:36 Arizona production cycle. Two unanswered cards do not block intake. The six-call-preserving fairness patch is now live as commit `25a487b`; the first post-deploy cycle rotated to roster offset 0 and rejected 527 non-publishable candidates without a public post.
- [x] Discord approval latency hotfix `ff147a2` is Live as Render deploy `dep-dajfgctckfvc739pnomg`. It combines concurrent ESPN verification, direct date-coded packet lookup, bounded required-audit queries, and per-stage timing. The exact-main suite passed 126/126; a fresh Kobe click remains the external acceptance.

## Work Zakai and Codex can finish today

1. **Production membership candidate — complete.** Branch `codex/membership-production-candidate`, commit `5420cae`, is frozen from production `main` base `0c35e46`. Its focused exact-main suite passes 154/154, production smoke passes 5/5, and no production state was changed.
2. **Verify production database recovery — encrypted logical backup complete.** GitHub run `34774738544` created and encrypted the production PostgreSQL archive, decrypted a temporary copy, verified it with `pg_restore --list`, uploaded a 14-day encrypted artifact, and downloaded a checksum-verified local copy. The recovery key exists only in GitHub Secrets and macOS Keychain. A later disposable-database restore remains the full recovery drill.
3. **Review the production migration plan — complete, not applied.** `PRODUCTION_MIGRATION_REVIEW_2026-09-13.md` records exact hashes, SQL effects, compatibility, verification, and rollback posture for only migrations `007`, `008`, and `009`. GitHub run `34775096023` verified the production target and listed exactly those three migrations as pending in plan-only mode; no database writes were made.
4. **Finish adverse billing staging evidence.** Test failed payment/recovery, partial refund, full refund, dispute creation/resolution, and a single-member audited restoration. These remain isolated from real customers and production.
5. **Prepare production Stripe retention configuration.** Create or select the live-mode Customer Portal configuration and 75%-off template only after action-time approval; record identifiers, never secrets.
6. **Prepare production promotion.** Review the candidate commit, migration plan, Worker bindings/secret names, Stripe webhook events, Discord role hierarchy, and rollback points. Production mutation requires Zakai's action-time approval.
7. **Run today's real pick acceptance — waiting on Kobe's pick decision.** The Jaxson Dart candidate reached private approval at 10:36 Arizona. Kobe must inspect the source/evidence and either choose the Free Pick or NFL destination or reject it. If approved, verify the member post, canonical log, final grading, and recap trail. Do not republish monitored-source material without confirmed rights.
8. **Set up the beta desk.** Confirm support address/hours, backup operator, Discord support warning, roster, incident owner, and the first five trusted testers.
9. **Observe the deployed X fairness patch.** Compare distinct sources selected, eligible cards, held cards, model calls, and cost per ready approval. Do not raise the six-call cap during this test.

## Decisions Zakai must provide before paid beta opens

- [ ] Public seller name: legal individual name, registered company, or approved DBA; plus the public business/contact address required for the selected jurisdictions.
- [ ] Supported locations and governing jurisdiction.
- [x] Intended support alias: `support@kobesbettinghub.com` forwarding to `themartinventures@gmail.com`; routing and public-page acceptance remain.
- [ ] Support hours in Arizona time.
- [ ] Backup operator when Zakai is unavailable. Zakai has accepted sole-operator risk for the initial beta, with outage communication as the fallback.
- [x] Failed-payment rule: suspend access when Stripe reports `past_due`; automatically restore only when Stripe returns to `active` or `trialing`.
- [x] Refund/dispute rule: any refund or open dispute blocks access immediately; restoration requires verified eligible payment state and an audited owner action. Voluntary refunds are not offered except where law, card-network rules, or a written owner exception requires one.
- [ ] Discord relink authority and verification method.
- [x] Provisional retention: membership/API audit records for 24 months and ordinary support tickets for 12 months, subject to legal/privacy review.
- [x] Pick-day assignments: Kobe approves and publishes; deterministic ESPN automation grades supported markets; Zakai performs daily closeout and handles exceptions.
- [ ] Beta hours and Wave A roster. Owner preference is a seven-day Monday-to-Monday invite-only beta before unrestricted promotion.

## Production actions requiring separate action-time approval

- Apply migrations `007`–`009` to production Supabase.
- Create/change live Stripe portal or coupon configuration and webhook subscriptions.
- Deploy the production Checkout Worker membership candidate.
- Run a real-money acceptance checkout or cancel a real subscription.
- Send a public Discord/X/email announcement or publish source-derived content.

## Beta go criteria

- Production migration, Checkout Worker, Stripe webhook, Supabase, and Discord entitlement state reconcile with no unexplained mismatch.
- One trusted non-owner acceptance member completes real checkout, Discord linking/role grant, paid-channel access, billing portal entry, and scheduled cancellation with the expected paid-through date.
- Today's pick has a complete approval, publication, canonical-log, grading, and recap trail.
- Price, renewal, cancellation, refund exceptions, responsible-gambling, support, Terms, and Privacy copy agree everywhere and are owner/legal approved.
- No unresolved P0/P1 defect; rollback owner and staffed support window are recorded.
- Zakai records `BETA GO` with date/time/timezone, exact commit/deployment versions, Wave A roster size, and accepted residual risks.

## Deferred until after Wave A

- Unrestricted public promotion or paid marketing.
- Referral program expansion and live reward volume.
- Automatic source-derived public posting.
- Larger model cap without one full day of cost and queue evidence.
- Full operator dashboard and noncritical reporting improvements.
