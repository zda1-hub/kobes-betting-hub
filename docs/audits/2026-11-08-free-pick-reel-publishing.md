# Approved Free Pick Instagram Reels — November 8, 2026

## Request and scope

Publish the approved Free Pick text graphic as a vertical Instagram Reel each time the canonical Free Pick is delivered. Keep the existing Story and X routes, use the free Discord invite, and avoid reposting older picks.

## Before and after

- Before: the bot prepared a 1080×1920 Story JPEG and the Instagram worker published one Story per canonical Free Pick. The chat style card was a JPEG only. No Reel media or delivery receipt existed.
- After: the bot converts the approved chat card to an eight-second 1080×1920 H.264/AAC MP4. For eligible approved terms the Story text card is the fallback. The Publisher stores and serves the MP4 with byte-range support. The existing Instagram worker creates, checks, and publishes a Reel with the approved caption and free Discord invite, then records its media ID separately from the Story. A successful receipt prevents a duplicate. Ambiguous provider outcomes are held for review.
- The Reel is shared to Feed and the Reels tab. Only current approved Free Picks on or after November 8 are eligible; older cards are not backfilled. Staging stays disabled.

## Files

`bot/lib/free-pick-reel.js`, `bot/lib/free-pick-site.js`, `cloudflare/bettinghub-publisher.js`, `cloudflare/bettinghub-instagram.js`, `wrangler.instagram.jsonc` and focused tests.

## Verification and limits

Local tests cover MP4 generation, upload and range serving, separate Reel receipt, one provider create/publish, no duplicate on repeat, and existing Story behavior. The local mock proves the request shape but cannot prove Meta accepted a real Reel. A live Reel receipt and profile check are required after the next approved Free Pick. The existing canonical Free Pick workflow selects one current site pick per operating day; earlier same-day picks remain superseded by that workflow.

Status: local implementation pending merge and production deploy at the time of this audit. Append release receipts below.
