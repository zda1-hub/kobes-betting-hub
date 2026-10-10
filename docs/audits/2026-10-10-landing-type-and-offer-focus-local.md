# Landing typography and October offer focus — local preview

## Request

Make landing headings consistent in font, weight, and style; keep the paid membership tile as prominent as the free-pick tile; shorten the top October offer copy; assess whether the moving slogan banner distracts from the offer and Join action.

## Affected files

- `index.html`: loads the homepage-only continuity stylesheet and adds the homepage scope class.
- `landing-continuity.css`: hides the moving ticker on the homepage and aligns the key landing headings to Arial, medium weight, normal style at a shared size per breakpoint.
- `site.js`: shortens the top bar to “OCTOBER OFFER $19.99 first month through Oct 22 · Join now,” preserving the countdown and destination.

## Before and after

Before: the animated slogan ticker stacked above the October offer bar. The free-pick, membership, email, and arbitrage headings used mismatched sizes and weights, with the free-pick heading more prominent than the paid tile.

After: the homepage shows one top promotional bar and keeps the existing Join the HUB button. The paid membership and free-pick headings have matching font family, weight, style, and size. The arbitrage and email headings use the same heading treatment. The membership tile still states “$19.99 first month, then $32.99/mo” and the October 22 MST deadline before checkout. The offer bar remains linked to membership and retains its live countdown. The moving ticker remains on other public pages.

## Verification

- Reloaded the active `127.0.0.1:4173` preview and visually checked the homepage.
- Read computed styles: paid and free-pick headings both Arial, 17px, weight 500, normal; supporting scan and deadline text both Arial, normal, weight 400.
- Verified the ticker is hidden on the homepage and the shortened offer copy and countdown render.
- No checkout or production publishing performed.

## Limitations and release state

Local preview only. The working checkout has unrelated modified and untracked files. The effect on paid conversion is unknown without matched funnel data or an A/B test. A production release requires reconciliation with the latest deployed base and explicit public build whitelist.

## Follow-up — user-directed banner placement

The user asked to keep the moving black-and-orange banner at the top and see the blue October offer bar beneath “Picks curated by Kobe,” above the arbitrage alerts. Updated `landing-continuity.css` to restore the ticker and style the offer bar in normal page flow. Updated `site.js` to insert the offer bar after the landing introduction on the homepage; other public pages retain the previous placement. The shortened offer copy, countdown, destination, renewal terms on the membership tile, and matching headings remain intact. The earlier “ticker hidden” verification describes only the first local iteration. Local preview only.

## Follow-up — clearer membership action

The user asked for the October offer bar to look obviously clickable. Updated `site.js` to show a distinct “View membership →” action inside the existing linked bar, and `landing-continuity.css` to render it as a white pill with visible hover and keyboard-focus states. The entire bar remains one link to `join.html#offer`; the action is visual, so no nested interactive control was introduced. Reloaded the active local preview and confirmed the action is visible between the offer text and countdown, with the black-and-orange ticker still at the top. The membership tile retains renewal terms and the October 22 MST deadline. Local only; not published.

## Follow-up — match the VIP card shadow

The user preferred the blue bar without the white “View membership” pill and wanted the countdown before any action. Removed the pill entirely, leaving offer text followed by the countdown. Applied the VIP card’s exact `-4px 4px 9px #00000040` shadow to the full linked bar and held its height at 43px. Reloaded the active local preview and verified the bar is 43px tall, has the same computed shadow as the VIP card, has no action pill, and still links to `join.html#offer`. The moving black-and-orange ticker remains. Local only; not published.

## Follow-up — compact arbitrage preview, tracked wins, and plan copy

Request: Keep the homepage arbitrage preview short with its example behind a dropdown; emphasize the tracked win count with a nearby route to the full record; remove redundant first-month benefit copy; rename the paid seven-day plan action to “Join the Hub.” The user clarified that a local “UPDATING” free-pick status does not establish a live-site issue.

Affected files: `index.html`, `landing-continuity.css`, `home-results.js`, and `join.html`.

Before: The arbitrage card exposed its software explanation before the example; the record showed a shorter win label with the full-record link below the carousel; the first-month plan repeated benefits already stated in the page intro and shared benefits section; and the $10 paid plan used “Trial Run.”

After: The arbitrage card keeps its headline, “See an example” disclosure, and Learn more guide link; the explanatory text is inside the disclosure. The card padding is reduced locally. The homepage count reads “N tracked wins and counting” from the results feed, with “See overall record →” directly below it. The nearby caveat still links the presentation to the complete win/loss/push/void ledger. The first-month card no longer repeats benefits; the page intro and shared VIP benefits section explain what every plan includes. The $10 action reads “Join the Hub” while the paid starter terms and renewal terms remain visible.

