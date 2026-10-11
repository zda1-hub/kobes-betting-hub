# Reviews, Recent Wins, and inline free-pick continuity — October 10, 2026

## Requested changes

Keep reviews separate from sportsbook tickets, use equal-height review cards with artwork-dependent widths, remove duplicate verified-pick presentation, name results “Recent Wins,” make the learning-hub action a matching button, and show the free pick immediately after email signup. Continue actual mobile and desktop verification.

## Before / after

- The gold “500 profit today” review was also in historical slips. It now appears only in Reviews. Decorated recap posters were removed from the slips rail; four original PrizePicks/FanDuel screenshots remain, each inside the same white rounded-card treatment as winning plays. Full-ticket viewing remains available.
- Reviews preserve all 15 unique source images. White frames share a height at each breakpoint (280px mobile, 320px desktop); their widths follow source aspect ratios. A browser check caught unequal fallback heights before lazy images loaded; responsive CSS now sets the height before image loading too.
- The duplicate verified-results feed on the proof page was removed. Its matching Recent Wins button opens the actual results page. Navigation, results headings, and public-page links now use “Recent Wins.”
- Approach’s learning-hub link is now a matching dark-blue button with a contained arrow.
- The free-pick email gate and successful pick occupy the same black card, with approved blue controls, shared page spacing, and matching corners. Text plays show numbered reasoning and omit repeated selection lines. Optional analytics failures cannot interrupt a successful reveal. Image plays also remain supported. Unsuccessful requests retain the form for retry; no-pick responses state that no current pick exists.
- The existing publisher already returns a pick after successful signup and queues its email separately. No backend, billing, access, referral, or attribution rules changed.

## Affected files

Shared navigation labels and stylesheet versions in public root HTML and guide HTML; `proof.html`, `approach.html`, `free-pick.html`, `index.html`, `results.html`; `home.js`, `free-pick.js`, `view-continuity.css`; two existing public contract tests and `scripts/free-pick-inline.test.mjs`.

`scripts/preview-site.py` gained an explicitly opted-in localhost-only unlock fixture on a separate test port. It reads the public approved pick, never forwards a POST, never sends email, and labels successful local reveals accordingly. The normal preview still refuses POST requests. This script is excluded from the public build.

## Actual verification

- In-app browser at 320×844, 390×844, and 1440×1000: populated Approach, Reviews/slips, Recent Wins, free-pick gate, and homepage → membership → homepage. Headers stayed at top 0; document width equalled viewport width; measured text/arrow bounds stayed within their controls.
- All review cards measured 280px on both mobile widths and 320px on desktop. All ticket cards measured 400px. Different review widths and horizontal browsing were preserved.
- Clicked gallery Next, opened an original sportsbook ticket, closed with Escape, and verified focus returned to the originating ticket.
- Clicked Explore the learning hub and verified navigation to the guides index.
- Submitted the safe local fixture and verified the actual current Utah -15.5 pick, event, six numbered reasons, and VIP action appeared inline. Checked unlocked states at all three widths. Local preview correctly states no email was sent.
- No browser error logs observed during the changed local paths.
- Automated public/worker suite: 305 tests, 294 pass, zero failures, 11 previously retired checks skipped. New client tests cover text/image reveal, optional analytics failure, no current pick, and retryable errors.
- Explicit public build: 88 public entries. Backend code and unrelated workspace files excluded.

## Evidence and limits

Screenshots and measurements: `/Users/z/Documents/ChatGPT/Kobe's Betting Hub/outputs/audit-2026-10-10/proof-free-pick-continuity/`.

This is browser viewport verification, not a physical iPhone hardware/frame-rate guarantee. Source review artwork is preserved; wide reviews are browsed horizontally. The email system deduplicates delivery by subscriber/day, so repeat signup by today's existing subscriber may not generate another email. Publication/live verification will be appended below.

## Published verification

- Deployed only the explicit public build. Cloudflare version: `e176fdf0-a0c4-4d09-8968-e4bd7af8bd87`. Checkout/publisher workers were not deployed.
- All five production smoke checks passed: checkout health, publisher health, approved free-pick API, public page, client asset.
- Submitted the live form with the user's previously authorized inbox and 21+/email consent. Utah -15.5 and all six numbered reasons appeared on the website, with the form replaced by the play and VIP action.
- Gmail search confirmed today's free-pick email is in the authorized inbox, timestamp 12:19:59 MST. This existed before the latest repeat signup; no new delivery is claimed. Publisher's per-email/day deduplication remains unchanged.
- The live in-app browser uses 75% zoom for this origin: a requested 390px override rendered a 520px CSS viewport. Live screenshot renamed accordingly. Exact 320/390/1440 CSS checks above were performed on localhost at 100%, with matching published assets; live flow additionally verified at its actual 520px width. No physical-device performance guarantee is claimed.
- Published galleries additionally verified at measured 320px, 391px, and 1440px CSS widths (viewport override adjusted for existing 75% origin zoom). Review/ticket heights and header/controls containment passed; manual Next worked; no browser error logs. The viewport tool accepts integer physical widths, so 390 CSS pixels rounds to 391 at that zoom. Browser viewport override restored afterward.
