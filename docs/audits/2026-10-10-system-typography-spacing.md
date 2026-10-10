# Persistent visual system — October 10, 2026 MST

Requested: center included heading and management card; header icons never stagger; SF Pro, two sizes/weights; symmetric spacing and concentric shapes; remove ticker pause and arrow underlines; persist philosophy.
Files: AGENTS.md (release and primary workspace), site.css, public HTML stylesheet references and Google font links, homepage ticker markup.
Before: multiple font families/scales, narrow header media rule stacked join/menu/social, left-aligned card content, ticker toggle.
After: native Apple system/SF stack with other-platform system fallback; 16px and 24px, weights 400/600. Symmetric 24px desktop/16px mobile card padding, 8px spacing scale and nested-radius rule. Included headings and full management contents centered. Join/menu/social always share one row with smaller icons. Top ticker toggle removed; reduced-motion honored. Link/arrow underlines removed. Price and backend contracts unchanged.
Verification: ten billing/public/build checks pass. Browser 320px mobile: document width 320, text sizes exactly 16/24px, weights exactly 400/600, header controls share centerline (40px button and 32px icons), no ticker toggle. Included/manage computed center alignment; card padding16px. Live 390px screenshot saved primary outputs/audit-2026-10-10/system-type-live.png. Viewport restored.
Published whitelist site Worker: 6e5a0486-7954-4ac4-b5a0-4e23c45fa8a3. Checkout, referral and publisher workers untouched.
Limitations: native SF rendering requires an Apple device; browser test platform uses its system fallback. No font files redistributed. Static local preview cannot load production feed due origin restrictions; not classified as production outage.
