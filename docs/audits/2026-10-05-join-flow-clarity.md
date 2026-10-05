# October 5, 2026 — join flow clarity

## Requested

Show the Discord-to-payment sequence near the top of the membership page without changing its established bento pricing layout. Investigate whether that sequence explains the all-time funnel drop-off.

## Before and after

- Before: the flow explanation appeared below all plan cards. The lower VIP description also inaccurately said to connect Discord after checkout.
- After: one compact text line above the cards explains `Connect Discord → pay securely with Stripe → VIP access activates after payment`. The lower VIP description now matches the live order. All plan cards, prices, renewal terms, deadline, colors, placement, and buttons remain intact.
- Direct `#offer` links now align the explanation and first plan below the sticky header. Files: `join.html`, `membership-design.css`, `membership.js`.

## Evidence and verification

- The supplied all-time monitor screenshot showed 530 visitor sessions, 124 join-page views, 12 offer selections, 4 Discord verifications, 4 checkout starts, and 1 payment. This is a directional funnel, not a controlled comparison; it spans earlier site and offer versions and includes at least one agent QA selection.
- The largest measured loss was 124 join views to 12 offer selections (9.7%). The 12-to-4 Discord loss may include authorization friction, but these counts do not establish causation.
- The live mobile $19.99 button reached Discord authorization in a read-only QA run before this change. The agent did not authorize Discord or make payment.
- The local preview at 390 × 844 displayed the new line and preserved all pricing cards. Direct `join.html#offer` navigation showed the full line and first card below the sticky header.
- Fourteen checkout and public-build checks passed; `membership.js` syntax and diff checks passed. Three older `membership-benefits` assertions failed because they still expect the pre-redesign homepage, offer button text, and CSS. Those fixtures were not changed in this scoped copy update.

## Limitations and release

- This is a wording and anchor-alignment change, not a checkout redesign. The measured funnel must be compared prospectively after publication to learn whether the line helps.
- Local preview only until release confirmation is appended below.
