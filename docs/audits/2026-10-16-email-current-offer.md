# Current offer in subscriber email — October 16, 2026

User requested the new subscriber receive the current $5 offer and suggested verified result emails. New signup server record: consent 2026-10-16T04:45:48.187Z; free-pick outbox sent at04:45:48.840Z. Personal address not included in audit.

Publisher now reads verified first20 availability before rendering welcome/free-pick email. Open offer: $5 first month, then$32.99/month until canceled, no free trial,20total, endsOct19at10AMMST. Unknown/closed state uses a neutral membership link without advertising stale trial/deal. Source-specific email UTMs retained; no referral-code combination.

One explicitly authorized promotion-only follow-up uses the existing subscribed-only, idempotent outbox. Closed/unverified offer skips it. Provider acceptance receipts are recorded separately from inbox delivery.27publisher tests pass. Result email planner is local only,3tests pass; verified full grades and exact previously-delivered picks required. No result dispatch activated yet.

Release evidence and actual follow-up outcome appended below.

Published publisher version9a1d49be-70e8-4b02-833f-636d8a7c3307 with --keep-vars; live health ready, X connected, free-pick and social email ready. Single latest-subscriber follow-up inserted idempotently at2026-10-16T12:12:46.142Z, pending existing cron. New tests cover single send, provider receipt and closed-offer handling;32tests pass including result planner. Public design untouched. No Instagram Story per user's cancellation.
