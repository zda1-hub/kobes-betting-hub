# Kobe message and original Discord reviews — October 13, 2026

Requested: retain approved public design, add Kobe’s message at the bottom of the landing page, show original Discord review images, repair tracking and simplify expert records. User selected a matching card with a short intro and expandable full message, and requested both traffic and winning-play tracking restoration.

## Content and implementation

- Added isolated `kobe-message.css`/`.js` component and homepage card below existing content. Existing artwork, header, membership scene, pricing, navigation and surfaces retained. Message uses Kobe’s supplied voice/content with grammar tightened, historical rates explicitly attributed to Kobe, and arbitrage terms corrected to account for execution/settlement risks. The 1,300-member statement and sport rates are owner-supplied, not independently audited.
- Imported all 17 PNG attachments from Kobe Irwin’s October 13 1:35 PM MST Gmail “Review pictures” message; converted to WebP without rewriting the review text. Retained five distinct earlier Discord screenshots. Replaced quote renderings in the existing proof-page rail with 22 original screenshots, preserving rail layout, arrows, manual browsing, reduced motion and full-size viewer. Each unique image occurs once before intentional rail clones. New assets live under `assets/slideshows/reviews/kobe-20261013/`; original mail/download URLs stay in local excluded outputs.
- Gallery buttons support native Enter/Space opening and drag gestures; original text remains inside the image, with accessible labels and image-viewer captions.
- New component files added to the existing explicit public build whitelist. Changed assets cache-busted together.

## Verification

Local preview at 127.0.0.1:4188. Checked populated message at 320, 390 and 1280px; header top=0, document width equals viewport, both message buttons contained, 16 verified win cards loaded. Message opens/closes and preserves existing membership route. Original gallery inspected at 320/390/1280px; all 22 originals load and image viewer opens by click and keyboard, Escape/close restores focus. Directory search matches BankrollBill and no-match state hides the rail. Scoped existing contract tests pass; build whitelist succeeds. Tracking/expert backend tests and details are recorded separately.

Evidence: `evidence/2026-10-13-kobe-updates/`. Full-page screenshot capture can place sticky surfaces at the current scroll position; viewport screenshots and DOM top measurements are used for header verification.

## Release status

Local implementation and verification. Publication receipts and live checks to be appended after rollout.
