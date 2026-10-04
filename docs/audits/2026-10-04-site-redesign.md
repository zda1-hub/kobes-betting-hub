# Website redesign audit — October 4, 2026

Status: local implementation complete for the current functional changes; final visual matching and desktop review remain open. No public deployment has been performed.

## Scope and sources

The current request authorizes a local, unified bento redesign of the landing page and subsites. The supplied `deliverables/full-chat-transcript-through-2026-10-04.md`, particularly entries 724–765, was reviewed as historical context, not fresh authorization. The open Figma design guides the visual work. Current public publisher responses provide the free pick and verified results. All business, billing, referral and entitlement rules remain unchanged.

The latest user steering confirms the Figma landing page as the reference and asks to preserve the brother’s UI, including button geometry and placement. The follow-up implementation now uses that reference instead of the invented large hero. Geometry checks are recorded below; final design approval has not been given.

## Requirement map

| Requirement | Before | Current local implementation and evidence |
| --- | --- | --- |
| Unified bento layout; shorter landing | Long sections and inconsistent page treatment | 22 public HTML routes share `site.css` and `site.js`; landing uses compact tiles and links to detailed subsites |
| Entry offer only on landing | Annual offer could compete with the main entry action | Landing shows $19.99 first full month, then $32.99/month until canceled; no annual card |
| Clear membership hierarchy | Benefits and choices could obscure pricing | Monthly and $194.99 annual offers are primary; $10 seven-day and $134.99 six-month choices sit in an expandable secondary section |
| Accurate billing copy | `$19.99/month` alone suggests permanent promotional pricing | First month $19.99, then $32.99/month; no free trial; claim by October 22, 2026 MST. Annual renews at $194.99/year, six-month at $134.99 every six months; seven-day starter becomes $32.99/month |
| MST labels; remove arbitrage | Arizona-time and arbitrage copy | Public website uses MST and removes the arbitrage offering; internal business rules are unchanged |
| Async images and full-image fit | Cropping could hide review text | Image decoding is async; offscreen images lazy-load; computed review `object-fit` is `contain` |
| Complete sequence before repetition | Short repeat cycles and duplicated sections | 15 reviews: seven from the current live collection plus eight older images. All 15 are unique by byte hash and form a complete sequence repeated in three sets |
| Nonclickable, readable reviews | Review images opened a viewer | Review cards are inline figures and do not open a dialog; readability can be assessed directly in the rail |
| Manual control overrides motion | Automatic motion could compete with browsing | Drag, touch, wheel and keyboard switch to manual mode; motion resumes only through the control. Browser ArrowRight check changed the control to “Play slideshow” |
| Verified results only | Historical screenshots were mixed with proof | Proof displays 16 recent settled picks from the public verified ledger, including losses. Recaps uses that same source. Seven historical slips are explicitly a separate archive and are not the verified record |
| Floating header; recognizable social logos | Labels and inconsistent header treatment | Shared floating header uses Instagram, X and Discord SVG logos and consistent navigation across routes |
| Expandable free pick | Full breakdown used landing space | Arrow disclosure reveals the breakdown alongside the email tile. Current response is October 3 and is visibly labeled LATEST, not represented as today’s fresh pick |
| Shared gutters and clickable buttons | Uneven padding and button appearance | Shared layout establishes consistent gutters and raised button treatment. Exact brother-reference matching and desktop visual review remain pending |
| Local actions only | Review could accidentally enter a production flow | Membership and email actions give preview messages; no submission POST is made. Local server rejects POST |

## Dated change batches

### October 4 — layout and navigation

Replaced the long landing-page structure with compact bento tiles and moved detail into linked subsites. Standardized 22 public HTML routes using shared styling, header, footer and navigation. Source: current request and Figma reference. The mobile route sweep found no horizontal page overflow; desktop review remains pending.

### October 4 — pricing and disclosure

Replaced the annual placeholder and ambiguous monthly label with the specified prices and renewal terms. Monthly and annual now lead the membership page; the seven-day and six-month options remain available through disclosure. Source: current membership design and historical transcript pricing context. Both membership URLs use the revised design. Payment configuration was not changed or exercised.

