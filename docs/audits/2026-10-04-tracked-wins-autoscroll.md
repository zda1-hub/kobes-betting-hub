# Homepage tracked-wins autoscroll — October 4, 2026

Request: add autoscroll to Tracked wins using the same rules as the other homepage rail.

Before: Recent wins moved automatically; Tracked wins required manual browsing.
After: both homepage win rails use the same continuous scrolling controller, independently scoped controls, and previous/pause/play/next buttons. Every available unique card is traversed before looping. Touch, drag, wheel, keyboard and focus pause motion; manual browsing stays paused until Play is selected. Hover pauses temporarily; reduced-motion preferences disable autoplay. Motion runs only when the rail is visible. Full-record links and truthful totals remain intact.

Files: home-results.js, index.html and mobile-polish.css. New tracked controls have 44px minimum touch targets. The public proof rail retains its existing manual interaction; no backend, pick verification or membership integration changed.

Verification: existing public release checks passed, including wins-only filtering, overall count and tracking date. Browser inspection confirmed 16 unique cards with before/after loop copies, independent tracked controls, advancing scroll position after Play, and keyboard/arrow browsing switching back to Play slideshow. Mobile layout checked before release. Full production build and release receipt recorded below.

Release: published through GitHub PR #137 and Cloudflare static version dc82ee94-2526-4f8c-b216-f001ec887933. Live JS/CSS match prepared files. Live mobile browser confirmed 16 unique cards, independent Play/Pause controls, wheel input pausing motion, and 44px minimum control dimensions. Screenshot saved in outputs/tracked-wins-autoscroll-2026-10-04/live-mobile.png in the main workspace. All 11 public build/release checks passed. Receipt retained on the feature branch to avoid a documentation-only backend redeploy.
