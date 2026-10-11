# Member quote cards and public-site visual audit — October 10, 2026

## Request and implementation

The user asked for reviews in one format using members' actual quoted words, and for glaring issues after a website audit. The approved white/gray cards, orange accents, dark-blue actions, header, artwork, and unrelated pages are preserved.

`proof.html` now displays 14 distinct quote excerpts rather than mixed screenshot artwork. They share typography, balanced padding, a quote marker, an attribution footer, and an Original button. Names are used only where shown in the source; otherwise attribution says Member. No star ratings or verified-purchaser claims were added. The dated first-day example remains explicitly August 2024. Duplicate service/picks quotes from alternate artwork were merged; Donny and Jaywayyv's different messages share one source image but remain separate quotes.

The cards share a height at each breakpoint (360px mobile, 320px desktop), with varying desktop widths and a mobile width cap that keeps each full quote readable without sideways reading. The original source screenshots are available through the existing viewer. Word choice is preserved; typographic apostrophes and excerpts are used. Source-to-quote records are in `docs/reviews/2026-10-10-quote-transcriptions.json`.

`home.js` identifies quotes by their review ID, so different authors in one screenshot are not accidentally merged. The source button opens the viewer and receives focus again after Escape. Noninteractive quote text still supports browsing. The existing manual/reduced-motion behavior is preserved. `view-continuity.css` changes are scoped to the review rail.

## Audit evidence

15 public routes at exact CSS widths 320, 390, 1440: home, join, proof, results, free-pick, refer, exclusives, approach, learning index, FAQ, support, cancel, terms, privacy, responsible gambling. 45 screenshots and state snapshots were saved. After the asynchronous results feed completed, 30 actual winning rows were separately checked at all three widths.

- No horizontal page overflow, header displacement, measured button/arrow overflow, broken loaded images, or placeholder `href="#"` navigation was observed.
- All 14 quote cards were present. The longest quote did not collide with its footer at 320px. All quote/source controls fit; responsive heights were equal; desktop widths vary.
- Original source opened, Escape closed, and focus returned to the actual source button at all three widths. A missing-focus return on the new figure was caught and repaired before release.
- Mobile navigation opened and fit in the viewport. The menu retained all public/social links.
- Annual toggle changed the visible price to $194.99 billed yearly and the real action's checkout identifier to `annual`; no checkout request/payment was submitted.
- Lineup search for AlgoPicks returned one matching source.
- Public/worker tests: 305 total, 294 pass, zero failures, 11 previously retired checks skipped. Existing contracts were updated for quote/source provenance and distinct quote IDs.

Evidence: `/Users/z/Documents/ChatGPT/Kobe's Betting Hub/outputs/audit-2026-10-10/quote-cards-site-audit/` (screenshots, state snapshots, measurements).

## Glaring findings / recommended follow-up

1. **Possible repeated result records — source review needed.** The public results API lists the same three October 9 selections for `TbSportsBetting` and `Tbsportsbetting` twice, once with unit sizes and once without. Example groups: `20261009-642-X-W001..003` and `20261009-495-X-W001..003`. These have distinct record IDs. Determine whether these are separate releases or duplicate recaps before deduplicating the data or changing displayed counts. No records/counts were altered.
2. **Repeated odds in Recent Wins — presentation cleanup.** `results.js:10` builds metadata odds even when already embedded in the selection. E.g., “Liberty/Dream u171.5 -115” also displays “(-115)” below. Avoid repeating the same odds, while retaining the original data and capper attribution.
3. **Referral CTA has substantial lead-in copy.** At mobile widths, two long eligibility/explanation paragraphs precede Connect Discord. Recommend leading with “Earn $20 per eligible paid referral,” one short eligibility line, and the action, with detailed rules below. Current referral eligibility/payout rules and UI were left intact.

Review-specific duplicates and mixed artwork are fixed. The remaining three findings are separate follow-up candidates, not silently changed billing/data rules or a global redesign.

## Limits and release status

This is a browser visual/navigation audit, not a fresh purchase/refund/payout or Discord account-authorization audit. Preview account/payout controls intentionally remain unavailable; that is expected preview behavior. Source records do not establish a complete historical 65% calculation. Physical-phone frame-rate behavior was not measured. Initial results loading states were reviewed separately from the populated feed.

Guideline reference: https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md (read October 10). Project/user instructions remain the design contract.

Release details and live verification are appended below.

## Published / final checks

- Public-only build deployed, 88 entries / 159 asset files. Initial version: `0200f4b1-1f31-4502-9820-312769bace9a`.
- Live pointer activation caught a new interaction edge: the rail's drag handler could capture a source-button click. Button/link/form controls now bypass drag initiation; quote text remains draggable. Final version: `33e73d42-c913-496d-a660-67f42da811a7`.
- Final live pointer click opened the correct original screenshot. Escape closed it and returned focus to Original. Live 320px and 391px CSS layouts passed equal height, containment, header placement, and pointer/source focus checks; live desktop was measured at 1440px. The existing live-origin 75% zoom means integer viewport overrides round requested 390 CSS pixels to 391; local checks used exact 390 at 100%. Temporary viewport restored.
- No live browser error logs observed. Five production health/smoke checks passed. Final automated run still 294 pass / zero failures / 11 retired skips. No backend worker, billing, payout, or result data was changed.
- Focused published screenshot: `live-review-section.png` in the evidence folder.
