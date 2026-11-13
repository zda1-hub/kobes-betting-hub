# Exclusive to Free Pick approval route — November 13, 2026

Requested change: allow an exclusive pick to be selected as the Free Pick.

Before: exclusive approval cards only offered posting their verified wager terms to `#expert-picks` or rejecting them. Their terms-only source content lacked the independent factual breakdown required by the Free Pick workflow.

After: an exclusive card offers **Prepare as Free Pick**. That action collects a fresh ESPN-supported breakdown for the same verified wager and replaces the private approval preview with the exact Free Pick copy. Kobe can then post the full writeup to `#daily-free-play`, post the original terms to `#expert-picks`, or reject it. Preparation alone publishes nothing. The Free Pick route retains the existing game-time, one-per-day, canonical log, website, X, and Instagram delivery checks. Source claims and source images are excluded from the independent Free Pick writeup. If research cannot verify at least four relevant facts, the card remains VIP-only. A per-card processing guard prevents competing approval clicks while research or publication is in progress.

Affected files: `bot/index.js`, `bot/lib/exclusive-free-pick.js`, `bot/lib/source-review.js`, `bot/lib/telegram-reader.js`, `bot/lib/monitored-approval-reconcile.js`, `pipeline/collect-x.js`, and focused tests.

Verification: `node --check bot/index.js` passed; 103 focused tests passed. No real member-facing post was created during testing.

Release status: local change; production approval-card refresh and the first real Free Pick from an exclusive still require live verification.
