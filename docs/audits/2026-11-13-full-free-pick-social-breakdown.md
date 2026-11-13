# Full approved Free Pick breakdown on social posts — November 13, 2026

Requested change: Kobe asked that social Free Pick posts carry the entire approved breakdown.

Affected files: `bot/lib/free-pick-breakdown.js`, `bot/lib/free-pick-delivery.js`, `bot/lib/free-pick-site.js`, `cloudflare/bettinghub-publisher.js`, `cloudflare/bettinghub-instagram.js`, and focused tests.

Before: the original X post could show up to three short approved facts; the Instagram Reel caption had only a rotating opener and invitation. The Story asset remains a concise visual summary.

After: the original X post keeps the exact wager and direct free Discord invitation. Any remaining approved evidence points are queued as ordered, deterministic replies under that original post. The publisher retains idempotent receipts and holds uncertain reply deliveries instead of blindly retrying. The Instagram Reel caption includes the exact pick, odds, and all approved evidence points, while keeping the previously requested link out of the caption. If the approved text exceeds Instagram's caption limit, delivery holds visibly rather than silently cutting it. The current public Free Pick payload now carries the structured approved points. Already completed picks are not replayed.

Verification: focused bot, publisher, and Instagram tests passed (90/90). Full repository suite had seven failures outside these files in ESPN, offer, and learning-page tests; no affected focused test failed. No real social post was created by these tests.

Limit: the existing single-frame Instagram Story still shows a concise breakdown. A full-length Story sequence would need a separate multi-slide design and publisher change to remain readable on a phone. Live deployment and first real delivery receipt: pending.
