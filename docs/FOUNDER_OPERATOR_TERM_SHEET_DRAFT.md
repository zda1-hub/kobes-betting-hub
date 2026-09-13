# Kobe's Betting Hub — Founder / Platform Operator Term Sheet (Draft)

Status: negotiation draft only. This is not legal or tax advice and is not ready for signature until an Arizona business attorney and tax professional review the final structure.

## 1. Parties and structure

- **Brand / content principal:** Kobe `[full legal name]`.
- **Platform / operations principal:** Zakai Martin.
- **Business:** Kobe's Betting Hub, operated by `[legal individual or entity]`.
- This agreement must say whether Zakai receives a **contractual revenue share**, an **ownership interest**, or both. A revenue share does not itself promise equity, voting rights, or ownership.

## 2. Recommended compensation proposal

### Launch phase

- For the first **60 days after the first paid public member**, split Collected Membership Revenue **50% to Kobe / 50% to Zakai**.
- Do not make the step-down automatic merely because time passed. The launch phase ends only after the written stabilization checklist is satisfied.

### Stabilized operating phase

While Zakai remains responsible for the platform, Discord membership operations, billing/support systems, API controls, and launch operations:

| Active paid members at month end | Zakai share | Kobe share |
|---:|---:|---:|
| 0–49 | 35% | 65% |
| 50–99 | 40% | 60% |
| 100–199 | 45% | 55% |
| 200+ | 50% | 50% |

- The applicable tier is calculated monthly from distinct paid members whose Stripe subscription is `active` or `trialing` and not refunded, disputed, complimentary, or test-mode.
- A tier increase applies to the entire following month's Collected Membership Revenue and cannot be retroactively reduced.
- **35% is the recommended floor** while the continuing scope above remains assigned to Zakai.
- If both parties insist on a 25% maintenance floor, it starts only after Zakai's work is limited in writing to a defined maintenance package and marketing, daily Discord operations, customer support, new features, and campaign work are removed or separately paid.

### Optional lower-floor alternative

Instead of the member tiers above, the parties may use a guaranteed monthly operator fee plus a smaller revenue share. Suggested negotiation structure: `$[monthly minimum]` paid first, plus **25–30%** of Collected Membership Revenue. The minimum must cover expected support/on-call time and cannot be treated as an advance against future revenue share unless expressly agreed.

## 3. Revenue definition and payment

**Collected Membership Revenue** means cash actually settled by Stripe for Kobe's Betting Hub memberships, minus only:

1. sales or transaction taxes actually remitted;
2. Stripe processing fees;
3. actual refunds and chargebacks for those memberships.

Do **not** deduct content costs, travel, personal expenses, salaries, unapproved marketing, general overhead, equipment, or discretionary spending before the split.

- Kobe separately pays or reimburses approved infrastructure, API, domain, software, and marketing expenses. Expense reimbursement is not compensation and does not reduce Zakai's revenue share.
- Payouts occur every two weeks within three business days after period close, with a Stripe-generated revenue statement and an itemized list of permitted deductions.
- Zakai receives continuing read-only Stripe reporting access and access to the project's audit dashboard/exports.
- Any undisputed late payment carries `[lawyer-approved late fee/interest]` and must be cured within ten business days after written notice.

## 4. Stabilization checklist for any step-down

The 50/50 launch split may step down only after both parties sign a checklist confirming:

- production checkout, cancellation, renewal, failed-payment recovery, and Discord entitlement flows are accepted;
- the API cost controls and audit ledger are operating;
- support address, policies, escalation path, and backup operator exist;
- at least one full billing cycle and the agreed beta acceptance period completed without an unresolved critical incident;
- outstanding build work is moved into a written backlog with agreed owners;
- Zakai's expected weekly workload and on-call window are documented.

If Zakai's assigned work later expands materially—including marketing management, X/Instagram automation, new sales funnels, daily customer support, major integrations, or feature development—the parties must restore the higher applicable tier or sign a separate statement of work **before** that work begins.

## 5. Responsibilities and authority

### Kobe