### October 4 — reviews and scrolling

Combined seven live review images with eight older originals. Byte-hash checks found no duplicate files among the 15 originals. Changed review buttons into nonclickable figures, used contain fitting and a full-sequence loop, and gave user input control over automatic motion. Source: current request plus transcript requirement that reviews be readable without clicking. Keyboard/manual-mode behavior was checked in the browser; physical-device touch testing has not been recorded.

### October 4 — public data and proof

Removed static recap imagery from the verified results presentation. The proof and recaps pages now read the same public verified ledger and include losses; the latest proof response rendered 16 settled picks. Kept seven historical slips in a labeled archive separate from that record. Added a local read-only feed proxy in `scripts/preview-site.py` so the preview can load public data without browser CORS failures. The October 3 free-pick response is labeled LATEST. Source: public publisher responses and transcript requirement to exclude unverified outcomes.

### October 4 — validation and audit refresh

Static scans covered 22 routes: no missing local href/src targets, duplicate IDs or missing async image decoding were reported. Eight JavaScript syntax checks passed. Browser snapshots at 390 px covered all 22 routes without horizontal overflow; the final landing snapshot includes loaded data. This audit replaces earlier findings about missing styles, annual placeholders and clickable reviews, which are now resolved.

### October 4 — Figma alignment follow-up

Requested change: preserve the brother’s Figma UI rather than invent a different hero. Affected website surfaces: shared `site.css`, landing `index.html`, and shared navigation across public HTML pages. The large headline hero was replaced by compact source-count and one-VIP-membership copy with a Discord icon. The directory contains 120 actual sources; the draft’s 157 placeholder is not represented as an actual count.

The header now centers a 275 × 100 logo with caption, places the blue Join button below the logo on the left, puts the menu control in the center, and keeps social icons at the right in 24 px circles. The Join button uses `#3ca1fa`, 85 × 24 geometry and a 12 px radius. Mobile header and main content align to the same 24 px left gutter.

The landing uses compact blue and black tiles side by side, an outlined email card with an 18 px radius and black pill Send button, and orange approach and gray review tiles in the lower bento row with a .62fr/1.38fr split. Navigation was reordered according to the latest request: Share the Hub is third, FAQ and Support are last, and the dropdown is centered.

Browser geometry reported by the implementation owner confirms the Join button at 85 × 24, radius 12 and RGB(60, 161, 250); the logo at 275 × 100; and both header and main at a 24 px left gutter without horizontal overflow in the inspected view. This verifies those measurements, not final visual acceptance of every route. The wider desktop route sweep and remaining visual review are in progress.

### October 4 — continuing audit requirement

The explicit current request to audit every website change is now recorded in root `AGENTS.md`. It requires an audit under `docs/audits/` covering the requested change, affected files, before/after behavior, verification, unresolved limitations and local/published status. Follow-up changes must be appended so the change history remains visible. The same instructions preserve the Figma reference, consistent shared UI, inline review readability, manual scrolling control, MST labels and current offer hierarchy. This audit follow-up records that requirement; it does not create a separate publication or billing authorization.

## Verification evidence

Completed evidence reported by the implementation owner:

- Eight JavaScript syntax checks passed.
- Static link, asset, ID and image-decoding scan passed for 22 public routes.
- Fifteen review originals have distinct byte hashes; the rail repeats complete 15-image sets three times.
- Browser inspection confirmed contain fitting and nonclickable review figures.
- ArrowRight interaction put the review rail into manual mode and showed “Play slideshow.”
- Public proof data loaded 16 recent verified settled picks, including losses; recaps reads the same ledger source.
- Mobile browser sweep at 390 px found no horizontal overflow on all 22 routes.
- Local membership and email actions do not make POST submissions.

Saved membership mobile screenshot: [membership-mobile.jpg](../../outputs/site-redesign-2026-10-04/membership-mobile.jpg).

Pending evidence:

