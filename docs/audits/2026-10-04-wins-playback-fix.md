# Wins slideshow playback fix — October 4, 2026

## Request
User reported that Play slideshow and automatic scrolling on homepage wins were not working. Preserve the existing rule that touch, drag, wheel, keyboard and manual arrows take control until Play is selected.

## Findings and changes
- The prior animation reset its fractional position to the browser-reported scrollLeft every frame, including through its scroll listener. A browser rounding tiny increments to whole pixels can erase all progress at high refresh rates. Preserve the fractional accumulator during automatic motion and normalize user scrolling only while paused.
- The prior Play click returned immediately when reduced motion was enabled. Reduced motion still prevents initial autoplay; an explicit Play now starts motion, and preference changes pause it again.
- Resume synchronizes the accumulator with the current manually browsed position and resets frame timing. Existing visibility/hover pauses, manual browsing overrides, unique card cycle, layout, and actual verified-win data stay intact.
- Homepage script cache version updated to load the fix.

## Files
home-results.js; index.html; scripts/bento-release.test.mjs; this audit.

## Verification
12 public build/release tests passed. Added regression coverage simulating 125Hz frames with integer-rounded scrollLeft, reduced-motion default pause and explicit Play, wheel/touch override, and resume after wheel. This fails with the former implementation.
Browser preview at 390px: clicked Pause then Play; rail progressed from 3823.5 to 4278.5, Next moved to 4503 and changed control to Play slideshow. Prior live desktop session could move, so the issue was conditional rather than a universal loading failure. No browser errors observed in initial live inspection.

## Status and limits
Prepared on codex/fix-wins-playback from current GitHub main bb92f8e. Production publication is authorized in this session. Cloudflare receipt and live checks follow. Tests simulate high-refresh rounding; no physical phone is connected for reproduction. No record counts, billing, email or backend services changed.
