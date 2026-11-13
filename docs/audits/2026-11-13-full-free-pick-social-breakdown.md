# Full approved Free Pick breakdown on social posts — November 13, 2026

Requested change: Kobe asked that social Free Pick posts carry the entire approved breakdown.

Affected files: `bot/lib/free-pick-breakdown.js`, `bot/lib/free-pick-delivery.js`, `bot/lib/free-pick-site.js`, `cloudflare/bettinghub-publisher.js`, `cloudflare/bettinghub-instagram.js`, and focused tests.

Before: the original X post could show up to three short approved facts; the Instagram Reel caption had only a rotating opener and invitation. The Story asset remains a concise visual summary.

After: the original X post keeps the exact wager and direct free Discord invitation. Any remaining approved evidence points are queued as ordered, deterministic replies under that original post. The publisher retains idempotent receipts and holds uncertain reply deliveries instead of blindly retrying. The Instagram Reel caption includes the exact pick, odds, and all approved evidence points, while keeping the previously requested link out of the caption. If the approved text exceeds Instagram's caption limit, delivery holds visibly rather than silently cutting it. The current public Free Pick payload now carries the structured approved points. Already completed picks are not replayed.

Verification: focused bot, publisher, and Instagram tests passed (90/90). Full repository suite had seven failures outside these files in ESPN, offer, and learning-page tests; no affected focused test failed. No real social post was created by these tests.

Limit: the existing single-frame Instagram Story still shows a concise breakdown. A full-length Story sequence would need a separate multi-slide design and publisher change to remain readable on a phone. The first real delivery using the new format remains unverified.

Compatibility follow-up: today's Reel was already published before the release, and its public pick has no structured breakdown. The Instagram worker now checks the existing published receipt before it requires the new caption fields. This avoids treating a completed Reel as a failed new delivery.

Release receipts: PR #413 merged as `c3a5259`; compatibility PR #414 merged as `57c2746`. Render background worker deployed `57c2746` as `dep-dbrmnum1egvs73a49lpg` and reached `live`. Cloudflare Publisher deployed from the merged source as `ee74b97a-779c-4e30-ba64-c6d139aeb378`; Instagram was redeployed with the compatibility fix as `64ccedba-97dd-4e89-81d2-8df5f4d26a4d`. Both health endpoints returned ready/configured with X connected and Instagram Story/Reel publishing enabled. The November 13 pick `20261113-059-X` was already published and had no structured breakdown in its saved public record; its Reel receipt was `published`. The new format is for newly approved picks and did not republish that pick.
