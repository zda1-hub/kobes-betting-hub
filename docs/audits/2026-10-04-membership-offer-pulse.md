# Membership offer attention — October 4, 2026

Request: enlarge “Best value · Yearly Access” and flash “Best” and the introductory $19.99 price.

Changes: the annual subtitle grows from 9px to 14px on mobile and to 20px on desktop. Only “Best” and the primary First Month $19.99 amount receive a gentle 2.8-second opacity/glow pulse. Text stays visible throughout (minimum opacity 0.72); no position, scale or box size is animated. The pulse respects reduced-motion preferences. Existing featured headings, gutters, colors, buttons, prices and renewal disclosure remain intact. Both membership routes load the updated versioned stylesheet.

Files: `membership-design.css`, `join.html`, `membership.html`.

Browser validation at 320px, 390px and 1280px shows no horizontal overflow; the annual subtitle wraps inside its card on the narrowest phone. At 390px both attention spans have a running 2.8-second animation and the subtitle renders at 14px; desktop subtitle renders at 20px. Checkout was not started.

Publication: GitHub PR #131 merged; Cloudflare production version `e72c2b1e-06ee-4bee-bffc-68c874b9e46b`. Live `/join` at 390px confirms the 14px annual subtitle, two running attention animations and no page overflow. Ten existing bento/public-build checks and whitespace checks passed. Private screenshot: `outputs/membership-pulse-2026-10-04/live-mobile.png`. This change does not alter billing, ads, emails or results.
