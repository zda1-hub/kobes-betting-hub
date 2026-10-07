# October 6, 2026 — arbitrage guide search improvement

## Requested

Improve the sports betting arbitrage guide's search visibility while preserving the existing website layout, font, text styling, colors, spacing, and shared navigation.

## Before and after

- Before: the guide already had a descriptive title, meta description, canonical URL, and links from the homepage and learning hub. Its $1,000 stake example used amounts that did not produce the stated equal return.
- After: corrected the example to $493.98 and $506.02 in cent-rounded stakes, with an approximately $1,037.35 unrounded equal payout and $37.35 theoretical profit. The page now explains how to convert positive and negative American odds and shows how a line change can remove the calculated edge. The visible update date and sitemap lastmod now reflect October 6.
- Affected files: `guides/sports-betting-arbitrage-explained.html`, `sitemap.xml`. No CSS, scripts, header, card, button, or other public page changed.

## Verification

- Recomputed the example independently: implied-probability sum 0.9639953542, unrounded stakes $493.9759 and $506.0241, payout $1,037.3494 on either side. At cent-rounded stakes, payouts are $1,037.358 and $1,037.341.
- Parsed the edited HTML and sitemap XML; checked the updated content and `git diff --check`.
- Public build and live checks are recorded below after release.

## Limitations and release

- Search Console previously showed this guide receiving impressions without clicks. These edits improve accuracy and query relevance, but search rank and clicks depend on Google's indexing, competition, and external signals. A #1 position cannot be guaranteed.
- Status: local pending release.
