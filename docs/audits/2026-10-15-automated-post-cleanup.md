# Automated X copy cleanup — October 15, 2026

User requested help editing posts, saving removable posts for later, and updating automation after account audit. Removed the ten-like condition from the bot free-pick caption. Added a narrowly scoped publisher compatibility filter that removes only that exact retired sentence from free-x automated posts, including older bot packets. Wager terms, approved evidence, safety footer, result replies, idempotency and approval requirements remain unchanged. No frequency limit introduced that could suppress verified result replies.

33 focused bot/publisher tests passed with existing project dependencies. Publisher pre-release version c63a2d62-de5f-4c54-ad3a-bf6da757dc72. Bindings inspected before release; preserve vars/secrets with --keep-vars. No website deployment.

Live queue inspected separately from local drafts. Public deletion requires final exact-post confirmation; archive before deletion. Follow-up release evidence below.

## Live release and queue cleanup

Published commit 85b9df9; publisher deployed as 0f2f0baa-d061-47ef-a8c3-a1460dc238f3 with --keep-vars. Health confirms ready, X connected, free pick and social email ready. No synthetic X post or email sent for testing. Next actual approved automated pick remains the delivery-level verification; source and payload tests plus deployment do not prove future delivery.

Exported 24 stale draft rows (latest September5) before changing only their statuses to cancelled. Live D1 reports24cancelled and30published; zeroapproved/publishing/failed/draft. Archived copy in primary deliverables/marketing/post-archive-2026-10-15/stale-queue-before.json. Previously published delivery records untouched.

October10 referral post2109002698360332469 saved as text/screenshot and unpinned. UI success toast and refreshed profile with noPinnedlabel verified. Exact permanent-delete confirmation requested; not deleted yet. Current cleanoffer, newreachposts, approvedpickbreakdowns and verified win/lossreplies preserved. No frequency cap or newpost schedule silently created.
