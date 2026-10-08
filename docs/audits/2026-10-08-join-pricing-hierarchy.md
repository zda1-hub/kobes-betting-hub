# Join pricing hierarchy — October 8, 2026

- Requested change: Make the $19.99 First Month offer the sole primary card on `/join`, with three secondary plans below it. Keep the October banner, logo, pricing, renewal terms, existing bento styling, and Discord-to-Stripe flow. Improve mobile readability and alignment.
- Affected files: `join.html`, `join-pricing-hierarchy.css`, `membership.js`, `scripts/prepare-public-site.mjs`.
- Before: The $19.99 card shared a row with Seven Days on desktop and appeared beside it on mobile. Six Months and One Year shared a separate row. Mobile plan copy and buttons were small.
- After: First Month spans the offer area at all widths. An “Other plans” heading precedes Seven Days, Six Months, and One Year. These three cards form a smaller desktop row and a vertical mobile stack. The referral offer continues to show alone when a valid referral code is present.
- Verification: Rendered local 390px mobile and 1280px desktop previews; the featured card spans the page and the three smaller plans sit below it without overlap. Local referral preview shows only its referral card, with the “Other plans” section hidden. `membership.js` syntax and the production public build passed, including the new stylesheet. Billing-disclosure and public-build tests passed; five unrelated legacy layout/content assertions in the broader targeted test selection failed against the current base.
- Unresolved limitations: Conversion impact is unknown; measure offer selections and completed payments after release.
- State: Local only pending release.

## Published follow-up

PR #180 merged into `main` at `829f286`. The public whitelist was built from that merged commit and deployed to Cloudflare Worker `kobes-betting-hub`, version `50651c0f-6b6b-42cb-9620-549f059f7d23`. The custom-domain `/join` page and new stylesheet returned HTTP 200, and a browser check confirmed the featured offer, “Other plans” section, and active stylesheet on the live page. Pricing and checkout routes were not changed. State: published.
