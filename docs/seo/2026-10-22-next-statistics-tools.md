# Next statistics improvements for review — October 22, 2026 MST

Status: proposals only, no implementation or deployment in this release.

## Research checked

Searches: “basketball per 36 calculator per minute statistics”; “mean median sports statistics calculator”; “weighted shooting percentage calculator basketball”. These were web search samples, not a localized Google rank measurement; they establish available formats, not KBH position, search volume or why another site ranks.

- Calculator Academy offers an interactive per-36 form, formula and variable definitions. Opened directly and reviewed. Source: https://calculator.academy/per-36-minutes-calculator/
- CalculatorSoup offers an input-based mean/median tool, summary outputs and explanatory sections. Opened directly and reviewed. KBH already has a mean/median calculator, so building a duplicate is not the next priority. Source: https://www.calculatorsoup.com/calculators/statistics/mean-median-mode.php
- SimulNBA exposes a per-36 calculator alongside its definition and limitations in current search results. Source: https://www.simulnba.com/definitions/per-36-stats
- CalcEngines appeared in the results but direct opening failed with a redirect loop. Do not treat its full page or interactions as verified.

## Priority 1: Try-your-own two-record rate comparison

Add a small local calculator to the existing per-game/per-minute guide rather than making another near-duplicate page. Each record takes the same statistic total, appearances and total minutes; show per-game, per-minute and per36 outputs alongside the original inputs. Start with the article’s existing invented A/B records. Label the selected period and same-statistic requirement. Keep sources, written example and limitations usable without JavaScript.

Proposed copy:

**Compare two records**
“Use one counting statistic and the same reporting window. These calculations summarize the entered records; they do not predict production in a future game.”

A:48 total,4 appearances,48 minutes →12 per game,1 per minute,36 per36.
B:72 total,4 appearances,120 minutes →18 per game,0.6 per minute,21.6 per36.

Differentiation: compare both views side by side, preserve denominators, and avoid calling a normalized rate a player forecast. Do not copy competitor copy, player claims, rating tiers or proprietary datasets. No API, paid scan, tracking of entered values or AI call is needed.

Acceptance checks: reject blanks, malformed/nonfinite/negative totals, zero or invalid denominators and unreasonable input sizes; distinguish appearances from team games; do not accept percentages as counting totals; independently check exact arithmetic and rounding; keyboard/error announcements/reset; populated320/390/desktop states, no-JS fallback and no network requests from calculation. Review the actual preview before release.

## Priority 2: Reconcile the learning hub’s structured collection

Observed in current source: CollectionPage.hasPart still lists the five original guides but omits both linked statistics articles. Add the two actual canonical pages so the machine-readable collection reflects the visible hub. This is metadata consistency, not a new rich-result entitlement or guaranteed ranking boost. Validate JSON-LD and canonical URLs against the built/live HTML.

## Decision and measurement

Build a useful tool before expanding to more loosely related articles. Google recommends original value and satisfying the reader’s actual task; copying result formats alone is insufficient. Source: https://developers.google.com/search/docs/fundamentals/creating-helpful-content

After indexing/crawl data becomes available, compare page/query impressions and clicks using explicit time windows. Current search position and demand for the new guide remain unknown. No backlink outreach, paid research or automation has been activated.
