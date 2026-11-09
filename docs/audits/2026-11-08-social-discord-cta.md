# Social discovery links to the free Discord — November 8, 2026

Requested change: Direct KBH social discovery posts and graphics to the verified free Discord invite. The owner asked that the scheduled Bills–Vikings X graphic and copy share one post and that approved Free Pick Stories keep publishing automatically through the existing Story worker.

Affected files: `bot/lib/instagram-story.js`, `bot/lib/free-pick-chat-card.js`, their focused tests, and `cloudflare/bettinghub-publisher.js`. The scheduled X post was edited in X; its body and supplied graphic both contain `https://discord.gg/sB9vzGz2xj`.

Before: the automatic Free Pick Story image printed `KOBESBETTINGHUB.COM`; the separate Free Pick chat graphic had no free Discord invite; the publisher's fallback Free Pick caption pointed to `/free-pick`. The approved Free Pick X copy builder already pointed directly to Discord.

After: future generated Story and chat graphic images print the exact mixed-case Discord invite; the publisher fallback caption and free-pick subscriber emails lead to the same invite. The subscriber email's existing VIP trial link and terms remain present. Existing approval, grading, X and Instagram delivery receipts, checkout, membership, and website routes are unchanged. The Story worker remains the only automatic Instagram Story publisher and is still gated on the current approved Free Pick. A printed URL in an API-published Story is not a clickable link sticker.

Verification: Discord invite API returned Kobe's Betting Hub with no expiry. The latest live approved Free Pick had a published Instagram Story receipt on November 7; the Instagram worker health reported configured and enabled on November 8. The scheduled Bills–Vikings X entry was inspected with the image and Discord body together. Focused Node tests passed 22/22. Both new 1080×1920 JPEG renderings were visually inspected; the full invite fits without clipping. No synthetic Free Pick was published.

Release state: local candidate. Append GitHub, Render, Cloudflare, and next real Free Pick delivery receipts after release. The Nov 7 Story and any already published post cannot be retroactively changed by this patch.