Verification: Checked exact markup replacements, dynamic count text, and local preview behavior. No live free-pick behavior, checkout, or production deployment was changed.

Release state: Local preview only. The tracked-win number depends on the results feed and may change; no fixed 538 claim was added. Conversion impact remains unmeasured.

Verification addendum: Restarted `scripts/preview-site.py` on `127.0.0.1:4173` and reloaded both public pages in the local browser. The membership page shows no redundant first-month benefit line and the seven-day button reads “Join the Hub.” The homepage shows the compact collapsed arbitrage card and “538 tracked wins and counting” from the current results feed, with “See overall record →” directly below it. Bumped the homepage results script URL in `index.html` to clear the browser’s cached earlier wording. The homepage preview still shows “UPDATING” for today’s free pick; this local status was not treated as evidence of a production problem.

## Follow-up — record link gutter and plain paid value

Request: Align “See overall record” with the text inside its card, and express paid value near the top without displacing the membership, free-pick, email, and arbitrage sections. A screenshot showed a collaborator's suggested why/how/what language; it was treated as a reference, not copied as a new instruction.

Affected files: `landing-continuity.css` and `index.html`.

Before: The new record link had zero left margin while the surrounding record text used a 22px gutter. The top intro only said picks were curated by Kobe and organized on Discord.

After: The record link uses the same 22px gutter as the heading, count, and notes. The existing intro line is now one paid-value sentence: “One VIP Discord with Kobe-curated picks, written breakdowns, and arbitrage alerts.” The Discord icon remains linked. No new block was added, so the membership card, free pick, email signup, and compact arbitrage preview remain in their existing order. The moving ticker remains for this local comparison.

Release state: Local preview only; not published. Renewal terms stay on the membership card and join page.

Verification addendum: Reloaded the local homepage and confirmed the new paid-value sentence appears above the offer and arbitrage card. The membership tile, daily free-pick tile, and email signup remain visible in sequence. Browser measurements show both the record count and “See overall record” start at 47px from the viewport edge in the tested mobile layout; the link has a computed 22px left margin. The existing Approach page already carries a fuller find/review/follow explanation, so no additional long why/how/what block was added to the homepage.

## Follow-up — Figma-style mobile intro and membership benefits checkout

Request: Restore the Figma landing intro's three compact lines on mobile; add a “What’s included →” jump on the membership page; add a Join button in the benefits card that selects the active first-month offer, then the standard $32.99 monthly price after the October 22 (MST) deadline.

Affected public files: `index.html`, `landing-continuity.css`, `join.html`, `join-pricing-hierarchy.css`, `site.js`, `membership.html`, `free-pick.html`, `meta-pixel.js`, and `cloudflare/kobes-checkout-worker.js`. Release preparation: `scripts/prepare-public-site.mjs` now includes the already-used `landing-continuity.css`. Backend schema: `pipeline/migrations/018_standard_monthly_offer.sql` permits the new `monthly` offer identifier. Verification updates: `scripts/bento-release.test.mjs` and `cloudflare/member-welcome.test.mjs`.

Before: The longer paid-value sentence wrapped the landing intro on phones; the benefits list had no direct jump or checkout action; the October promotion expired to a disabled first-month button. The checkout worker had no immediate-payment standard monthly offer and the database offer constraint rejected such an identifier.

After: The landing intro keeps three compact lines: 120 expert sources with a lineup link, One VIP membership, and Picks curated by Kobe on Discord. The first line uses a narrower mobile label; no unverified 157+ count was introduced. The membership page has a “What’s included →” anchor to the benefits card. That card displays the benefits, a $19.99-first-month Join action and renewal terms. Its button uses the existing Discord-first checkout handler. At the promotion deadline, the featured plan and benefits Join action change to the standard `monthly` offer at $32.99 today and $32.99/month until canceled; the worker maps that offer to the existing monthly Stripe price without a trial or coupon. The landing membership tile and free-pick VIP copy also update after the deadline. No payment or checkout was initiated during preview.

Verification: Reloaded the local homepage at a narrow mobile viewport and confirmed the three intro lines fit without horizontal overflow; the membership, free-pick, email, and compact arbitrage sections remain in order. Reloaded membership, followed the benefits jump, and confirmed the benefits Join button selects the preview-only checkout message on localhost, with no redirect or charge. Simulated a time after 2026-10-23 07:00 UTC and confirmed both primary buttons switch to `monthly` and the displayed terms switch to $32.99. JavaScript syntax checks passed. The targeted public-build, billing-disclosure, checkout-worker, and member-welcome tests passed after accounting for the build's extensionless URLs. The fuller Why/How/What explanation remains on the Approach page rather than adding vertical copy to the landing page.

