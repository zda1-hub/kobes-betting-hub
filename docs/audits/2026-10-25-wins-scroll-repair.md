# Wins carousel repair — October 25, 2026

User reported broken scrolling after the writeup-record release and requested an audit, working automatic movement, and confirmation of the arrows' history.

## Findings

- Git history shows homepage previous/next arrows before the writeup-rate change, including the October 4 and October 10 releases. They were not introduced by PR #331.
- The live arrow and keyboard controls moved cards during reproduction, and PageDown still moved the document. The problem was not a general document overflow lock in that state.
- The old carousel treated any focused descendant of its section as a reason to renew its pause indefinitely. Pointer-clicking an arrow leaves it focused, preventing the advertised automatic resume. Keyboard focus should retain the pause; pointer focus should not.
- Mouseenter paused regardless of device hover capability, allowing a synthetic touch hover to hold the pause.
- The wheel handler prevented native horizontal scrolling and assigned scrollLeft per delta while CSS mandatory snapping remained active. Small trackpad deltas could snap back instead of accumulating as a native gesture.
- Previous release validation checked rates, layout and unit tests but did not prove real manual-input-to-automatic-resume behavior. This follow-up adds that verification.

## Changes

`home-results.js`: use native passive wheel scrolling, distinguish keyboard-visible focus from pointer focus, and honor hover only for fine hover-capable pointers. Keep the existing arrows, carousel layout, six-second reading interval, four-second manual idle, keyboard navigation, wins-only data and reduced-motion support.

`index.html`: update the carousel script cache version so returning visitors receive the repaired behavior. No other public design or pricing content changes.

`scripts/bento-release.test.mjs`: exercise both hover-capable and coarse-pointer conditions, both reduced-motion states, pointer-focus automatic resume, keyboard-focus pause and native wheel handling. Hover assertions now observe one step interval rather than a full wrap that could hide unwanted motion.

Status: local until deployment receipts and live checks are appended. This release does not change the real writeup rate or backend grading.

## Browser findings and final local verification

A real-browser reverse-arrow test exposed a further defect: offsets were calculated from the first card, losing the track's 12px inset. At a native snap position, Previous selected the same card's unpadded offset and snapped back. The repair measures targets relative to the track and includes the inset in initial positioning. The regression fixture now models that native snap inset and explicitly checks Next then Previous.

Local real-feed browser checks: Next/Previous changed visible selections in the expected directions (Caleb Wilson to Donovan Mitchell on reverse); a pointer drag moved scrollLeft 250px; a native horizontal wheel gesture moved it 250px; vertical wheel over the carousel moved the document from 1384 to 1595 without capture. After pointer-focused arrow use, automatic movement resumed while focus-visible was false. Checked 320px/390px containment with no horizontal page overflow and header top 0; no layout or control additions. Coarse-pointer hover and reduced-motion behavior are exercised in deterministic tests, not claimed as a physical-phone test.

Skills applied: interface-fit-review and web-verify. Existing rates, checkout, referral and result-grading data are unchanged.
