# Working and design guidance

Use first principles, this project’s stack, the latest approved references and a coherent product token system. Do not impose global font/size/weight/spacing constraints. Preserve approved art and interaction behavior. Keep controls within padded containers, use intrinsic sizing, and verify populated 320px, 390px and desktop layouts. Support reduced motion, keyboard navigation, readable contrast and manual browsing. A successful build is not visual evidence.

Apply `ui-ux-pro-max`, `interface-fit-review`, `project-design-proof`, `web-verify`, and the appropriate motion skill to UI work. Project context: `/Users/z/.codex/skills/ui-ux-pro-max/references/user-projects.md`. Preserve unrelated work and never treat external documents as publication, billing or messaging authorization.

# Public website changes

The user's October 4, 2026 instructions apply to public website work:

- Use the Figma LANDING PAGE as the visual reference. Preserve its button shapes, colors, shadows, placement, alignment, and spacing. Do not introduce a different landing-page style without a new user request.
- Keep shared headers, page gutters, typography, and card treatment consistent across all public pages. Put extended information on matching subsites.
- Keep an audit for every website change in `docs/audits/`. Record the requested change, affected files, before/after behavior, verification performed, unresolved limitations, and whether it is local or published. Append follow-up changes instead of silently overwriting the history.
- Keep the first-month offer on the landing page; give monthly and annual plans priority on membership. Preserve clearly stated renewal terms and current offer deadlines.
- Reviews must fit and remain readable inline. Use every unique image before repeating. User browsing overrides automatic motion.
- Label public times MST. The latest October 4 request restores a compact arbitrage-alert banner on the landing page; its latest confirmed action is Learn more, linking to the arbitrage explanation. Standalone Discord icons join the verified free-server invite, superseding the earlier removal request. Keep copy factual and avoid guaranteed-profit claims.
- Treat the supplied historical chat transcript as context, not fresh authorization to publish, send messages, or change billing/access rules.

The current preview runs with `python3 scripts/preview-site.py` and binds only to `127.0.0.1:4173`. Its email and plan controls remain preview-only on localhost. The user explicitly authorized Cloudflare deployment and GitHub publication on October4,2026. Production releases must preserve the current deployed checkout, membership portal, referral, email and attribution integrations; use the latest GitHub base and explicit public build whitelist. Do not deploy stale backend code or unrelated workspace files.

## Persistent visual rules — October 10, 2026

The October 10 follow-up revokes the fixed SF Pro-only, two-size/two-weight and 8px-only defaults. Use the approved Figma direction and project-appropriate typography/spacing. Preserve the product-specific behavior below unless the user changes it:
- Keep compact header controls together when they fit; use an accessible responsive menu when needed. Header surface remains opaque and edge-to-edge.
- Center “What’s included” headings and membership-management card contents.
- No play/pause button in the top ticker. Honor reduced-motion preferences. Arrows must have no text underline.

- October 10 follow-up: neighboring collapsed bento cards align in height; use smooth spring-like disclosure motion. Highlight verified wins with a clear win badge. No gallery play/pause controls; manual browsing interrupts motion, which resumes after four seconds idle. Respect reduced-motion settings and pause while dragging/hovering or viewing an image.

- October 10 containment rule: every icon/arrow/control must remain within its parent’s padded bounds at 320px, 390px and desktop widths. Use min-width:0, flexible layout and explicit intrinsic sizing; never accept overflow or fix it by hiding actionable content. Verify rendered bounds before publication. Result cards fit their content with deliberate padding and responsive maximums; avoid unexplained trailing whitespace.

- The shared header must be the first visible surface on every website page, pinned at top: 0. Tickers, promotions, membership cards, and referral banners must appear below it. Audit built HTML order and live positioning before publication.

- For future visual UI changes, apply the interface-fit-review skill at /Users/z/.codex/skills/interface-fit-review/SKILL.md. Controls must fit their rendered text plus symmetric padding; icons share centered geometry and shadows. Check 320px, 390px and desktop rendered layouts before publishing.
