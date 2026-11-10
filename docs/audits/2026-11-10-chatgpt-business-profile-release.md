# Business-profile site release — November 10, 2026

**Request:** Deploy the approved business-profile readiness changes to KBH's public site while preserving its existing design and integrations. This follows `2026-11-10-chatgpt-business-profile-local.md`; that file records the earlier local-only state.

## Release

- The page and copy changes listed in the local audit were merged through [PR #391](https://github.com/zda1-hub/kobes-betting-hub/pull/391) as commit `a8d77f8b51430caf7d1eec8e44b93ab886a03825`.
- Built from that clean commit with `npm run build:site`. The explicit public build contained 117 entries. The public-site Worker was deployed with `wrangler.site.jsonc --keep-vars`, version `70d18dac-8b2d-4999-bb1b-77fdeea00c9f`, at `https://kobesbettinghub.com/`.
- Only public site assets changed in this deployment. Checkout, membership, referral, email, attribution and Discord bot services were not redeployed.

## Verification

- `node --test scripts/prepare-public-site.test.mjs scripts/search-indexing.test.mjs`: 6 passed, 0 failed. The search-indexing test was updated to include the five new sitemap routes.
- Live HTTP responses were 200 for `/`, `/about`, `/pricing`, `/contact`, `/join`, `/terms`, `/privacy`, `/robots.txt` and `/sitemap.xml`. Live homepage includes the no-wagers notice and Organization schema; robots explicitly permits OAI-SearchBot and GPTBot.
- The live pricing page was visually inspected on desktop and a narrow mobile browser. It displayed all four plans, renewal/cancellation terms, shared navigation and responsible-gambling notice. The local preview was measured at 320px, 390px and desktop with no horizontal overflow, a topmost header and fitting pricing controls. The live browser enforced a 427px minimum viewport, so the 320px/390px evidence is local rather than live.

## Remaining limits

- Live Stripe prices and checkout behavior were not reconciled in this release. Kobe or Zakai should confirm the public plans against Stripe before using the pricing page as a verified external profile source.
- Confirm source-directory count and member/testimonial rights. No OpenAI profile claim or Business Agent application was submitted. OpenAI eligibility remains its decision.
- This release is **published** on the KBH custom domain. The GitHub Pages workflow status is tracked separately; it does not control this Cloudflare deployment.
