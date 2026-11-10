# Local business-profile readiness audit — November 10, 2026

**Request:** Prepare the public KBH site for Kobe's possible Businesses in ChatGPT claim and Business Agent application. No claim, application or production deployment was authorized.

## Page-by-page claim review

| Public page | Finding / action |
| --- | --- |
| `index.html` | Replaced “everything you need” decision claim with picks and analysis; changed the arbitrage example from a projected-profit pitch to a clearly hypothetical payout difference; added explicit no-wagers, no-guarantee, age and helpline notice; expanded Organization schema. |
| `join.html`, `membership.html` | Join title/heading now describe an analysis membership. Join explains no wagers or funds, age restriction and help line. Membership route uses the same existing checkout scene. |
| `about.html`, `pricing.html`, `contact.html` | Added factual public pages for identity, actual site-listed plans and contact routes. Pricing states renewal, cancellation and refund limits. |
| `terms.html` | Made the existing information-only clause explicit about not accepting/placing wagers, holding funds or paying tickets. Existing billing and refund provisions retained. |
| `responsible-gambling.html` | Aligned the U.S. help line with the requested 1-800-GAMBLER wording. |
| `recaps.html`, `results.html` | Recaps no longer says “every” verified win when the view is selected wins. Both continue to disclose their wins-only scope; tracked writeup rate is separate from the wins-only list. |
| `proof.html` | Existing member-slip and review page already labels historical examples and says past performance is not a guarantee. Rights/consent need owner confirmation. |
| `free-pick.html` | Existing age, no-guarantee and email-consent statements retained. |
| `faq.html` | Existing plan, cancellation and no-guarantee explanations retained. |
| `support.html`, `cancel.html` | Existing support route and Stripe cancellation disclosures retained; contact page links to them. |
| `refer.html`, `creator.html` | Existing referral eligibility, payment/reward and payout explanations retained. No claim of betting returns. |
| `approach.html`, `exclusives.html` | Existing editorial process and source-directory caveats retained. Directory count and third-party references need owner verification. |
| `guides/index.html` and five guide articles | Reviewed odds, arbitrage, bankroll, writeup and Discord-comparison articles. “Profit,” “sportsbook,” “lock” and “guarantee” references are educational examples or warnings, with risk caveats; they do not advertise KBH as a wagering operator. |
| `education/mean-versus-median.html`, `education/per-game-versus-per-minute.html` | Educational statistics/calculator pages label limits and avoid outcome guarantees. No service claim changed. |
| `privacy.html`, `404.html` | Existing privacy notice and error page have no wagering-service or guaranteed-result promotion. |

Private/member/admin pages (`member.html`, `welcome.html`, `admin-analytics.html`, `partner.html`) were excluded from business-profile copy; their access and billing flows were not changed.

## Crawl and release wiring

- `robots.txt` continues to allow all crawlers and now expressly allows OAI-SearchBot and GPTBot.
- `sitemap.xml` includes About, Pricing, Contact, Terms and Privacy.
- `scripts/prepare-public-site.mjs` includes the three new pages and their stylesheet in the explicit public build whitelist.
- Existing header/footer navigation was extended on public root pages without altering the approved layout system.
- The `Organization` JSON-LD now contains name, URL, logo, truthful description, and Discord/X/Instagram `sameAs` links; no phone or home address.

## Verification performed

- `npm run build:site` passed and produced 117 public entries, including About, Pricing and Contact. Its SEO gate initially identified missing description/canonical tags on Terms and Privacy; those tags were added and the gate passed on rerun.
- `sitemap.xml` parsed as XML; the public build contains the new HTML pages and explicit crawler rules.
- Local preview: http://127.0.0.1:4173/ . Pricing was inspected at desktop, 320px and 390px. At both mobile widths the document had no horizontal overflow; at 320px the header remained at top 0 and all pricing buttons fit their text. About and Contact were opened at 390px; the mobile menu exposed the three new destinations and Contact opened from it. The homepage disclaimer and Organization schema were confirmed in the desktop preview.
- `git diff --check` passed. The preview-only checks did not exercise a live Stripe purchase, a real OpenAI crawl or the owner claim flow.

## Owner review / unresolved limits

- Confirm all checkout prices and terms against live Stripe before deployment. The page reflects the live public site and `membership-scene.js` as observed on November 10; it is not a Stripe reconciliation.
- Confirm support email and social/invite ownership, source-directory count, and rights/consent for testimonial/member material.
- OpenAI may reject a sports-picks business or Business Agent despite the no-wagers distinction. Business verification does not imply agent approval.
- All changes are **local only**. No profile was claimed, no application submitted and no production deployment was made.