- Final desktop visual review and screenshot evidence.
- Final visual comparison with the confirmed Figma reference after the latest alignment changes.
- Physical-device touch behavior; further interaction checks should be recorded when performed rather than inferred from source code.
- Final visual acceptance after any additional styling changes.

## Business baseline and measurement

The reported baseline is approximately 400 website views and 9 memberships. The period, attribution and denominator have not been independently verified. Views may not be unique visitors, and those memberships may not all come from the reported views. Although 9 divided by 400 is 2.25%, that arithmetic is not an established site conversion rate without matched data.

The transcript also records an earlier snapshot of 390 visitors, 90 join-page views and 8 offer selections. Offer selections are not confirmed paid memberships, and those historical figures should not be substituted into the current baseline. Assess the redesign using matching-period landing visitors, membership-page visits, offer selections, checkout starts and confirmed payments. The changes aim to improve clarity and reduce friction; recovered clicks, memberships and revenue are not guaranteed.

## Current limitations

This is a local preview. Membership controls do not open checkout or create charges, and email controls do not create subscribers or send messages. The local server proxies only the public free-pick and results reads and rejects POST. Loaded data verifies display only; it does not validate payment access or Discord entitlement.

The current free pick is October 3, so the preview labels it LATEST. This audit does not establish when the next pick will be published. Historical slips remain an archive and do not establish verified outcomes. No outcome grade, payment product, billing rule, referral policy or Discord entitlement behavior was changed.

Historical documentation states that membership access requires successful payment and connecting the correct Discord account; email verification alone does not grant paid access. The transcript reports a newer referral release than the older local checkout worker, so that stale worker is not evidence of current live referral behavior. No transaction or referral payout was tested during this local redesign.

Review result: functional local redesign and the recorded Figma geometry checks pass as described above. Final desktop route verification, full visual comparison and user design acceptance remain pending; this audit does not claim final design approval.

## Final local verification — October 4, 2026

The final pass checked all 22 public routes at 390×844 and 1440×1000. No route overflowed its page horizontally. One older guide initially had a narrower outer container on desktop; it was corrected and rechecked at 140 px for both its main container and header. Phone header and main gutters are 24 px; desktop uses a centered 1160 px container.

The current Join control is measured at 85×24 px, with a 12 px radius and background RGB(60,161,250), matching the Figma button dimensions and color. Its placement is left beneath the centered 275×100 px logo. The user explicitly requested the dropdown in the middle: both its control and its open menu are centered at x=195 on the 390 px phone viewport. Share the Hub is third; FAQ and Support are the final two entries. The compact mobile landing page now follows the mockup’s sequence of source information, side-by-side blue membership and black pick cards, outlined email card with black pill Send button, and orange/gray lower bento boxes. The source count uses the actual 120-entry directory rather than the mockup’s placeholder 157 figure.

The expanded free-pick card uses the full available width. Browser checks found a 16 px gap above the email card and no page overflow. Local email submission was exercised with a dummy address and produced the explicit preview-only message; no subscriber was created. The local plan-selection control likewise produced its preview message without opening a checkout. The public feed currently returns an October 3 pick; the UI labels it LATEST and states today’s pick has not been posted, rather than presenting an older pick as today’s release.

A final static check covered 22 pages: zero missing local href/src targets, duplicate IDs, missing asynchronous image decode attributes, or remaining arbitrage/Arizona-time copy. Eight changed/public JavaScript files passed syntax checks. The review sequence contains 15 distinct files, with no identical file hashes, and repeats the full sequence. Keyboard browsing was exercised; the UI switched to explicit Play slideshow mode, and computed image fit was `contain`. Native touch and mouse-drag paths are implemented but have not been exercised on a physical phone in this audit.

Evidence is saved under `outputs/site-redesign-2026-10-04/`: `route-checks.json`, `static-checks.json`, `landing-mobile.jpg`, `membership-mobile.jpg`, and `membership-desktop.jpg`. Screenshots supersede earlier draft screenshots. Public data reads use the read-only local preview proxy to avoid localhost CORS errors. No deployment, payment, referral rule, Discord entitlement, email delivery, or production analytics change was made.

