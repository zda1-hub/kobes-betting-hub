# Truck campaign day-count correction

- Requested change: anchor Day 1 to the owner's X launch at noon MST on November 19, 2026. The first automatic daily card remains Friday November 20 at 10 AM MST.
- Affected files: `pipeline/truck-daily.js`, `pipeline/road-to-truck.test.js`.
- Before: the daily card counted from the name wall's D1 activation timestamp, so setup on November 18 made Friday's card Day 3. After: the campaign uses November 19 as Day 1, so Friday is Day 2, Saturday Day 3 and so on. The activation timestamp remains required as proof that the wall is live.
- Verification: focused scheduler tests, read-only dry run against the live wall snapshot, and a populated 1080x1350 Friday card render. No posting or flag change from this correction.
- State: local source until merged and deployed; ROAD_TO_TRUCK_ENABLED remains false.
