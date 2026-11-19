# Truck photo credit follow-up — 2026-11-18

Requested: reconcile the Cybertruck photo against the supplied Wikimedia Commons metadata and show `photo: Mr.choppers / CC BY-SA 3.0` on each rendered card.

The existing `assets/road_to_truck/cybertruck.jpg` is the 1280 × 759 reduced-resolution Commons image. The original is 4967 × 2946. The user-provided `/workspace/kbh/drafts/road_to_truck/assets/cybertruck.jpg` path is not mounted in this workspace, so the existing matching repo asset was retained. The public `/truck` page already links the author, source, license, and crop notice.

Changed: `pipeline/road-to-truck-card.js` now puts the short credit below the legal footer when the photo is present. Its production-timeline line now says `elon says` in keeping with the approved attribution wording. `assets/road_to_truck/PHOTO_SOURCE.md` records the original file, author page, date, resolution, direct URL, license, and modifications.

Verified: rendered the 1080 × 1350 Day 1 card with the actual photo and inspected the PNG. Credit and footer fit, remain readable, and do not overlap. `node --test pipeline/road-to-truck.test.js`: 8 passed. This change is local and unpublished until merged and deployed; the road-to-truck posting switch remains off.