Local preview status: implemented and verified within the scope above; the user’s visual acceptance remains separate. This is not evidence of improved paid conversion. Before a production release, connect the preserved live offer/referral/email flows, verify checkout and attribution against the current deployed backend, and measure a matched-period visitor-to-paid-membership funnel.


### October 4 — full-image gallery fit, faster motion and arrows

Requested change: make every review/slip image fully visible without unnecessary inner padding, increase automatic gallery speed and add arrows. Affected files: `home.js`, new `gallery.css`, and stylesheet links in `index.html` and `proof.html`. Membership markup and shared `site.css` were not changed in this batch.

Previously each screenshot sat in a uniformly padded fixed-size card, leaving unused space for differently shaped source images. Cards now use each loaded image’s natural width/height ratio, zero inner padding and exact matching dimensions. Width is capped to the available rail width; responsive height caps keep tall slips bounded without cropping. Images retain contain fitting. The gallery recalculates dimensions when images load or the rail resizes.

Automatic movement increased from 22 to 65 pixels per second. Previous/next image buttons browse consecutive image offsets and enter manual mode. Swipe, drag, wheel and keyboard continue to override automatic movement; explicit Play is required to resume. Review figures remain nonclickable, complete unique-image sets still repeat, and reduced-motion preferences remain respected.

Verification: the bundled Node runtime passed `--check home.js`. A source-dimension calculation used all 22 review/slip files at 390 px and 1440 px viewport scenarios, for compact and full-width rails; every computed card stayed within the available width and height cap and exactly preserved its source ratio. This is numeric geometry verification, not browser screenshot evidence. Browser checks of the new arrows, final responsive image sizing and faster animation remain pending the implementation owner’s reload and review.

## Membership mockup and menu centering follow-up — October 4, 2026

Request: show every membership option in the user's Membership Page arrangement, add VIP access, Share the Hub and visible membership management, and center the hamburger strokes. The Figma connector reached its Starter-plan tool limit, so the actual Membership Page was inspected directly in the user's open Arc window. This showed blue first-month / black seven-day cards above orange six-month / larger annual cards, compact orange VIP information, and a navy referral panel.

Changed `join.html` and `membership.html` to the same asymmetric four-card arrangement via `membership-design.css`. All four current promotional options are visible without opening a disclosure. Displayed prices and renewal terms remain $19.99 first month then $32.99/month, $10 first seven days then $32.99/month, $134.99 every six months and $194.99 yearly. The legacy two-day trial is not an active option during the first-month promotion and is not added as a competing offer. The seven-day “Trial Run” button is explicitly labelled a paid starter with no free trial. The first-month expiry remains October 22, 2026 MST. VIP information is adapted from the saved live page with six compact benefits and Discord connection instructions; arbitrage is omitted. Share the Hub uses the reference's navy panel and links to the existing local referral page. A full visible Manage Membership card links to the existing account management page.

All shared public menu buttons now use a geometric SVG with strokes centered around the icon midpoint rather than a font glyph. Header dimensions, centered dropdown, Join pill, gutters and social logos are preserved. The pick arrow transition is shortened to 120 ms. No payment, access, referral payout or email implementation was changed; plan selection remains explicitly preview-only.

Mobile browser verification at 390 px found no page or card overflow, and the menu SVG center matched its circle center with zero horizontal/vertical offset. Annual selection produced the preview-only status. Gallery Next image changed the control to Play slideshow, confirming user control overrides autoplay. Inspected images retained `contain`, zero card padding and their natural aspect ratio within pixel rounding. Screenshot evidence and additional responsive checks are saved with this batch. This remains local and unpublished.

Responsive browser checks for this follow-up passed on join, membership and proof at 360, 390 and 1440 px (nine route/width combinations): no horizontal page overflow or overflowing plan cards. Both membership routes exposed all four offers and the visible management feature. Evidence: `membership-revision-checks.json`, `membership-revision-mobile.jpg`, and `membership-revision-desktop.jpg` under `outputs/site-redesign-2026-10-04/`. Temporary viewport overrides were reset; the membership preview is left open for review.

## Mobile typography, landing record and restored alerts — October 4, 2026

