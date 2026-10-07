# October offer urgency — local preview

Requested: implement the supplied October pricing and urgency specification using the Hub's current website.

## Affected files

- `site.js`: adds a shared October countdown, a once-per-session exit prompt, and automatic removal of promotional elements at the offer deadline.
- `site.css`: styles the new elements to match the existing public site.

## Before and after

Before: the $19.99 first-month price and October 22 deadline appeared on the landing and membership pages, without a shared countdown or exit prompt.

After: public pages show a compact sticky banner with the accurate first-month price and renewal terms. The banner links to the membership options. A dismissible exit prompt can appear once per session on desktop when the pointer leaves the top of the page, or on mobile after a rapid upward scroll. At October 23, 2026 00:00 MST (07:00 UTC), these prompts disappear, the landing promotion text is removed, and the first-month offer button is disabled on the membership page. The existing $10 starter, six-month, and annual plans are untouched.

## Verification

- JavaScript syntax check passed using the bundled Node runtime.
- The localhost membership page displayed the countdown and retained the existing pricing, layout, and checkout buttons in a visual preview.
- No payment or production checkout was attempted.

## Limitations and release state

Ported to a clean worktree from `origin/main` (468b1fe). Public HTML files also received fresh `site.css` and `site.js` version tags so browsers load the change. Publication status: pending release verification.

The proposed $49.99 monthly price, $149 football season pass, $349 lifetime pass, and 30-place limit were not added because there are no verified checkout products or access rules for them. The current $19.99 offer is for the first month only and renews at $32.99/month; no permanent $19.99 price lock is supported. The specified `2026-10-23T00:00:00Z` would expire at 5 PM MST on October 22, so the code uses `2026-10-23T07:00:00Z`. Client-side expiry improves display accuracy. The existing checkout worker already rejects the `first_month_back` offer at the same October 23 07:00 UTC cutoff. An exit prompt cannot run on the external Stripe Checkout page.

## Follow-up

Before selling new tiers, define their price IDs, duration, cancellation and access rules, fulfillment obligations, and creator/referral commission treatment. Confirm whether the $19.99 first-month offer should end for direct checkout at the same deadline as referral checkout.

## Deployment follow-up — October 6, 2026 MST

User clarified that this release should include only the banner and exit prompt, with all existing prices and membership plans retained. PR #163 was merged into `main` at `abc3a5e9f8b4b7339129e5f2926ed4d46e889dcb`. The public-only `.public-site` bundle from that commit was deployed through `wrangler.site.jsonc` to Cloudflare Worker `kobes-betting-hub`, version `3872dfcf-7406-4361-94c6-accce8671faf`. No checkout Worker, payment product, access rule, or integration was deployed.

Live verification: `https://kobesbettinghub.com/join` loaded the October offer banner and continued to show $19.99 for the first month followed by $32.99/month, along with the existing $10 seven-day, $134.99 six-month, and $194.99 annual options. The live `site.js` contained the October 23 00:00 MST deadline. No live purchase was attempted. The exit prompt's trigger was verified locally before release; live payment conversion remains to be observed.
