# Writeup rate snapshot and example — November 10, 2026

**Request:** Kobe asked for static historical writeup rates of NBA 68%, NFL 66% and MLB 60%, while the site's tracked wins and losses keep updating. He supplied a Jaylen Brown writeup example and asked for a closing result line.

## Changes

- `writeup-record.js` and `writeup-record.css`: Add a clearly labeled Kobe-reported historical sport-rate snapshot on the homepage, Recent Wins and recaps. It is dated November 10, 2026, described as covering plays since the 2024 NBA season, and says the underlying win/loss counts have not been supplied or independently audited. The existing live tracked writeup rate and verified W/L/push/void/pending counts continue to load from the results API and are explicitly identified as a separate data set beginning September 7, 2026.
- `home-writeup-proof.js` and `home-writeup-proof.css`: Change the homepage example to Jaylen Brown over 5.5 rebounds (-150), using the supplied writeup's bullet-led format. The specific chance-rate statistics in the supplied image were omitted because they were not independently verified. The KBH results API lists the November 4 pick as a win; the [official NBA final box](https://statsdmz.nba.com/pdfs/20261104/20261104_PHIDET.pdf) shows 7 rebounds against Detroit. The requested phrase “This play cashed” is used with that corrected total. Kobe's suggested 9-board result was not used because it conflicts with this verified pick result.
- `index.html`, `results.html`, and `recaps.html`: Advance the affected script/style version strings so live browsers load the new presentation. No membership, checkout, bot, email or approval logic was changed.

## Verification

- `npm run build:site` prepared 117 public entries; `node --test scripts/writeup-record.test.mjs scripts/prepare-public-site.test.mjs scripts/search-indexing.test.mjs` passed 8/8; `git diff --check` passed.
- Local preview at 320px, 390px and 1440px had no horizontal document overflow. The homepage writeup card fit at both mobile widths and was inspected populated on desktop. Its expansion control revealed the remaining bullets and source note. The rate card was inspected on the homepage and the Recent Wins page at 320px. The shared header remained topmost.

## Limits and status

- The historical 68/66/60 figures are owner-provided, **not an audited record**. No sport-by-sport wins/losses or exact cutoff were supplied; do not present them in an OpenAI business profile or Business Agent as independently verified. The live tracked record is a distinct cohort and may show a different percentage.
- The supplied screenshot was used as a format reference. Its detailed chance-rate claims and 9-rebound closing line are not published. Past results do not guarantee future outcomes.
- This audit initially describes local changes. Append the release commit, production version and live verification below after publication.