Latest request: larger mobile-first text while preserving card quality and padding; tracked record on the landing page; matching blue/orange/black bento on appropriate subsites; restore the existing moving top text and compact arbitrage/Discord card above the offer row. This explicit request supersedes the earlier arbitrage removal instruction; `AGENTS.md` now records the revised scope.

Changes: `index.html` gains the live site's ticker wording, a compact arbitrage-alert card linking to the existing Discord destination, and a tracked-record bento reading the public ledger via `home-results.js`. The summary presents wins, losses, pushes and voids; recent settled cards include losses, with a link to the complete ledger and a coverage note. No synthetic record or profit claim is introduced. `mobile-polish.css` enlarges landing and membership reading text within preserved outer gutters, header Join geometry and menu alignment. The ticker is restored consistently across the 22 shared-header public pages; its animation respects reduced-motion settings. Colored informational subsites are recorded in the separate subsite batch below.

Local preview only. The user requested to see this version before saying it can be pushed to Cloudflare; no production deployment or billing/access changes are authorized or performed in this batch. Verification and screenshot evidence follow.


## Informational subsite color and reading-size follow-up — October 4, 2026

The user authorized colored bento cards across subsites, specifically blue/orange/black for the approach page, with larger phone-readable text. Added scoped `subsite-bento.css` to approach, support, FAQ and the learning hub. The approach preserves its four process/disciplined betting explanations in blue, orange, black and cream cards. Support now separates account management, Discord support and urgent help, retaining its official-channel security notice as a black card. FAQ groups the existing questions into colored membership, releases/results and risk/access disclosures. The learning hub uses full-card links with blue/orange/black/cream tiles and retains its educational caveats. Links were added only to relevant free-pick, learning, membership and support destinations. Shared header, footer, gutters, button dimensions, payment behavior and account flows were not edited in this batch.

Responsive browser checks covered all four pages at 360, 390, 768 and 1440 px (16 combinations). No page overflowed horizontally. Main and header outer edges matched in every combination: 24 px on phone, 28 px at 768, and 140 px on a 1440 px desktop. Card reading copy measures 16 px on phone and 16–17 px on desktop. The new approach mobile screenshot was inspected: headings fit inside their cards, all four colors render, and body text remains legible within the shared gutters. The desktop grid uses two columns for process/learning/support and three FAQ groups; phone layouts stack with 16 px gaps. Existing FAQ answers remain collapsed initially.

Evidence: `outputs/site-redesign-2026-10-04/subsite-bento-checks.json`, `approach-bento-mobile.png`, `support-bento-mobile.png`, `faq-bento-mobile.png` and `guides-index-bento-mobile.png`. This evidence predates the root agent’s subsequent shared ticker and typography pass and does not claim verification of that later pass. All work remains local and unpublished.

Verification for this batch: all 22 public routes were checked at 390 and 1440 px after shared ticker/typography integration (44 combinations). No page horizontal overflow, plan-card overflow or header/main gutter mismatch was reported; all routes contained the ticker. The Join pill remains 85×24. The landing ledger loaded 75 wins, 64 losses, four pushes and zero voids in this snapshot, plus 16 settled cards including eight losses. These figures are feed data at verification time, not fixed promotional claims. Saved evidence: `final-polish-checks.json`, `landing-final-mobile.jpg`, `landing-final-desktop.jpg`, and `approach-final-mobile.jpg` in `outputs/site-redesign-2026-10-04/`. The landing preview is left open with temporary viewport overrides reset. Billing and email remain preview-only; nothing has been published.

## Lineup, referral alignment and banner refinement — October 4, 2026

Request: center Share the Hub within its membership panel; match Expert Lineup typography and bento treatment to the user's mockup, with introductory box left and source directory right even on mobile; attach the landing arrow to “Browse the full lineup”; try arbitrage as a little banner, with Discord/free-join destination considered. Changes: `mobile-polish.css` centers the referral CTA with auto margins, keeps the source-link arrow inline with its browse text, and reduces arbitrage to a 52 px banner. `index.html` now labels the banner action VIP access and points to membership. The previously used Discord URL is a server channel destination, not a joining invite; no verified free Discord invite was found in the public local site files. No invite is invented. A clearly labelled free-community entry can be added when a valid invite and intended free area are provided; VIP alerts must not be presented as free access.

