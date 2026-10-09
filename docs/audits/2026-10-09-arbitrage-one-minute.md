# Arbitrage one-minute scan request — October 9, 2026

Requested change: run arbitrage discovery once per minute instead of once per five minutes.

Affected files: `.env.example`, `bot/index.js`, `bot/lib/arbitrage-paper-monitor.js`, and its test.

Before: the worker used the monitor's five-minute default with no deployment setting for scan cadence. After: `ARBITRAGE_SCAN_INTERVAL_MINUTES` selects a whole-number interval from 1 to 60 minutes, and the scan log records the selected value. The default remains five minutes until the provider quota can sustain one-minute checks.

Verification: the monitor timing test confirms a one-minute interval scans at 60 seconds and not at 59 seconds; all focused monitor tests pass. Live cadence must be confirmed from Render scan logs after the higher quota is active and the environment setting is set to 1.

Cost and limitation: four sport requests per minute for 11 hours per day use about 2,640 credits/day, or 81,840 credits in 31 days before quote rechecks and approval clicks. The live feed has a 20,000-credit monthly quota. One-minute operation needs a larger provider quota; it does not guarantee more or larger edges. This change is bot-only and does not alter the public website.
