# Approved original-ticket background release

User approved real-ticket-match.html preview, requested deploy, unchanged header/padding and easy rollback. Based on latest origin/main b922676. Saved remote Git tag kbh-before-approved-slips-20261015 at that exact base before edits. Independent fresh worktree avoids unrelated work.

Files: index.html, hub-slip-backdrop.css, hub-slip-backdrop.js, public whitelist. Uses exactly four original Historical member slips URLs repeated15times, no generated slips or outcome badges. Fixed static artwork; no automatic background motion. Main copy protected by white radial fade; referral caption has paper surface. Header/shared styles and all content padding/margins untouched. Approved decorative118px band above promotion intentionally shifts following content down118px. Existing checkout/referral/Meta/result integrations unchanged.

Verification: actual rendered320,390,1440 before/after comparison found identical header positions, brand/action positions, widths, margins and padding. All main content x/width unchanged; only y shift118px from decorative band. No horizontal overflow. Evidence screenshots and geometry.json in evidence/2026-10-15-approved-slips.

Rollback: set const ENABLED=false in hub-slip-backdrop.js, rebuild with node scripts/prepare-public-site.mjs and deploy wrangler.site.jsonc --keep-vars. Without enabled class the decorative layer remains hidden, no band is inserted and copy protection styles do not apply, restoring original plain layout. For exact source backup see tag above; do not reset newer backend changes to that tag.

Release and interaction verification appended below.

16existing offer/Meta/public-build tests passed. At320 Join opened first_month_back scene; Back label right132 vs centered logo left140 (8px separation); menu expanded true; no overflow. Added focused rollback test verifying disabled flag leaves layer hidden with no band/body class.
