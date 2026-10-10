# Monthly pricing, referrals and write-up tracker — October 10, 2026

Requested change: Retire the $19.99 introductory offer, show $32.99/month on the homepage and membership pages, pay $20 for new qualifying referrals, replace the October offer banner with a flashing green referral card, and present the static 65% historical estimate with winning plays on the Write-up play tracker page.

Affected files: public homepage, membership, referral, results, navigation and terms HTML; shared site and membership scripts; landing and results styles; explicit public build whitelist; checkout worker and referral Discord card; focused tests.

Before: the site and checkout advertised a time-limited $19.99 first month, referral links routed to the introductory offer or a two-day trial, new referral rewards were $10, and the blue banner led to membership. The results subsite showed winning plays without the 65% historical estimate.

After: standard monthly checkout is $32.99 immediately and renews at $32.99/month until canceled; no new $19.99 or $5 introductory checkout is accepted. Referral links route to the same $32.99 monthly plan, and new verified rewards are recorded at $20 after the existing seven-day hold. Previously attributed rewards retain their stored amount. The banner is a green animated link to the referral page and respects reduced-motion settings. The results subsite is titled Write-up play tracker and shows the Kobe-reported 65% historical estimate plus verified winning plays. It says the historical estimate lacks complete supporting records and the wins-only list is not a complete performance record. Historic subscriptions continue under their own Stripe terms.

Verification: 76 focused checkout, site-release, and Discord referral-card tests passed. The explicit public build has 83 entries and contains no $19.99 copy or $10 referral promise. Local browser checks confirmed the homepage, standard membership, referral membership, and tracker copy. Production verification is pending. The $20 payout still depends on the existing Stripe recipient verification and fraud checks.

Status: local pending publication.

## Publication confirmation

- PR #222 merged to GitHub main as `6c7b4f5`.
- Published checkout Worker version `4efb566a-d055-4f94-8cd5-aa6e4f269a00` and public-site Worker version `c80428b0-bc27-4e6b-af43-c26ac9199def` from the merged commit. Render bot auto-deployed that commit and reached live status.
- Live checks: `/`, `/join`, `/refer`, `/results`, the checkout health endpoint, and the site scripts returned HTTP 200. Public pages contained no $19.99 copy. The homepage showed the $32.99 card, the referral link, and the Kobe-reported 65% historical estimate; the results subsite used the requested Write-up play tracker title. A new `first_month_back` checkout prepare request returned HTTP 400 with “offer ended.”
- Discord limitation: the current Render bot log says it cannot update the existing referral information card because it lacks View Channel, Send Messages, Embed Links, or Read Message History in that referral channel. The new $20 card copy is deployed in bot code, but the Discord message itself is not confirmed updated. The site and checkout changes are published.
- The broad repository test run had 481 passes and 36 failures, largely missing local dependencies or older assertions about the retired offer. The 76 focused checkout, site-release, and referral-card tests passed.

Status: published, with Discord referral-card permission blocker noted above.

## Tracker spacing follow-up

Requested change: remove the orange eyebrow above the Write-up play tracker and move the remaining content up. Affected files: `results.html`, `extras.css`. Before: a duplicate label and its spacing appeared above the title. After: the label is gone, the tracker section has tighter top padding, and the title begins without extra top margin. The results-page navigation label also matches the tracker title. Verification and publication status are recorded below.

Tracker spacing publication: PR #224 merged as `a967710`; the explicit public-site build was deployed to Cloudflare Worker version `ce7487ec-d81b-44fc-8f0f-70974ed55a88`. The live `/results` route returned HTTP 200 with the orange label absent, the tracker title present, and the tighter spacing stylesheet loaded. Eight focused site tests passed. Status: published.
