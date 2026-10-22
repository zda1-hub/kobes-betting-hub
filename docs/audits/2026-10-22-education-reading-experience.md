# Education reading experience — October 22, 2026 MST

Request: implement the reviewed education popup exemption and clearer statistics guide discovery; deploy if quality passes; research subsequent improvements separately. User expressly authorized this release.

Base: latest origin/main ca9076c. Active release worktree education-navigation; unrelated dirty audits, measurement files and local fixtures preserved.

Affected files: site.js, guides/index.html, education/mean-versus-median.html, education/per-game-versus-per-minute.html, scripts/education-exit-dialog.test.mjs. The two article HTML changes only version their existing shared script reference so readers load the new behavior.

Before: both education routes inherited the promotional exit dialog; learning hub used two links without distinct explanatory summaries. After: an education-path guard at the dialog boundary blocks both desktop exit and mobile reverse-scroll triggers before recording any session suppression. Ordinary banners, membership entry, checkout/session/utility guards and mandatory interfaces are unchanged. The existing cream statistics card now gives descriptive links and a short summary for each guide. Approved layout and artwork remain intact. No additional category page.

Verification: 7 behavioral tests exercise actual initializer/event handlers using a no-network DOM harness across extensionless, .html and trailing-slash education routes, desktop and mobile triggers, session behavior and existing suppressions. Four public build tests passed. Real browser fixture exercised actual education documents with desktop exit and mobile reverse-scroll events (coarse-pointer media emulation) and homepage desktop positive control: all passed. Initial browser runs loaded stale HTML/script; versioned script references and fresh HTML requests verified the new code. This was corrected before release.

Rendered hub checks at320px/390px/1440px: no document horizontal overflow, shared header top0, populated statistics links and summaries fit; both links navigate to the expected articles. No browser console errors in the checked navigation. Mobile gesture verification uses a scripted real-DOM event/media fixture, not a physical touch-device run. Local test fixtures are excluded by the explicit public whitelist. No paid scans or messages.

Release: pending publication and live verification. New research proposal remains unpublished public-site work. No ranking increase or index status claimed.
