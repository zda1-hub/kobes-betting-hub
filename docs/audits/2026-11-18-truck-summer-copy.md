# Truck summer 2027 copy correction

- Requested change: replace the earlier production-end wording with the user's “summer 2027” wording while keeping “elon says” attribution. Source supplied by user: https://x.com/elonmusk/status/2120565056429814073.
- Affected files: `bot/lib/truck-wall.js`, `bot/lib/truck-wall.test.js`, `content/road_to_truck.json`, and `pipeline/road-to-truck-card.js`.
- Before: the pinned explainer, launch announcement, queued captions and legacy truck card said production ends in the middle of 2027. After: they say “elon says production ends summer 2027.”
- Verification: truck-wall copy compliance tests and road-to-truck tests pass. The changed X captions remain under 280 characters with the verified 26-17 record substituted. No Discord setup, post or switch flip is part of this correction.
- State: source change only until merged and deployed. Historical `docs/audits/truck-wall-dry-run.json` remains an archived snapshot of the earlier copy, not the live source.
