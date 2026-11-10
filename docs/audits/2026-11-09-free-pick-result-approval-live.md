# Free Pick result approval cutover — November 9, 2026

Requested change: replace automatic X Free Pick result replies with one separate approval by either Kobe or the KBH owner in Discord. Preserve exact verified wager and final facts, and keep Instagram result publishing manual until its own supported publisher exists.

Affected files: `bot/index.js`, `bot/lib/approval-access.js`, `bot/lib/free-pick-result-approvals.js`, their focused tests, `bot/lib/free-pick-result-replies.js`, `bot/lib/free-pick-reel.js`, `render.yaml`, and the operational handoff. PRs #373 and #374 merged to `main`.

Before: a five-minute result scan could request an X reply as soon as an official grade was verified. It was held on November 9 by setting `FREE_PICK_X_RESULT_REPLIES_ENABLED=false` in the live Render worker.

After: Render's KBH worker in the confirmed My Workspace uses `FREE_PICK_RESULT_APPROVALS_ENABLED=true`, private review channel `1552534762021978202`, cutover `2026-11-10T00:49:23Z`, and keeps `FREE_PICK_X_RESULT_REPLIES_ENABLED=false`. Deploy `dep-dbp6mai9lscs73at32vg` of commit `e06122b9d52701231f0076ea462a16d009f4600a` reached `live` at 2026-11-10 00:54:42 UTC. Startup logs at 00:54:46 UTC announced the approval scan; at 00:54:51 UTC the bot verified the private channel and both approvers' read access. No scan error appeared in the startup window.

Verification: 22 focused tests passed for the main approval/Reel change; 15 focused tests passed for the startup channel check. `node --check bot/index.js` and `git diff --check` passed. The worker has a persistent `/var/data/pick-log.csv` path. Existing X publisher URL, queue secret and reply start time were present in the live environment; secret values were not copied. The old automatic X switch was read back as `false` before cutover and set explicitly to `false` during the environment update. The Render Blueprint default was also changed to `false`.

Remaining live limit: no officially graded result after the cutover, private card, approved X queue receipt or public reply was observed during this check. Do not claim the full result delivery path passed until a real result is reviewed and the exact parent/reply receipt is checked. No public test post or message to Kobe was sent. Instagram result posting remains manual. The 28-slot Pacific content calendar is a checklist, not an active scheduler; paired X and Instagram items target the same time but need separate receipts.
