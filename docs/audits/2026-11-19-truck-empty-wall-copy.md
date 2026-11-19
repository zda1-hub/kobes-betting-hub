# Truck empty-wall wording

- Requested change: while the wall is empty, ask “who's first on the wall?” on the daily card and in its X caption.
- Affected files: `pipeline/road-to-truck-card.js`, `pipeline/truck-daily.js`, `content/road_to_truck.json`, `pipeline/road-to-truck.test.js`.
- Before: the zero-spot card said “new on the wall: who's next on the wall?” and the no-name caption also asked who was next. After: both ask who is first at spot 0. Once at least one spot exists, a day without new names still asks who is next; populated cards keep their existing name list.
- Verification: focused scheduler tests, local zero-spot card render at 1080x1350, and a read-only dry run against the live spot count. No scheduled posts sent; `ROAD_TO_TRUCK_ENABLED` remains false.
- State: source correction until merged and deployed.
