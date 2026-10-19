# KBH member card starts Discord connection — October 19, 2026

## Request and scope

The owner pointed to the orange KBH card on the mobile membership page and asked for a tap on it to enter the Discord connection flow. This is a behavior change to the existing membership scene; the approved card artwork, prices, layout, and checkout service remain intact.

## Before and after

- Before: on `/join` the member card had pointer events disabled and no keyboard action. On the homepage it opened the membership scene, then became inert.
- After: in the open membership scene the card is a focusable button-like control that activates the existing monthly `Start 2 days free` action. That action prepares the same Discord-first checkout, with the same referral, attribution, loading, error, and duplicate-request handling. On the homepage the first tap still opens the scene; the next tap starts the flow. On completed or connected checkout return states, the card remains inactive to avoid a second purchase; the dedicated connection state handles those arrivals.

## Affected files

- `membership-scene.js`: card activation, accessible label and terms association, lifecycle restoration.
- `membership-scene.css`: enable pointer input only while the card is an active checkout control.
- `index.html`, `join.html`, `membership.html`: versioned script and stylesheet references so clients receive the changed assets.

## Verification

- `node --check membership-scene.js` and `git diff --check` passed. The focused billing disclosure test passed. Two existing tests in the broader `bento-release.test.mjs` suite failed in unrelated reviews and wins-motion fixtures; neither failure references the member card.
- In the read-only local preview, clicking the card on `/join` and pressing Space while it was focused each reached the same preview-only checkout message as the monthly button. No checkout request or charge was made.
- On the homepage, the first card tap opened the membership scene, the second card tap reached the preview-only checkout message, and Back restored the original homepage card link.
- Rendered and inspected the settled membership scene at 320px and 390px, and measured the layout at 1440px. The card image loaded, was interactive and stayed within the viewport at all widths; document scroll width equaled viewport width. The primary button label stayed inside its padded bounds, and the header remained at top 0. At 390px the existing orange card, blue action and plan poster composition remained unchanged. An in-progress card animation was observed briefly at 320px; the settled frame fit as expected.
- The external Discord OAuth and Stripe steps were not completed in the local preview. Publication status: local until the release is deployed and checked live.