`exclusives.html` and new `lineup-bento.css` use the mockup's plain Arial sans-serif styling, an orange introduction left, gray searchable source box right, and black lower membership box. All 120 original source names and rates remain intact. Source rows become compact readable cards, two columns inside the directory on desktop and one on mobile, with bounded vertical browsing and no sideways table scroll. Expanded rate context stays available under an inline disclosure. The introductory Join pill uses the reference's blue 85×24 px treatment. Existing shared header, side gutters, ticker and menu order are preserved. Local changes only; Cloudflare deployment explicitly awaits user approval.

Verification: landing, lineup and both membership routes passed 360, 390 and 1440 px checks (12 combinations) with no horizontal overflow and zero header/main gutter difference. Membership Share the Hub button center offset was exactly zero at all three widths. Lineup introduction and directory remained side by side; headings computed Arial sans-serif and all 120 source rows remained. Searching “AlgoPicks” returned exactly one source with its preserved $99/week reference rate. Banner measured 52 px high at each width. Evidence saved as `lineup-refinement-checks.json`, `lineup-refinement-mobile.jpg` and `banner-refinement-mobile.jpg` under `outputs/site-redesign-2026-10-04/`. Preview is left on the landing page; no deployment occurred.

## Landing reviews replaced by wins — October 4, 2026

Request: show wins instead of reviews on the main page. `index.html` now replaces the gray review tile with Recent wins from the verified ledger. `home-results.js` renders the eight recent verified winning picks available in the current 16-pick feed snapshot, without inventing image outcomes or claims. The full tracked record below still includes losses, pushes and voids. Reviews remain on the proof page. `mobile-polish.css` preserves the existing adjacent orange approach/gray proof bento and outer gutters, with fitted text cards in the gray tile. The new wins rail repeats the complete unique sequence, offers previous/next controls, and pauses autoplay on touch, drag, wheel, keyboard or arrow input. Reduced-motion preferences suppress autoplay.

Verification: JavaScript syntax passed; browser confirmed eight original winning cards, only Win badges, zero review cards on landing, and no horizontal overflow at390 and1440px. Next win changed the motion control to Play slideshow. Wins cards are constrained to available rail width. Snapshot evidence: `outputs/site-redesign-2026-10-04/landing-wins-mobile.jpg`. Local only; no Cloudflare publication or billing change.

## Free Discord joining links — October 4, 2026

Request: clicking the Discord icon must let visitors join the free Discord. The historical transcript contained permanent invite `https://discord.gg/sB9vzGz2xj`. A fresh read of Discord's public invite API verified that this code belongs to Betting Hub, guild1215407647155683358, targets `#start-here`, and has no expiration. This resolves the earlier missing-invite limitation; the transcript was treated as a candidate source, not fresh action authorization.

All22 shared-header public routes now use the verified invitation instead of the member-only server-channel address. Discord icons are labelled Join the free Discord for accessibility. The landing inline Discord logo and slim banner also use the verified invite; the banner action now says Join free, while VIP membership buttons retain the membership destination. No server roles, permissions, billing or VIP entitlement changed. Invite links offer free server entry, not paid access. No account was joined or invite accepted during verification. This remains local pending user approval to deploy.

Browser verification confirmed all three landing Discord entry points resolve to the verified invite, the wins section loaded, Next win paused automatic motion, and the phone page had no horizontal overflow. Combined screenshot evidence: `outputs/site-redesign-2026-10-04/landing-wins-free-discord-mobile.jpg`. Shared header link replacement was applied to all22 public routes. No invite was accepted during this work.

## Arbitrage explanation and Discord icon affordance — October 4, 2026

