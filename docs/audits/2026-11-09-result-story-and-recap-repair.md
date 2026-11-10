# Approved result Story and recap channel repair — November 9, 2026

## Request

Finish feasible items from Kobe's social workflow: keep each Free Pick result behind Kobe or owner approval, publish an exact verified X reply and a matching Instagram Story, rotate safe result reactions, and restore the private writeup recap approval route that was failing with `Unknown Channel`.

## Changed locally

- Added a 1080 × 1920 JPEG result card generated from the exact approved grade, wager and final. It displays the direct free Discord invite and no monitored-source attribution.
- The existing private result card now selects a safe win/loss opener without repeating the prior one. Kobe or the owner can edit or reject it. One approval queues X and Instagram separately; failures are shown as needing attention rather than silently reporting delivery.
- The publisher stores one immutable approved result image and one idempotent result Story row per pick. A conflicting grade cannot replace an existing row.
- The existing connected Instagram worker publishes that row as a Story. It preserves container and media receipts and holds uncertain provider failures rather than retrying blindly.
- Bot startup checks the configured private writeup recap review channel. If its ID is gone, it finds the exact private replacement or clones the existing private exclusive recap approval channel's permissions, verifies `@everyone` denial, and uses the new ID for review cards. Public recap posting still needs Kobe's exact-card approval.

## Verification and limits

- 79 focused approval, publisher and Instagram tests passed. Both Cloudflare production configurations passed Wrangler dry runs. The rendered 1080 × 1920 sample card was visually inspected with complete wager, final and Discord invite inside bounds.
- The full repository test command had seven failures in `scripts/learning-inline.test.mjs` because its VM document fixture lacks `addEventListener`; that unrelated public learning-guide script was not changed here.
- Production deployment, a real private result card, the X parent/reply receipt, Instagram Story media receipt and restored recap review-card delivery remain to be checked after merge. No synthetic result or public test post was sent.
