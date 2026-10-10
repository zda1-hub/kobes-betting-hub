# Full-width sticky header — October 10, 2026 MST

Request: inspect supplied 4.38-second iPhone recording and fix header edge gaps/shadows during scroll.
Evidence: sampled entire recording at two frames per second. Content shadows visible beside inset/translucent sticky header.
Affected files: site.css and shared stylesheet cache-version references in public root HTML pages.
Before: header retained calc(100% - gutters) and page max-width, with translucent background despite later border/shadow removal.
After: header background spans viewport, opaque #f5f5f5, no backdrop blur or outer shadow; its two control rows retain prior page gutters and max-width. Button/social shadows and layout preserved.
Verification: six public contract/build checks pass; explicit public whitelist used. Live mobile scroll at 390×844: header left 0/right 390, opaque rgb(245,245,245), box-shadow none, sticky top 30, document width 390. Screenshot visually confirms edge coverage while scrolling. Temporary browser viewport reset.
Published: site Worker fcc96496-ab80-42e9-a2eb-1dc8115428f1. Checkout, publisher, referral integrations unchanged.
Screenshot: primary outputs/audit-2026-10-10/header-scroll-fixed.png.
Limitations: verified in mobile browser emulation; no physical iPhone replay after deployment.
