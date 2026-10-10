# Monthly pricing, referrals and write-up tracker — October 10, 2026

Requested change: Retire the $19.99 introductory offer, show $32.99/month on the homepage and membership pages, pay $20 for new qualifying referrals, replace the October offer banner with a flashing green referral card, and present the static 65% historical estimate with winning plays on the Write-up play tracker page.

Affected files: public homepage, membership, referral, results, navigation and terms HTML; shared site and membership scripts; landing and results styles; explicit public build whitelist; checkout worker and referral Discord card; focused tests.

Before: the site and checkout advertised a time-limited $19.99 first month, referral links routed to the introductory offer or a two-day trial, new referral rewards were $10, and the blue banner led to membership. The results subsite showed winning plays without the 65% historical estimate.

After: standard monthly checkout is $32.99 immediately and renews at $32.99/month until canceled; no new $19.99 or $5 introductory checkout is accepted. Referral links route to the same $32.99 monthly plan, and new verified rewards are recorded at $20 after the existing seven-day hold. Previously attributed rewards retain their stored amount. The banner is a green animated link to the referral page and respects reduced-motion settings. The results subsite is titled Write-up play tracker and shows the Kobe-reported 65% historical estimate plus verified winning plays. It says the historical estimate lacks complete supporting records and the wins-only list is not a complete performance record. Historic subscriptions continue under their own Stripe terms.

Verification: 76 focused checkout, site-release, and Discord referral-card tests passed. The explicit public build has 83 entries and contains no $19.99 copy or $10 referral promise. Local browser checks confirmed the homepage, standard membership, referral membership, and tracker copy. Production verification is pending. The $20 payout still depends on the existing Stripe recipient verification and fraud checks.

Status: local pending publication.
