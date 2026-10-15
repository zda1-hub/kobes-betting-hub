# October 14, 2026 — whole-site customer-path audit

## Request and design contract
The user rejected the mobile membership-management screenshot and requested a complete website audit and repair. Preserve the approved KBH art, orange/black cards, dark blue actions, shared header and membership scene. This is a component repair, not a global redesign.

## Findings and fixes
1. **Billing hierarchy:** redundant “Secure account access / Members only” row crowded and wrapped badly. Long duplicated explanations buried the sign-in action. Replace it with one member-billing label, concise intro, visible Continue action, and native expandable access-recovery help. Keep the authenticated Discord-to-Stripe portal hook, retention and feedback hooks, cancellation timing and refund exceptions.
2. **Account card geometry and contrast:** welcome/member cards inherited a zero-inset shell; activation’s support link was nearly black on black. Share the bounded billing-card insets and explicitly style support links with readable contrast and focus/touch room. No access, payment, membership or authorization rules changed.
3. **Arbitrage contrast:** gray introductory text on orange was hard to read. Use dark text on that chapter only; preserve nested callout and other chapter surfaces.
4. **Partner header:** missing view-continuity stylesheet left the tall mobile header. Include the existing shared compact header rules.
5. **Stale free-pick CTA:** removed obsolete `#offer` fragment from the membership link.
6. **Results metadata:** imported Oilers plays could display MLB, FIU could inherit MLB and Blues could inherit College Football. Recognize Oilers as hockey; suppress the two conflicting grouped labels for review without inventing another sport. Wager identity, dates, grades, sources and verification records are untouched. This does not independently re-grade the historical ledger.
7. **404 recovery:** expose Return home as the existing styled primary action.

## Coverage
28 shipped HTML routes, including private entry screens, reviewed in rendered page overview sheets at 390px and 1440px. All 28 routes measured at actual iframe viewport widths 320, 390 and 1440 (84 checks), with no document-width overflow, out-of-viewport actionable controls, overflowing button/summary text ranges or observed broken loaded images. The separately styled private admin sign-in intentionally has no public shared header.

The browser viewport override did not change the browser’s actual viewport. Measurements and responsive evidence therefore use explicitly sized real iframe documents; desktop overview screenshots are scaled for comparison, without changing their 1440px document layout. Temporary local harnesses are excluded from the public build.

| Route | 320 / 390 / 1440 layout | Visual overview |
|---|---|---|
| `index.html` | Checked | Reviewed |
| `join.html` | Checked | Reviewed |
| `membership.html` | Checked | Reviewed |
| `cancel.html` | Checked | Reviewed |
| `welcome.html` | Checked | Reviewed |
| `admin-analytics.html` | Checked | Reviewed |
| `member.html` | Checked | Reviewed |
| `partner.html` | Checked | Reviewed |
| `guides/index.html` | Checked | Reviewed |
| `guides/how-to-choose-a-sports-betting-discord.html` | Checked | Reviewed |
| `guides/sports-betting-arbitrage-explained.html` | Checked | Reviewed |
| `guides/how-to-read-betting-odds-and-line-movement.html` | Checked | Reviewed |
| `guides/bankroll-management-for-sports-betting.html` | Checked | Reviewed |
| `guides/what-a-sports-betting-writeup-should-include.html` | Checked | Reviewed |
| `proof.html` | Checked | Reviewed |
| `approach.html` | Checked | Reviewed |
| `exclusives.html` | Checked | Reviewed |
| `recaps.html` | Checked | Reviewed |
| `results.html` | Checked | Reviewed |
| `free-pick.html` | Checked | Reviewed |
| `faq.html` | Checked | Reviewed |
| `support.html` | Checked | Reviewed |
| `terms.html` | Checked | Reviewed |
| `privacy.html` | Checked | Reviewed |
| `responsible-gambling.html` | Checked | Reviewed |
| `404.html` | Checked | Reviewed |
| `refer.html` | Checked | Reviewed |
| `creator.html` | Checked | Reviewed |

## Behavior exercised
- Shared menu visibly opens at 320px, with Home/Membership/Manage/Support and social links present and contained.
- Billing recovery opens and closes; recovery text explicitly says not to purchase again. Desktop keyboard/dialog and mobile layout checks completed.
- One-year selection changes price to $194.99, billing period to yearly and actual `data-checkout` to annual.
- Membership benefits expand, Back to the Hub returns home.
- Expert search filters to AlgoPicks.
- Member review opens the full-screen original and Escape closes it.
- Empty required email is invalid before local submission; no subscription or email was created.
- Populated recent-wins, previous-day expert records and no-pick-today states loaded from read-only public feeds.

## Automated / production checks
- 218 tests passed; 5 pre-existing retired assertions skipped, 0 failures across selected checkout, trial, promotion, portal, referrals, public build, consent, attribution, metadata, onboarding, benefits and public-contract suites. Exact runner output: local `/tmp/kbh-sitewide-tests.log`.
- Public build whitelist: 94 entries. No bot, publisher or checkout backend changes in this release.
- Production smoke: checkout health, publisher health, current free-pick API, public free-pick page and client asset all passed.
- Live $5 preflight remains scheduled and ready; $5 first month, $32.99 renewal, cap 20, October 15 midnight MST opening and October 19 10AM MST ending.
- Initial crawl checked 133 same-origin route/asset URLs. Only failure was the new not-yet-published billing stylesheet. Static duplicate-H1 finding on referral HTML was its hidden alternate authenticated state; rendered entry has one H1. Stale free-pick anchor fixed.

## Verification limits
No live charge, cancellation, retention acceptance, feedback submission, email opt-in or customer access mutation was performed. Existing automated tests cover these integration contracts; this audit does not claim a real paid end-to-end transaction or a physical iPhone/Safari test. Authenticated private report contents were not exposed. Public result labels were checked, but historical outcomes were not independently re-graded.

## Publication
Local repair and checks complete. Production deployment and final live crawl recorded below as a follow-up.

### Published follow-up — October 14, 2026 MST
- Public Worker version **ae47d64f-22ae-4697-8bd5-c4b656930370**, deployed with `--keep-vars`; 13 changed public assets, 183 scanned files. Checkout/publisher/bot services unchanged.
- Final production crawl: **133 same-origin URLs, zero HTTP failures**. The initial immediate post-deploy browser read briefly returned the previous HTML; after propagation, both curl and a fresh production iframe showed MEMBER BILLING and the new stylesheet. Final screenshots capture the new response.
- Eight changed/critical live routes checked at 320/390/1440: billing, welcome, member, partner, arbitrage guide, results, $5 promotion, 404. No measured overflow or broken loaded images.
- Billing captured from the actual production domain at 320, 390 and 1440. Continue points to the existing authenticated `/discord/login?intent=portal` route. No local-preview error is present on production.
- Returned-portal retention and feedback fields also measured in a clearly labeled local static fixture at all three widths; no billing action was accepted and no feedback was sent.
- Live promotion page displays $5 / $32.99 renewal terms and its midnight opening gate. Production smoke repeated successfully after publication.
- Evidence: `evidence/2026-10-14-sitewide/`, including final crawl, 84-view local measurements, 24-view live measurements, seven desktop overview sheets, mobile review sheets and live billing screenshots.
