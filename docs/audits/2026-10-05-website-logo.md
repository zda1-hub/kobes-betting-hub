# New shared website logo — October 5, 2026

## Request
Use the user-supplied Kobe’s Betting Hub circular logo across the website, centered correctly and in the same vertical position.

## Before / after and files
- Replaced the old hub-logo-figma.png references in all 23 public page headers with assets/kobes-betting-hub-logo-20261005.png; accessible image name now Kobe’s Betting Hub.
- New asset is a byte-for-byte copy of /Users/z/Downloads/3617F608-DF94-4D08-93C2-37EFF872FC47.PNG (1254×1254). No artwork or pixels were regenerated.
- mobile-polish.css fits the square artwork within the existing 275×100px header image slot using contain, centered placement, internal padding and a circular CSS clip to hide the square exterior. The complete colored rim and artwork remain visible.
- Existing header layout, Curated by Kobe text, control positions, page gutters and downstream content positions are retained. Shared stylesheet cache version changes to 20261005-logo.

## Verification
- 12 public build/release tests passed; public links/assets, production membership configuration, email and results contracts all passed.
- Browser checked Home, Membership, Proof, and Learning Hub at 320/390/1280px. Logo centers exactly at 160/195/640px, equal to half the viewport; source image loaded at its original 1254px width. No horizontal page overflow.
- Before/after at 390px: image slot y35, tagline y116, button row y148.59375 unchanged. At 1280px: image slot y42, tagline y122, button row y155 unchanged.
- Visually inspected the mobile homepage: full circular badge, clean edge, centered above the tagline; controls retain their existing arrangement.

## Release status and limitations
Prepared on codex/new-website-logo from latest origin/main bed6a02. Cloudflare/GitHub publication is authorized by the current session. Public build whitelist only; no checkout, email, attribution or backend deployment. Physical phone testing not performed; browser viewport checks cover mobile widths. Publication and live receipt will be appended.
