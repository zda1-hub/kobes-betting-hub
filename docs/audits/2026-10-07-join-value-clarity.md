# October 7, 2026 — join-page value clarity

## Requested

Make the membership offer easier to understand and more compelling without changing the established UI, plan prices, billing terms, or checkout flow.

## Before and after

- Before: the first line on the join page described Discord and Stripe setup but did not say what VIP provides. The first-month button said “Join the HUB.”
- After: that line names Kobe-reviewed picks, written breakdowns, tracked results, and the private Discord, then describes the existing Discord-to-Stripe sequence. The first-month button states “Start for $19.99.”
- Affected file: `join.html`. Card layout, colors, type styles, button styling, offer deadline, renewal disclosures, and checkout key are unchanged.

## Verification

- The explicit public build produced 81 entries and contains the revised join page. Four billing disclosure checks passed, including all four offer terms and referral privacy. `git diff --check` passed.
- Two broader bento checks fail against pre-existing stale expectations: extensionless paths in the build and the homepage's old `results.html` link pattern. Neither failure concerns the edited join copy.
- Browser security policy blocked a local `file:` preview, so no visual mobile screenshot was obtained. The change uses the existing text and button elements with unchanged CSS and card markup.

## Limitations and release

- Copy clarity does not establish a conversion lift. Compare plan clicks, checkout starts, and completed payments after release, accounting for the recent dashboard launch and small sample.
- PR [#168](https://github.com/zda1-hub/kobes-betting-hub/pull/168) merged into `main` as `9cb87c6`. Built the explicit public whitelist from that merged commit and deployed only the public site Worker. Cloudflare uploaded one changed asset, `/join.html`; deployed version `e2ac0e30-aca4-4fbd-80d1-6baca5dd3742`.
- The custom-domain `/join` and `/join.html` pages returned HTTP 200. Cache-busted reads confirmed the new benefit line and `$19.99` CTA on the custom domain and Worker domain. An initial unqualified `/join` fetch still returned the prior copy from cache immediately after deployment; cache propagation should be checked separately.
- Status: published, with browser visual verification unavailable under current browser policy.
