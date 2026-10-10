# Header controls, lineup and supplied card — October 10, 2026

Requested: identical header-circle shadows, centered icons, replace homepage card with supplied Figma export, repair exclusive-lineup CTA/layout, and create a reusable UI-design skill.

Cause: lineup CTA had fixed 85×24 geometry for 10px text after global typography became 16px. Shared icon circles had unequal shadows and 20px SVGs within a padded box too small for them. Referral insertion lacked a grid-column span, displacing intro and directory into mismatched rows.

Changes: site.css provides common centered zero-padding icon circles with equal shadows, intrinsic text-button defaults and full-column referral rows. Interior promotions use compact image/text rows. lineup-bento.css removes obsolete fixed CTA sizing, restores desktop intro/directory columns and mobile stacked cards, consistent gaps and padding. Desktop row cards stretch equally. site.js uses assets/membership/kbh-vip-user-master.png copied unchanged from the supplied 4200×2448 PNG. Root and guide HTML cache references refreshed. AGENTS.md requires interface-fit-review for future visual changes.

Verification: whitelist build succeeded. Rendered desktop (1280), 320 and 390: no document horizontal overflow; CTA 152.95×40 with 120.95×24 content, giving 16px horizontal/8px vertical padding. All four circles 32×32 with identical rgba(0,0,0,.19) 0 4px 8px shadow and zero SVG center deviation, on the same row. AlgoPicks search shows one source; CTA navigates to /join. Final production screenshots saved in primary outputs/audit-2026-10-10/controls-lineup-live.png and updated-card-live.png.

Skill: /Users/z/.codex/skills/interface-fit-review/SKILL.md, validated with bundled quick_validate.py using a temporary Python environment with PyYAML. It requires checking rendered text ranges, controls, grid placement, header position and interactions at 320/390/desktop before publication. No website/billing authority added by skill. No backend or membership terms changed.

Status: published website changes. Card is the user-supplied raster export; Figma layered master is unchanged.

Production follow-up: Cloudflare version 347667fb-2591-4eb4-ad18-051c991be4cf. Live desktop row cards both 741.18px high; CTA remains 152.96×40 with 120.96×24 content. New homepage card is loaded from the new asset with natural size 4200×2448, and byte hash matches supplied export. Current homepage viewport had zero document overflow.

Live CTA check: click opened https://kobesbettinghub.com/join with the membership pricing page and Choose your VIP membership heading. The temporary static localhost server lacked extensionless routing; production routing was verified directly.
