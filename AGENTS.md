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