Release state and limitation: Local preview and source only; neither the public site, checkout worker, nor database migration has been published. The standard monthly rollover will only work in production after the migration and updated checkout worker are released before the public-site change. Verify the configured Stripe monthly price remains $32.99 before release. Existing unrelated working-tree changes were preserved.

## Free-pick dropdown Discord option — October 10, 2026

- Requested change: Add an alternative in the expanded home-page free-pick panel to join the free Discord for free picks.
- Affected files: `index.html`, `landing-continuity.css`.
- Before: The expanded panel only offered email signup and the VIP link.
- After: Below the email consent, the panel says “Or join the free Discord for future free picks →” and links to the verified free-server invite. The wording remains accurate when no pick is posted today; the option follows the existing visual style and has a touch-sized, keyboard-focusable link.
- Verification: Confirmed the new link appears once inside the gated form and points to the same invite as the header Discord icon. Reviewed local preview markup and styling.
- Unresolved limitations: Local preview cannot prove a new pick is currently available in Discord. The link opens the verified free server; Discord controls access there.
- Release state: Local only; not published.

## Landing intro value line — October 10, 2026

- Requested change: Replace the VIP Discord description with the user's confidence-focused copy while retaining the Discord icon.
- Affected files: `index.html`, `landing-continuity.css`.
- Before: The landing intro said “Picks curated by Kobe on Discord.”
- After: It says “Eliminate confusion by combining Kobe’s curated picks in a centralized hub to help you bet with confidence.” A separate Discord icon links to the verified free server. Mobile text wraps naturally and the icon remains inline and keyboard accessible.
- Verification: Checked the replacement text, icon/link markup, and mobile wrapping rule in the local source.
- Unresolved limitations: No claim is made that any bet will win; “confidence” describes the intended experience.
- Release state: Local only; not published.

## Lineup label and simpler landing copy — October 10, 2026

- Requested change: Say “Browse the full lineup” without a period; replace “curated” and “centralized hub” with simpler, clearer language; remove the period before the Discord icon.
- Affected file: `index.html`.
- Before: “Browse lineup”; “Kobe’s curated picks in a centralized hub”; a period appeared before the icon.
- After: “Browse the full lineup →”; “Kobe’s carefully chosen picks” in “one connected community”; no period before the icon. The existing Discord link and icon remain.
- Verification: Checked that each intended phrase appears exactly once and the old text is absent in local markup.
- Unresolved limitations: None known for this copy change.
- Release state: Local only; not published.

## Intro link placement — October 10, 2026

- Requested change: Put the linked Discord icon immediately after “community,” and put “Browse the full lineup” immediately after “120+ expert sources.”
- Affected files: `index.html`, `landing-continuity.css`.
- Before: Discord icon followed the entire sentence; the lineup link was pushed to the far edge of the row.
- After: The Discord icon sits directly after “community” and remains linked to the verified free invite. The source count reads “120+ expert sources,” followed by “Browse the full lineup →” at the start of the same row; narrow screens may wrap the second phrase below the count rather than clipping it.
- Verification: Checked local markup and layout rules, including the separate anchors and mobile wrapping behavior.
- Unresolved limitations: None known.
- Release state: Local only; not published.

## Visible free Discord option in the expanded pick card — October 10, 2026

- Requested change: Show a compact “OR Join free” link with a small Discord logo in the expanded free-pick card.
- Affected files: `index.html`, `landing-continuity.css`.
- Before: The Discord option was inside the email form, so it disappeared when the form was unavailable.
- After: The option sits outside the form and remains visible whenever the free-pick card is expanded, including when the form reports a temporary failure. It links to the verified free Discord invite.
- Verification: Checked local markup, link destination, and responsive card styling.
- Unresolved limitations: Discord access and whether a free pick is posted there are controlled outside the site.
- Release state: Local preview; publication pending.

## Discord icon alignment — October 10, 2026

- Requested change: Center the small Discord mark inside its circular background.
- Affected file: `landing-continuity.css`.
- Before: A generic free-pick image margin pushed the icon below the circle.
- After: The icon resets that margin and its image dimensions within the circular link.
- Verification: Checked the local expanded mobile card after the CSS override.
- Unresolved limitations: None known.
- Release state: Local preview; publication pending.
