# Featured membership headings — October 4, 2026

Request: give First Month and One Year more vertical presence and draw the eye to those plans.

Before: featured titles were 21px on mobile and 28px on desktop, with little vertical separation from the price/body.

After: featured titles use the same Arial family at weight 600, 28–34px on phones and 44px on desktop, with additional vertical title padding and spacing. At 390px their title area is approximately 53px tall. Card gutters, plan colors, prices, renewal terms and button styling are unchanged. Both `/join` and `/membership` load the updated versioned stylesheet.

Files: `membership-design.css`, `join.html`, `membership.html`.

Validation: browser checks at 320px, 390px and 1280px show no horizontal page overflow. The two titles remain inside their cards. The existing bento/public-build checks and whitespace check are run before release. No checkout was started during visual verification.

Publication: GitHub PR #130 merged; Cloudflare production version `fbf9e4fd-4854-4cfe-807e-656fa226f269`. Live `/join` verified at 390px: both featured titles render at 31.2px with approximately 53px title height and no horizontal overflow. All 10 bento/public-build checks and whitespace check passed. Private screenshot: `outputs/membership-headings-2026-10-04/live-mobile.png`.
