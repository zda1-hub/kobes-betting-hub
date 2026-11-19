# Truck scheduled activation — 2026-11-19

Requested change: start automatic Road to the Cybertruck posting at 12:15 PM America/Phoenix on Thu Nov 19, after the owner's noon X launch. First automatic daily card remains Fri Nov 20 at 10:00 AM MST, Day 2.

Affected files: `pipeline/truck-activation.js`, `pipeline/run-road-to-truck.js`, `bot/index.js`, `bot/lib/truck-wall.js`, `.env.example`, and scheduler tests.

Before: setting `ROAD_TO_TRUCK_ENABLED=true` immediately armed the Render cron, WIN nudges, and tier celebration posts.

After: those posting paths require both `ROAD_TO_TRUCK_ENABLED=true` and current time at or after `ROAD_TO_TRUCK_START_AT=2026-11-19T19:15:00Z` (12:15 PM MST). The explicit `false` kill switch still stops everything. An invalid start timestamp fails closed. The existing schedule has no Nov 19 daily card and starts Nov 20 at 10:00 MST.

Verification: targeted scheduler and name-wall tests, Render deploy state, and live service configuration should be recorded in the deployment handoff. This audit records the source change; it is not proof of a live post.
