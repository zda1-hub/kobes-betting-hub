# October 9 growth offer and arbitrage archive

Requested: use the current crown logo for Kobe Bot, add a free archive for past arbitrage examples, rename the $10 Seven Days button, and prepare a limited $5 first-month offer for 20 members. The user also asked about a prominent $15-to-$505,000 claim.

Public files: `join.html`, `membership.html`, and `membership.js`. The Seven Days button changes from “Trial Run” to “Join now” while retaining the $10 upfront price and $32.99 monthly renewal after seven days. A link-only first-month card is visible from `join?deal=first20` during the Wednesday–Sunday window; it states $5 today, $32.99/month afterward, 20 redemptions, and no free trial. The normal $19.99 first-month offer remains visible on the landing page and normal membership page.

Checkout file: `cloudflare/kobes-checkout-worker.js` and its tests. The existing `first_month_back` association and Discord onboarding remain in use. A server-side `first20` flag applies a separate Stripe coupon for $27.99 off once, capped at 20 redemptions with a Sunday expiry. The worker rejects attempts outside the window and checks the coupon configuration. The $5 deal does not combine with referral rewards. Billing and access continue to use the current monthly subscription price, webhook verification, and Discord provisioning.

Discord: Kobe Bot avatar changed to the site’s `assets/kobes-betting-hub-logo-20261005.png`. Created a public, read-only `#past-arbitrage-examples` channel with an introduction that separates projected returns from verified results. `bot/index.js` and `bot/lib/arbitrage-paper-monitor.js` can archive one approved, VIP-published opportunity per scan after at least 30 minutes and after the live edge disappears. Only the price snapshot rechecked at Kobe’s approval is archived; it is labeled expired and hypothetical. Kobe can add proof of actual settled results separately. The archive remains optional until its Render channel ID is configured.

The $15-to-$505,000 claim was not added: the figures and whether they represent stake, payouts, net profit, or member results need source records and permission to use them. Putting an unsupported number at the top risks misleading visitors and interrupting the existing funnel. If verified, a compact proof card below the main value proposition is the suitable location.

Promotion requirements: X follow/like actions are not checkout gates. X’s authenticity policy prohibits coordinated exchanges for engagement metrics; the offer link and price can be shared in a normal post with an optional follow call to action.

Verification and publication status: tests and public build are recorded in the release notes below. The public build whitelist is used for the website; no unrelated workspace files are published. The offer does not open before Wednesday or after Sunday MST.