Request: remove Join free from the arbitrage banner, use Learn more leading to the arbitrage explanation, and keep free Discord joining on the clickable icon with the same clean button shadow. `index.html` now links the slim banner to `guides/sports-betting-arbitrage-explained.html` and shows Learn more with its arrow, without an extra Discord icon in the banner. The header and inline Discord icons still use the verified free-server invite; `mobile-polish.css` gives them the same -2px/3px/6px reference shadow and hover/pressed feedback while keeping header icon size unchanged.

The existing published arbitrage article was fetched from the live site's guide and restored locally within the shared shell. Its explanation, calculation example, execution risks, checklist and member-alert description are retained in matching expandable bento cards styled by `arbitrage-guide.css`. Existing article content is source material, not new operational authorization. No transaction, server access change or deployment performed. This supersedes the prior banner free-join destination only; standalone Discord invite icons continue to join the free server.

Verification: clicking the landing Learn more banner opened the correct local arbitrage guide. Six expandable guide sections rendered; the calculation example expanded successfully. Phone390px and desktop1440px guide checks found no horizontal overflow. The standalone inline Discord icon still resolves to the verified free invite and its measured shadow is -2px3px6px rgba(0,0,0,0.25). Updated screenshot: `outputs/site-redesign-2026-10-04/arbitrage-learn-more-mobile.jpg`. Preview left on landing; nothing published.


## Referral production wiring restoration — October 4, 2026

Deployment preparation restored the currently deployed referral onboarding into the redesigned `refer.html`. Added the existing hidden referral dashboard with its personal-link, copy and Stripe payout DOM hooks. New `referral-production.js` retains the live public callback flow: validated `KBH-` referral code, hash authentication token, official checkout-worker Discord login/onboarding endpoints, canonical `join.html?ref=` share link, complete/refresh setup messaging, copy control and removal of callback credentials from browser history. Shared menu/year handling stays with site.js rather than duplicating the live script’s old header behavior. The existing promotion copy and October 22 MST expiry remain in referral-preview.js. No backend, reward calculation or eligibility rules were changed.

The account-connect link is inert in initial HTML and activated only outside localhost, loopback or file preview. The local guard returns before processing callback data or exposing payout links. Production opens the same existing Discord and Stripe flows used by the live site. Source syntax checks passed for both scripts. Isolated execution checks verified localhost disabling, a valid production callback/link, expired payout-link messaging/login fallback and invalid-code rejection. These checks used mock browser objects and dummy callback values; no account connection, network request, payout or transaction was made. The implementation requires deployment of `refer.html`, `referral-preview.js` and new `referral-production.js` alongside the existing shared CSS/JS.

## Approved Cloudflare and GitHub release — October 4, 2026

The user explicitly requested Cloudflare deployment, then GitHub publication. Release source is prepared in the managed `approved-site-release` worktree from current `origin/main` (a0f494c), because the original workspace was388commits behind and contains unrelated uncommitted work. Only the approved public design, its new assets, preview tooling and audit are copied; current backend workers, databases, operational files and private deliverables are not altered or included in the public artifact.

Production restoration uses fresh deployed checkout, membership portal and referral scripts/contracts, with secure Discord OAuth/Stripe flows, existing first-party attribution, existing Meta tracking and email signup fields/consent. Localhost and file previews continue to block payment/account/email writes. Both membership routes expose the four current promotional offers and retain post-payment connection and referral handling. The current deployed legal content is preserved in the new shell; public legal noindex directives inherited from the old draft were removed. Current cancellation timing and mandatory refund exceptions remain in the membership/help copy. Build preparation's explicit whitelist now contains the23designed routes and their styles/scripts, preserves existing ancillary account/admin routes, and supplies one production configuration block per secure page plus existing alias redirects.

Preflight: production build passed; every local href/src target in the public artifact resolved; Cloudflare dry-run accepted the asset bundle. Focused checkout, secure onboarding, portal, attribution, legal and release checks are run without live transactions. No plan price, renewal rule, eligibility, payment-worker code, Discord permission or email backend was changed. Publication results and post-release verification will be appended below.

### October 4 — authorized production release preparation

