# Next improvements for review — October 22, 2026 MST

Status: research and proposal only; none of these changes are deployed.

## 1. Stop the membership exit dialog from covering education articles

Observed during populated browser testing: the existing “Take a look before you go” membership dialog covered an education article. In site.js, promote excludes several utility pages but allows /education/ routes. showExitDialog runs for desktop exit intent and a mobile upward-scroll gesture.

Proposed change: add an education-route exclusion only inside showExitDialog. Preserve the shared header, ordinary membership links, referral banner and checkout behavior. Leave any mandatory age, consent or legal interface intact. Readers retain normal navigation to membership.

Before: leaving or scrolling back through a guide can open a promotional dialog over the text. After: education articles remain readable through those gestures.

Rationale: Google recommends making content accessible without promotional interstitial interruptions and suggests smaller banners where appropriate. This is an observed reading problem and a potential search-access concern, not evidence that this dialog caused a particular ranking loss.
Source: https://developers.google.com/search/docs/appearance/avoid-intrusive-interstitials

Acceptance checks before release: reproduce desktop exit and mobile reverse-scroll gestures on education pages at 320px, 390px and desktop; confirm no membership dialog appears there; verify homepage behavior and mandatory interfaces remain intact; verify normal article links and checkout entry points still work.

## 2. Make the two statistics guides easier to discover from the learning hub

Current state: both guides are linked from the existing statistics callout and each links to the other. A separate empty category page would add little value.

Proposed review copy inside the existing hub section:

**Sports statistics**
- **Mean, median and combined percentages** — Work through examples and try your own values.
- **Per-game and per-minute rates** — Compare original counts and see what normalization leaves out.

Use normal crawlable links with distinct labels and short summaries, within the existing approved visual treatment. Google recommends descriptive anchor text and crawlable links; this is a navigation improvement, not a guaranteed ranking increase.
Source: https://developers.google.com/search/docs/crawling-indexing/links-crawlable

## Measurement and limits

Check Search Console after Google has had time to discover and process the new guide. Compare actual query impressions, page visibility and clicks against the recorded baseline, keeping the reporting dates explicit. Do not claim lift from deployment alone. Search-volume and localized rank evidence for this new topic are still unknown. No paid tools, backlink outreach or recurring automation were activated.
