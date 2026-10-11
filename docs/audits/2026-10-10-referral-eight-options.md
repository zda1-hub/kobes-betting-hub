# Referral page — eight visual options and Program Rules heading

The user requests eight visual variants centered on the supplied $20 bill, a single Discord/link action, and program terms at the bottom. Follow-up asks that the live rules heading be only “Program Rules,” centered, removing “Simple, verified, auditable.”

## Scope

Live candidate: only `refer.html` rules header changes from two headings to one centered h2. Existing shared CSS already centers the direct h2. Terms, login, link generation, billing, Stripe payouts, eligibility, account handling, and other pages remain intact.

Local comparison artifact: `outputs/referral-options-20261010/` contains eight HTML/CSS concepts and copies of existing bill/logo assets. These use one example link-ready state, not real OAuth. All eight use centered Program Rules with the full current eligibility/verification/hold/tax terms in a bottom disclosure; the seven-day hold remains visible while collapsed. No user data or real account is transmitted. This folder is outside the public-build whitelist.

Directions: clean stack; floating button on bill; orange frame; black reward pass; orange reward pass; three simple steps; bare essentials; entire bill as the button. Preview header uses a compact brand/Join/menu arrangement; final implementation will reuse the actual shared header and real referral hooks.

## Verification

Actual browser renders saved at 320, 390, 1440 for all eight. Header top zero, no page overflow, images loaded, button bounds checked using text Range geometry. Render caught an unsized SVG in option 8; fixed intrinsic icon dimensions and repeated that option. Connect action demonstrates link-ready state; keyboard focus moves to heading and Back restores action. Rules disclosure expanded and source wording retained. No production account connection or payout test.

Release and final screenshots appended below.

## Final result

All 24 concept width checks pass after option-8 SVG repair. Live heading candidate measured center error zero at 320, 390, 1440 with no page overflow. Relevant public contract/release checks: 10 pass, zero failures. Program Rules-only heading published as Cloudflare version `a35e0754-eb24-4879-8534-fc48b25d597b`; live browser confirmed exact heading, centered computed alignment, no removed subtitle, and no browser errors. Only `/refer.html` uploaded. Backend and account integrations were not deployed.

Eight concepts remain local and are not published or selected. Comparison: `outputs/referral-options-20261010/eight-options.png`. Preview: http://127.0.0.1:4173/outputs/referral-options-20261010/index.html. Individual populated screenshots, measurements, expanded rules, and example connected state reside in the same folder. Published heading evidence: `published-rules-heading.png`.