The user subsequently authorized Cloudflare deployment and GitHub publication. Production preparation uses the latest origin/main release worktree, rather than replacing newer billing and membership systems with the older local workspace. The user also explicitly restored arbitrage in later steering; the arbitrage guide and landing link are therefore retained. These later instructions supersede earlier local-only and remove-arbitrage requirements for the release.

The production build now includes shared styling/scripts and the new routes. Root preserved current legal/operator content, membership environment configuration, the secure checkout preparation path, post-payment Discord handoff, billing portal, referral behavior and analytics. Production email forms supply email, legal age, consent and honeypot fields to the existing handler. Local preview guards remain limited to local hosts; public membership choices use live checkout keys. No backend worker or business billing rule was changed by this audit work.

Added `scripts/bento-release.test.mjs` to build and inspect production artifacts in an isolated temporary directory. It verifies navigation/shared assets and local targets; all four checkout keys and post-payment hooks; email form/backend fields; the public Discord invite target; complete-record links and 15 unique inline review images; mocked result rendering that includes wins/losses/pushes/voids but excludes pending outcomes; and current legal/operator plus management alias contracts. The result test uses an in-memory response, with no external request or transaction.

Updated only the first offer test in `scripts/billing-disclosure.test.mjs` to reflect four visible current offers and a hidden referral choice on both membership routes. Checks preserve clear per-card payment and renewal prices, the October 22 deadline, absence of an advertised two-day trial during the current offer, regular-monthly savings, and the separate cancellation/refund disclosure. Existing security/legal tests were not weakened.

Verification: 52 focused tests passed, zero failed, across preparation, checkout handoff/idempotency/environment isolation, onboarding, billing portal, attribution, billing disclosures and the new production artifact suite. Preparation reported 81 public entries. The command used the bundled Node runtime with these seven files: `scripts/bento-release.test.mjs`, `scripts/billing-disclosure.test.mjs`, `scripts/prepare-public-site.test.mjs`, `scripts/membership-checkout.test.mjs`, `scripts/secure-onboarding.test.mjs`, `scripts/membership-portal.test.mjs`, and `scripts/attribution.test.mjs`.

Initial checks exposed an invalid-environment error message that incorrectly said local preview and a missing management canonical; root restored meaningful error wording and the canonical before the successful run. Root also restored policy indexability and help-page cancellation/refund disclosures. Production deployment and live smoke evidence are to be appended by root when completed; these passing checks do not themselves prove a live release or final visual approval.

Cloudflare publication succeeded for the existing `kobes-betting-hub` site Worker in the current site account. The first deployment version was eba96822-ce8b-446d-8335-cc709d20d7cb. The live smoke check then exposed an overly assembled free-pick endpoint string: requests used the correct endpoint, but the existing health checker could not verify it. The client was simplified to explicit production and localhost endpoint URLs and redeployed. Final live version:65ca0abf-1bcd-406a-b6e1-d93af04687ea. Previous production version8db1fc90-e4fb-4053-b9d1-9c803be73010 remains available for rollback.

Final focused tests:56passed,0failed. All21public JavaScript assets passed syntax checks. All24shared-shell route targets, including the management alias and new arbitrage guide, returned the new design from the custom domain via redirected HTTP reads. An initial automated Python HTTP scan was denied by the edge; matching curl and browser reads succeeded, so that attempt is not recorded as a site outage. Browser checked the live mobile homepage: no horizontal overflow, eight verified wins and full record loaded, free Discord links and arbitrage explanation present. Live membership displays all four current offers with production config injected; no purchase or subscriber submission was performed. Screenshot evidence: `live-home-mobile.jpg` and `live-membership-mobile.jpg`. Post-deployment checkout/publisher/free-pick health checks passed after the endpoint simplification. GitHub publication details follow.

GitHub release source was published as commit03af0ea on `codex/approved-bento-site`, based on current main, with PR [#127](https://github.com/zda1-hub/kobes-betting-hub/pull/127). The PR includes the approved website sources, release integration checks, public build whitelist, full change audit and screenshot evidence. Unrelated files from the original workspace were not committed. Cloudflare live release and GitHub review refer to the same built public source; merge status is recorded by the PR.
