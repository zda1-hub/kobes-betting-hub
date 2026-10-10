# Referral emphasis and uniform insets — October 10, 2026 MST

Requested: bill fills content width excluding outer gutters; prominent referral reward; exact matching blue/black card padding.
Files: site.css and shared stylesheet-version references.
Before: bill capped320px and homepage could subtract gutters twice; black card had both outer card and summary padding after global typography rules.
After: homepage bill width100% of already-guttered main; other pages use same outer gutters/max-width. Referral caption24px semibold. Blue card padding and black summary padding share16px mobile/24px desktop; black outer wrapper has zero padding to avoid duplication; both start at top with8px text gaps.
Verification: local390px rendered text insets match17px including1px border, all four declared padding sides16px, zero horizontal overflow. Final live reload shows bill width equals main width385.33px at current browser dimensions. Screenshot primary outputs/audit-2026-10-10/referral-uniform-live.png; viewport reset. Initial live navigation retained old cached HTML; reload verified current asset version.
Published whitelist site Worker:8ee05540-f683-4880-ba20-c0a3cee4fdc7. No price/backend changes.
