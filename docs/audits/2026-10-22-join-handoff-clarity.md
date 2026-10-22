# Join handoff clarity — October 22, 2026

Requested change: Reduce membership signup friction and improve qualified visits from X.

Affected files: `membership-scene.js`, `index.html`, `join.html`, `membership.html` (scene asset version), and this audit.

Before: The monthly action said “Start 2 days free,” while adjacent copy only said VIP access connects to Discord. The actual first checkout step is Discord authorization, followed by Stripe. A visitor could mistake the Discord login for a detour or failure.

After: The same approved card, button, prices, layout and checkout handlers remain. The supporting copy states the actual order: sign in with Discord, confirm the trial in Stripe, then receive VIP access after checkout and account connection. The benefit line specifies that expert plays include odds. No change was made to billing, auth, access or ad budget.

Verification: Local preview at `127.0.0.1:4173/join.html` displayed the updated text at desktop, 320px and 390px without horizontal overflow or clipped controls. The monthly button reached the preview-only checkout guard and made no checkout request or charge. The explicit public build prepared 108 entries. `billing-disclosure.test.mjs` and `membership-checkout.test.mjs` passed (15/15). The broader `bento-release.test.mjs` had two unrelated existing failures in historical wins count and win-motion harness; they do not exercise this copy.

Limitations: This copy removes a surprise but does not establish that Discord authorization caused the lack of purchases. The current ad's low click volume must be assessed separately. Production checkout completion and VIP activation were not performed in this review.

Release status: The site change merged as [PR #294](https://github.com/zda1-hub/kobes-betting-hub/pull/294), commit `e85284b`. A production build from that exact `origin/main` prepared 108 public entries, and Wrangler uploaded only the four changed public assets (`index.html`, `join.html`, `membership.html`, `membership-scene.js`) with `--keep-vars`. Cloudflare reported version `5c407440-f89a-44e9-99cc-a3db6ac40b7c`. The live tagged `/join` route then displayed the new benefit and Discord-first text alongside the unchanged monthly trial terms in the browser. Live payment and VIP activation were not attempted.
