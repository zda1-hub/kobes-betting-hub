# Header-first audit — October 10, 2026

Requested: no content above header on referral or any website page; import supplied KBH card into Figma.

Cause: site.js inserted the referral banner after the ticker, which precedes the header on non-homepage pages. Static ticker placement also violated the newly explicit header-first rule.

Changed: all 27 HTML files containing shared headers place header as the first body element. site.js inserts non-homepage referral promotions inside main. Homepage card/bill remain after intro. Root script cache versions refreshed. No backend or access changes.

Verification: whitelist build succeeded; parser checked every public built HTML with a header and confirmed header is first body element. Live referral-page screenshot saved in primary outputs/audit-2026-10-10/header-first-referral-live.png. Deployment published.

Figma: exact supplied /Users/z/Downloads/kbh card.png successfully imported into https://www.figma.com/design/zLXgddkjvj38VlgQiajJsK?node-id=2-2. PNG is an image layer, not editable individual lettering; prior separate editable layers remain in the file.
