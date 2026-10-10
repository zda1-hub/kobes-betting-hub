# Free-pick email formatting — October 10, 2026 MST

Requested: selection once, sport - matchup, numbered explanation points; retain existing footer information.
Affected files: cloudflare/bettinghub-publisher.js and its test file.
Before: duplicate selection line and rationale joined with bullet separators in a paragraph.
After: selection line includes market once; sport and event separated by a dash; each approved bullet/newline point numbered separately. Odds, units, optional approved card link, VIP join URL, responsible wagering notice and unsubscribe retained. No pick claims rewritten or independently fact checked.
Verification: 20 publisher tests passed, including delivery/unlock/consent coverage and formatting regression for duplicate line, numbering, existing numbered input and footer preservation.
Base: GitHub main 38d48ac2cc4a607445cb49fa88ace88cc9c0f3d3, fetched and matched before edit. Only publisher Worker deployed; public site, checkout and referral workers untouched.
Published: bettinghub-publisher version 1f989632-a403-42c1-8f8e-94d3f77cafae. Existing D1/KV and five-minute schedule retained.
Limitations: already delivered emails cannot change. No full-list resend initiated. Fresh inbox receipt of new format not yet verified; applies to subsequent delivered free-pick emails. Formatting retains approved source statistics rather than inventing new analysis.
