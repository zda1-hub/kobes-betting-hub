# Legacy public-site test repair

Requested: fix the two outstanding legacy tests while keeping the SEO pages stable.

Both failures were stale test assumptions, not a product defect found during this repair:
- Review test expected the superseded 14 quote-card figures. The October 13 approved release imported 17 original review screenshots and retained five older originals as accessible image-viewer buttons. The repaired assertions require all 22 stable source IDs, unique paths and unique file hashes, matching thumbnail/viewer images, accessible labels and button semantics.
- Carousel fixture lacked performance.now(), so setup failed inside the caught fetch callback before animation initialization. It also expected continuous movement within 800ms, while the current carousel advances one card every six seconds. The fixture now provides a deterministic browser clock and cancelable timers, and verifies the six-second reading interval, four-second manual pause, subsequent wrap/resume, focus/hover pauses, reduced motion, vertical page scrolling and manual next control.

Affected file: scripts/bento-release.test.mjs. No production HTML, CSS, JavaScript, SEO content or billing changes.

Validation: all 43 checks in the combined public-site test run pass (bento release, billing disclosures, public build, SEO guard, education exit behavior). Three temporary negative variants were run separately: ignoring the reduced-motion preference, removing the four-second idle interval and mismatching the review viewer image each caused assertion failures. No tests were deleted or skipped to obtain the green result.

The test repair is repository-only; no Cloudflare asset deployment is required. Existing SEO pages remain stable pending fresh Google crawl/performance evidence. This verification does not establish ranking gains or universally best SEO.
