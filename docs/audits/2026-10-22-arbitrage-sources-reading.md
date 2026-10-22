# Arbitrage sourcing and reading release — October 22, 2026

Requested: improve the whole guide's sourcing and reading experience; release only after checks. Preserve the approved public design.

Before: no external sources; risk/FAQ links targeted content inside closed disclosures; no shared hash-opening helper; promotional exit dialog could interrupt long guides; rounded example did not explain payout rounding.

After: four primary-source documents linked beside relevant claims and in a full-width sources/scope chapter. OpenStax supports probability terminology; DraftKings supports its own void/receipt examples; Gambling Commission guidance explicitly limited to Great Britain. No implied external review. Original arithmetic, payout versus profit, cent rounding and exclusions explained. Operational checklist replaced with neutral record requirements. Added Math, Example and Sources navigation; risk/FAQ IDs moved onto disclosures; reused learning.js to open/focus/scroll targets below header. FAQ and source rows span desktop grid; citations visibly underlined. Removed exit promotions on exactly five long-form guides, preserving hub/homepage/banner/checkout behavior. Updated article modification date and cache versions.

Affected: arbitrage HTML, reading.css (arbitrage-scoped additions), site.js, five article script references, education-exit-dialog.test.mjs.

Verification: 26/26 focused tests including public build whitelist and canonical/.html/trailing-slash guide exit behavior, ordinary-page positive control, checkout/session suppression. Browser inspected populated 320,390,1440px layouts; no document horizontal overflow, header top0, source/risk targets open and clear header. Source link underline confirmed computed; desktop/mobile screenshots inspected. Math independently checked: 95.24*2.10=200.004 rounded200.00; total190.48; difference9.52. Primary sources read October22. Existing membership/public integration config preserved. No paid research APIs used.

Limitations: external rules and sources can change; no ranking/indexing guarantee. Native disclosure fallback remains available without JS; automated event tests simulate desktop/mobile inputs rather than physical-device gestures. Source-check date reflects this review, not ongoing monitoring.

Status: verified locally; publication evidence appended after release.
