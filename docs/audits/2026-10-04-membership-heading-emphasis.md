# Featured membership headings — October 4, 2026

Request: give First Month and One Year more vertical presence and draw the eye to those plans.

Before: featured titles were 21px on mobile and 28px on desktop, with little vertical separation from the price/body.

After: featured titles use the same Arial family at weight 600, 28–34px on phones and 44px on desktop, with additional vertical title padding and spacing. At 390px their title area is approximately 53px tall. Card gutters, plan colors, prices, renewal terms and button styling are unchanged. Both `/join` and `/membership` load the updated versioned stylesheet.

Files: `membership-design.css`, `join.html`, `membership.html`.

Validation: browser checks at 320px, 390px and 1280px show no horizontal page overflow. The two titles remain inside their cards. The existing bento/public-build checks and whitespace check are run before release. No checkout was started during visual verification.

Publication: prepared for the authorized ongoing Cloudflare/GitHub site release; deployment receipt follows verification.
