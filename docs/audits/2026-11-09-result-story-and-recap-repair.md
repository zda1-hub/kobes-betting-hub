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
- PR #379 merged as `d393b0c`. Publisher version `4c89bff5-6702-49ad-953d-76e2ca8e8c39`, Instagram version `5c64638b-dfc5-44ad-8129-246aad7a571a`, and Render deploy `dep-dbp8pgh42hec73d83fkg` reached live. Both public health endpoints responded ready. The first Instagram cron had not yet created its empty result Story table at the initial check.
- The Render bot lacked `Manage Channels`, so its first attempted automatic review-channel repair logged `Missing Permissions`. The signed-in KBH owner duplicated the existing private exclusive recap review channel in Discord. The new `writeup-recap-approvals` channel is private, shows Kobe and Kobe Bot among permitted members, and has ID `1569551927115780187`; the config now points to it. A new bot deploy and a private review-card receipt remain to be verified.
- The config-only deployment `dep-dbp8r115efls73auv4og` reached live, but the new channel stayed empty: old private delivery receipts in persistent state still pointed to messages in the deleted channel. The recap engine now records its review channel ID and invalidates only receipts tied to a replaced channel. A focused migration test confirms one fresh private card and no duplicate on the next scan.
- PR #381 merged as `3fb8717`, and Render deploy `dep-dbp8suoae00c73e2bo20` reached live. At 03:25:43 UTC the bot logged a private writeup recap approval receipt for November 8 with message `1569553616132640779`. The signed-in owner view showed that exact Kobe Bot card in `#writeup-recap-approvals` with an `Overall record 2-1` and a disabled-by-default public path pending Kobe's `Post to writeup recaps` action. No public recap was sent by this repair.
- The Instagram result Story table exists in production and contains zero rows at the 03:26 UTC check. Bot startup logged the five-minute verified-result approval scan and confirmed both Kobe and KBH owner access to its private result-review channel. The first real approved result still needs X parent/reply and Instagram Story media receipts.
- A real private result card, X parent/reply receipt and Instagram Story media receipt remain to be checked after the next verified grade and separate Kobe or owner approval. No synthetic result or public test post was sent.
