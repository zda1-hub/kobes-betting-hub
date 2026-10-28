# Free Pick results under the original X post — October 28, 2026

Request: publish each verified Free Pick win or loss as a reply to its original @kobesbettinghub pick post, rather than as a standalone X post.

Before: the bot looked up the original X post but, for newer grades, queued a `result-x-0-*` result even if that receipt was absent. The publisher sent only `{ text }` to X for every result, so even a result with a parent ID appeared as a standalone post.

After: the bot requires the confirmed original X receipt before queuing a result, and the publisher sends X's `reply.in_reply_to_tweet_id` for result posts. New `result-x-0-*` posts are rejected. The queue checks for an existing legacy result before allowing a new reply, so previously published grades do not get duplicated. A missing original receipt is reported as `awaiting_original_post`; a rejected X reply is marked failed for investigation, without a standalone fallback.

Affected files: `bot/lib/free-pick-result-replies.js`, `cloudflare/bettinghub-publisher.js`, and their focused tests. No public website UI, pricing, access, ads, or billing code changed.

Verification: focused result/publisher tests passed (33/33); `git diff --check` passed. The broad `npm test` suite was also run and had failures in unrelated `scripts/learning-inline.test.mjs` (`document.addEventListener is not a function`) and `scripts/provision-sports-centered-creator.test.mjs`. No live X reply was made in this verification; X's self-serve API policy may reject an automated reply where the original post has not mentioned the replying account. Delivery receipts must be checked on the next verified grade.

Release state: local implementation only at the time of this entry. Append deployed version and live receipt evidence below when available.
