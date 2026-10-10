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

These user instructions supersede earlier typography/spacing guidance and remain in force until the user explicitly changes them:
- One font family: Apple SF Pro via the native system-font stack (-apple-system, BlinkMacSystemFont, system-ui, sans-serif). Do not download or redistribute proprietary SF font files. Other platforms use their native system fallback.
- Exactly two text sizes: 16px body/controls and 24px headings/prices. Exactly two weights: 400 regular and 600 semibold. Express hierarchy with spacing, color and those tokens; do not introduce additional font sizes or families.
- Use an 8px spacing scale, symmetric card padding (24px desktop, 16px mobile), and consistent leading/trailing/top/bottom insets. Nested rounded surfaces should have outer radius minus inset, with a minimum of 8px; keep existing brand colors and control shapes unless requested otherwise.
- Header controls remain in one row at every supported width. Reduce icons rather than stack or stagger controls. Header surface remains opaque and edge-to-edge.
- Center “What’s included” headings and membership-management card contents.
- No play/pause button in the top ticker. Honor reduced-motion preferences. Arrows must have no text underline.

- October 10 follow-up: neighboring collapsed bento cards align in height; use smooth spring-like disclosure motion. Highlight verified wins with a clear win badge. No gallery play/pause controls; manual browsing interrupts motion, which resumes after four seconds idle. Respect reduced-motion settings and pause while dragging/hovering or viewing an image.

- October 10 containment rule: every icon/arrow/control must remain within its parent’s padded bounds at 320px, 390px and desktop widths. Use min-width:0, flexible layout and explicit intrinsic sizing; never accept overflow or fix it by hiding actionable content. Verify rendered bounds before publication. Result cards size to their content plus symmetric padding, with a responsive maximum; do not impose equal widths or trailing whitespace.
