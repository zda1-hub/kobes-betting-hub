# Restore header and revert homepage background

User requested complete removal of homepage slip background and clarified original header order: Join left, logo center, menu/Discord right. Restored homepage index from pre-background74fd491; removed background stylesheet from public build whitelist. Retained full ticket gallery fix, first20offer and shared Meta pixel.

Scoped mobile header grid in view-continuity.css places logo at exact viewport center, Join at left inset16px, menu/Discord on right. Public build versions shared stylesheet across marketing routes to avoid stale headers. Desktop unchanged. No backend changes.

Actual320/390/1440 renders: no horizontal overflow; no background slips. Logo centers160/195/720 respectively. Controls inside viewport with no overlaps. At320 Back action right132 vs logo left140 (8px gap); menu toggles expanded true. Screenshots saved in evidence/winning-slips-preview/restored-header-*.png. Full ticket fix retained.
