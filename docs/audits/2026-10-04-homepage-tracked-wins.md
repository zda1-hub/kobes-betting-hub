# Homepage tracked wins — October 4, 2026

Request: show only winning cards on the homepage, the automatically refreshed total win count, and the date tracking began. Keep the detailed results page factual.

Before: the homepage record tile displayed wins, losses, pushes and voids with mixed outcome cards.
After: that tile is labeled Tracked wins, uses the live overall win count, filters cards to verified wins, and links to Full record, including losses. Copy explicitly identifies winning highlights. The separate recent-wins tile also filters before limiting so intervening losses cannot hide available winning cards. No fabricated totals or win percentage.

Tracking date: bot snapshots now supply trackingSince from the earliest eligible published operating date, including pending picks, across the entire tracked set. The public publisher validates and preserves the optional field. The homepage formats that date without timezone shifting; older snapshots show Since tracking began until the new field arrives. Count refreshes on each page load from the uncached public feed, which the existing bot refreshes automatically.

Files: index.html, home-results.js, bot/lib/public-results.js, cloudflare/bettinghub-publisher.js, and corresponding tests. The proof page continues rendering all settled outcomes; results.html and results.js remain unchanged. Shared typography, spacing, colors and buttons remain unchanged.

Validation: 27 tests pass covering production assets/contracts, original all-outcome proof rendering, homepage win filtering/aggregate count/date, publisher behavior, and full-history tracking date vs unpublished rows. Mobile 390px and desktop 1280px have no horizontal page overflow and only Win badges. The production Full record link opens the truthful ledger with losses visible.

Limit: recent cards come from the existing 50-outcome feed; the overall count and start date cover all eligible tracked publications. Older posts outside the tracking system are not inferred.

Publication: GitHub PR #133 merged as 1227e9f81ea8b47f6e8ff3f62d6cde2fe0a226bd. Cloudflare site version 96cc708d-8712-4c2b-9ead-ffdfc7686ea8; publisher version 8e4221a6-6b45-4b77-864e-d67957ecaeda. Render deploy dep-db1bocivcj2c73a3k6cg confirmed live.

Live receipt at 2026-10-04T20:52:36Z: 330 wins, 318 losses, 11 pushes, 0 voids, 659 settled and 377 pending. trackingSince is August 29, 2026. Browser verifies 330 tracked wins, Since August 29, 2026, and winning cards only. This count increased from 323 during the work as verification continued.

Screenshot: outputs/homepage-tracked-wins-2026-10-04/live-mobile.png in the primary workspace. This receipt commit is saved to the feature branch after the merged implementation to avoid a documentation-only bot restart.
