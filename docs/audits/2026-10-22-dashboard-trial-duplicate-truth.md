# October 22, 2026 — dashboard trial and duplicate reporting

## Request and live evidence

After a member completed a $0 two-day trial, the checkout recovery linked his Discord account and the VIP role was verified directly in Discord. A later duplicate $0 trial was canceled. The private dashboard showed the real active trial as `VIP_ACTIVE`, but also flagged both records as a possible current duplicate, counted the canceled trial as a paid cancellation and negative net paid add, showed potential recurring value as lost MRR, labeled a $0 checkout as “Purchased,” and displayed the original scheduled trial end on the canceled record. The active subscription remained correctly separate from eight paid subscriptions.

## Changed files and behavior

- `cloudflare/kobes-checkout-worker.js`: only cancellations of subscriptions with an observed positive payment affect paid net adds, paid retention, paid cancellation history and lost paid MRR. Raw ended subscription history still includes free trials. Duplicate alerts require two simultaneous active subscriptions; canceled historical checkouts remain visible in the member table. Canceled rows no longer show a future renewal/end date as if still scheduled.
- `admin-analytics.js`, `admin-analytics.html`: the overview leads with active subscriptions and its paid/trial split. Current paid metrics are labeled as paid. The member table identifies unpaid canceled trials as ended, labels zero-dollar invoice activity as checkout rather than purchase, and no longer raises an active duplicate badge for resolved pairs. Descriptions and script version were updated without changing dashboard colors, spacing or component structure.
- `cloudflare/trial-reporting.test.mjs`, `scripts/admin-date-filters.test.mjs`: regression cases for canceled duplicate trials, live VIP trial display and distinct paid/trial counts.

## Verification and release

- Local: 91 focused checkout/worker tests and 26 dashboard/reporting tests passed; JavaScript syntax and `git diff --check` passed. The explicit public build prepared 108 entries for production.
- Rendered dashboard and production verification: pending at the time of this note; append the actual result after release. No billing, Discord permissions, or member records are changed by this dashboard correction.

## Released correction and follow-up

- PR #299 merged as `d8b79b1`. The checkout Worker deployed as version `a2d1fb4f-af23-4f7c-a100-903e38839855` and the public site as `6b57c86f-d3c3-4e3c-ac9c-97ee5c2ce706`.
- Live private dashboard at 6:53 PM MST showed 9 active subscriptions: 8 paid and 1 unpaid trial, $263.92 paid recurring MRR, 0 paid cancellations and 0 net paid adds today. Max's active trial showed `VIP_ACTIVE` with a Discord ID; his canceled $0 checkout showed “canceled trial,” “Ended,” no future renewal, and no duplicate alert. It was not counted as a paid member or payment.
- Follow-up presentation: shorten the visible Discord/VIP cells to “Connected” and “Active” for readability, preserving the actual Discord ID under View IDs. This changes display only. The 17 dashboard tests, JavaScript syntax, and diff check passed; new public-site deployment and responsive visual verification are recorded below when complete.
