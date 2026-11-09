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

## Release receipts

- PR #368 merged to main at `f23a701495e2cd9aa4c9cbb71a39b28a3f8d0ccd`.
- Cloudflare Publisher deployed as version `2dcdcb87-e844-446b-b350-a66897772a2e`.
- Cloudflare Instagram worker deployed as version `0ab49eab-21a4-4ee8-a567-cb2c7cf9957e`. Live `/health` reported `configured=true`, Story and Reel publishing enabled.
- Render bot deployed commit `f23a701495e2cd9aa4c9cbb71a39b28a3f8d0ccd` as `dep-dboln50473hc73aopahg`, status live.
- The current public Free Pick remained November 7 pick `20261107-008-X` with a published Story and no Reel asset; no old Reel was released.

The first real Reel receipt remains unverified until the next approved canonical Free Pick is delivered and Meta accepts it.

Follow-up: the five-minute worker now runs Story then Reel in sequence because both paths initialize the same D1 schema. A Story error is logged and the Reel path still runs. The separate delivery receipts remain unchanged.
