# Homepage tracked wins — October 4, 2026

Request: show only winning cards on the homepage, the automatically refreshed total win count, and the date tracking began. Keep the detailed results page factual.

Before: the homepage record tile displayed wins, losses, pushes and voids with mixed outcome cards.
After: that tile is labeled Tracked wins, uses the live overall win count, filters cards to verified wins, and links to Full record, including losses. Copy explicitly identifies winning highlights. The separate recent-wins tile also filters before limiting so intervening losses cannot hide available winning cards. No fabricated totals or win percentage.

Tracking date: bot snapshots now supply trackingSince from the earliest eligible published operating date, including pending picks, across the entire tracked set. The public publisher validates and preserves the optional field. The homepage formats that date without timezone shifting; older snapshots show Since tracking began until the new field arrives. Count refreshes on each page load from the uncached public feed, which the existing bot refreshes automatically.

Files: index.html, home-results.js, bot/lib/public-results.js, cloudflare/bettinghub-publisher.js, and corresponding tests. The proof page continues rendering all settled outcomes; results.html and results.js remain unchanged. Shared typography, spacing, colors and buttons remain unchanged.

Validation: 27 tests pass covering production assets/contracts, original all-outcome proof rendering, homepage win filtering/aggregate count/date, publisher behavior, and full-history tracking date vs unpublished rows. Mobile 390px has no horizontal page overflow and only Win badges. Desktop and production checks pending.

Limit: recent cards come from the existing 50-outcome feed; the overall count and start date cover all eligible tracked publications. Older posts outside the tracking system are not inferred.

Publication: pending GitHub merge and Cloudflare/Render deployment.
