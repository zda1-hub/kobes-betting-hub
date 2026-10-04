# Mobile top-banner motion — October 4, 2026

Request: restore movement of the “Real breakdowns” banner on phones.

Before: the ticker has a mobile animation, but three reduced-motion rules explicitly disable it, including the shared stylesheet's universal `animation:none!important`. A phone requesting reduced motion therefore sees static text.

After: a narrowly scoped ticker animation overrides that rule for the explicitly requested banner. It uses the existing 16-second mobile loop, 20-second desktop loop, and a gentler 32-second loop under reduced motion. A compact pause/play button lets visitors stop the banner. Other reduced-motion behavior, banner height, header offset, gutters and Join button remain unchanged. Landing stylesheet/script versions are updated to invalidate cached assets.

Files: `index.html`, `home.css`, `mobile-polish.css`, `site.js`.

Validation: JavaScript syntax and whitespace checks pass. The relevant bento/public-build suite passes all 10 checks. Browser inspection at 390px confirms a running 16-second transform animation and no horizontal page overflow; clicking Pause changes its computed play state to paused. Reduced-motion override is established by the scoped CSS cascade; a physical iPhone was not available for testing.

An additional existing shared-header suite fails two unrelated expectations on the unchanged baseline (flush-top header rule and cache-busted home stylesheet on all public pages). This narrow patch does not revise subsite header positioning or add a site-wide asset rewrite to satisfy those pre-existing expectations.

Publication: pending verification and release. No payment, email, ad or results-processing behavior changes.
