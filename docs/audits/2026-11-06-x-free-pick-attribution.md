# X free-pick click attribution — November 6, 2026

Request: make future X traffic trackable through the KBH membership funnel without treating a click or trial as a paid membership.

Affected files: `bot/lib/free-pick-x.js`, checkout Worker analytics source reporting, focused tests, and this audit. This does not change picks, results, offers, checkout, Stripe billing, or Discord access.

Before: approved free-pick X posts linked to `/free-pick?utm_source=kobe_x`. The dashboard showed that owned-X tag separately from `x`, and the link had no campaign or individual post tag. A user could see two X source rows and could not isolate one free-pick post in first-party attribution.

After: each newly approved free-pick X post uses `utm_source=x` and a unique `utm_campaign=free_pick_<hash>` derived from its internal pick ID. The existing dashboard groups by campaign, so each new post has its own row without a dashboard redesign. The same approved caption is used for image and text posting. Checkout Worker reporting folds historical `kobe_x` sessions into the `x` source row while preserving their captured campaign and raw UTM tag. No prior session or member is reassigned without its recorded X evidence. The URL can identify a campaign and post, not a person or a paid conversion by itself.

Verification: focused tests check stable and distinct post tags, 280-character bounds, image caption flow, and old X source rollup. Actual deployment, a consented X visit, Stripe-verified trial/payment, and VIP activation remain separate release checks; no synthetic customer conversion is generated.