- Owns final selection, accuracy review, approval, and publication of picks.
- Supplies the brand license, original content, likeness permissions, and timely approvals.
- Approves pricing, public claims, refunds/exceptions, promotions, and gambling/compliance language.
- Is available during the agreed pick and member-support windows.

### Zakai

- Operates the website, checkout integration, membership persistence, Discord entitlement workflow, API controls, monitoring, audit trail, and agreed launch operations.
- Handles only the support and marketing work expressly listed in the final scope.
- May pause automation when necessary to prevent unauthorized publishing, security exposure, runaway API cost, duplicate billing, or incorrect access; Zakai must notify Kobe promptly.

Neither party may expand the other's duties by text message or verbal request without a written change order that states the scope, timeline, and compensation.

## 6. Accounts, data, and access

- Stripe, Cloudflare, Supabase, Discord developer resources, domain/DNS, source repository, email, and social accounts used by the business must be listed in an account schedule.
- Business accounts should be owned by the legal seller/entity, with both principals holding appropriate administrative or recovery access. Neither party may lock out the other except for a documented security emergency.
- Secrets must stay in approved password/secret managers; audit exports must exclude secret values and payment-card data.
- Customer/payment data may be used only for operating the business and must be returned or deleted at termination as the privacy policy and law require.

## 7. Intellectual property

- Each party keeps ownership of code, templates, branding, content, and tools created before this agreement (**Background IP**).
- Kobe grants the business the agreed right to use his name, likeness, picks, and content.
- Zakai grants the business a license to operate the existing platform while compensation is current.
- New custom platform work must be classified in the final agreement as either:
  - business-owned after all agreed compensation/buyout is paid; or
  - Zakai-owned and licensed to the business under the agreement.
- No assignment of Zakai's platform IP should occur merely because expenses were reimbursed. Any permanent assignment must have an explicit buyout price and payment date.

## 8. Termination, buyout, and transition

- Initial term: 12 months; renewal: month-to-month unless replaced in writing.
- Either party may terminate without cause on 30 days' written notice; material breach receives a ten-business-day cure period unless immediate suspension is necessary for fraud, illegality, security, or customer harm.
- If Kobe or the business ends Zakai's operating role without uncured cause, choose one protection in the final agreement:
  1. **Buyout:** six times Zakai's average monthly revenue-share payment over the prior three complete months, plus unpaid compensation and expenses; or
  2. **Tail:** the contracted revenue share continues for 12 months on members acquired before termination.
- The parties must define whether the buyout or tail also applies to a sale, rebrand, migration, account transfer, or substantially similar successor membership business.
- Zakai provides a documented 30-day transition after undisputed amounts are paid. The business must receive operational credentials, runbooks, current source, data exports, and vendor inventory; Background IP remains with its owner.

## 9. Protection and governance terms for counsel

The final contract should include:

- mutual confidentiality and non-disclosure;
- non-circumvention of the agreed compensation through a new Stripe account, entity, brand, domain, or successor offer;
- representations that each party owns or may use contributed content/IP;
- responsibility for taxes, worker classification, privacy, customer disclosures, betting-content compliance, and age/location restrictions;
- indemnification and a reasonable limitation of liability drafted by counsel;
- books-and-records retention and an annual plus for-cause audit right;
- Arizona governing law, notice method, mediation/arbitration or court venue, and attorney-fee rules;
- death, disability, prolonged unavailability, dispute deadlock, and emergency decision procedures;
- changes to percentages, tiers, deductions, or scope valid only in a signed writing.

## 10. Decisions required before signature

- [ ] Revenue share only, equity only, or both.
- [ ] Confirm 60-day launch phase and stabilization checklist.
- [ ] Confirm 35% continuing-operator floor and paid-member growth tiers.
- [ ] Set monthly minimum if using the lower-floor alternative.
- [ ] Choose buyout or 12-month tail.
- [ ] Decide ownership/license treatment of the existing platform and future custom work.
- [ ] Identify the legal seller/entity and each party's full legal name and address.
- [ ] Attach the account schedule, expense budget, scope, support hours, and launch acceptance checklist.
- [ ] Independent attorney and tax review; then execute the final agreement before unrestricted launch.
