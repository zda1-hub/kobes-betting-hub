# Kobe's Betting Hub — launch execution board — 2026-09-13

**Objective:** finish everything that can be safely completed today and enter a small, monitored paid beta only after the production membership and pick acceptance gates pass.

**Release position:** not approved for an unrestricted public launch. The technically responsible target is an invite-only Wave A of five trusted members, followed by up to 15 and then 30 only after clean reconciliation checkpoints.

## Verified today

- [x] Production public smoke: 5/5 passing.
- [x] Full launch-candidate repository suite: 177/177 passing.
- [x] Production X collector is Live with 38 sources, 12 workers, a six-call Luna cap, unchanged daily/monthly cost stops, and public source publishing disabled.
- [x] The first remediated X startup created one private review packet; the six-call acceptance run reduced deferred candidates from 476 to 85.
- [x] Stripe test-clock cancellation, one-time 75%-off invoice, return to `$32.99`, terminal Supabase cancellation, and Discord role removal passed in isolated staging.
- [x] The same-member repeat retention-offer guard passed in isolated staging.

## Work Zakai and Codex can finish today

1. **Freeze a production membership candidate.** Build it from current `origin/main`, include only reviewed membership/audit changes, record the exact commit and rollback versions, and rerun the full suite.
2. **Verify production database recovery.** Record a current encrypted logical backup or confirmed recovery checkpoint before migrations. Do not assume the Supabase free tier provides point-in-time recovery.
3. **Review the production migration plan.** Plan only migrations `007`, `008`, and `009` against project `mpajyubbnnsdpgdizvht`; verify hashes, RLS, grants, affected row counts, and old-code compatibility.
4. **Finish adverse billing staging evidence.** Test failed payment/recovery, partial refund, full refund, dispute creation/resolution, and a single-member audited restoration. These remain isolated from real customers and production.
5. **Prepare production Stripe retention configuration.** Create or select the live-mode Customer Portal configuration and 75%-off template only after action-time approval; record identifiers, never secrets.
6. **Prepare production promotion.** Review the candidate commit, migration plan, Worker bindings/secret names, Stripe webhook events, Discord role hierarchy, and rollback points. Production mutation requires Zakai's action-time approval.
7. **Run today's real pick acceptance.** A real current pick must reach private approval, be checked by Kobe, publish through the chosen Discord/Free Pick destinations, match the canonical log exactly, grade after the final event, and produce the recap email trail. Do not republish monitored-source material without confirmed rights.
8. **Set up the beta desk.** Confirm support address/hours, backup operator, Discord support warning, roster, incident owner, and the first five trusted testers.

## Decisions Zakai must provide before paid beta opens

- [ ] Public seller name: legal individual name, registered company, or approved DBA; plus the public business/contact address required for the selected jurisdictions.
- [ ] Supported locations and governing jurisdiction.
- [ ] Official support/privacy email and support hours in Arizona time.
- [ ] Backup operator when Zakai is unavailable.
- [ ] Failed-payment rule. Current behavior removes access when Stripe reports `past_due` and restores it when the subscription returns to `active`; approve this behavior or specify a grace period.
- [ ] Refund/dispute rule. Recommended beta rule: any refund or open dispute blocks access immediately; restoration requires verified payment state and an audited owner action.
- [ ] Discord relink authority and verification method.
- [ ] Retention periods for membership/audit records and support tickets.
- [ ] Pick-day assignments: reviewer, publisher, grader, and closeout checker; Kobe remains content approver.
- [ ] Beta hours and Wave A five-person roster.

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
