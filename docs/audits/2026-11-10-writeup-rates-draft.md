# Historical writeup rates — November 10, 2026

## Request and scope

The owner supplied NBA 68%, NFL 66%, and MLB 60% for the homepage writeup record. Kobe confirmed these historical rates dating back to 2024. New picks should remain visible and continue updating. No underlying per-sport wins, losses, or date ranges were supplied in this chat.

## Change

- `index.html`: replace the homepage's single tracked-rate headline with the three historical sport figures. Label them historical and link to the separate verified tracked record.
- `writeup-record.css`: fit the three rates inside the existing gray card without changing its palette, header, artwork, controls, or Recent Wins rail.
- `writeup-record.js`, the publisher feed, and `results.html`/`recaps.html` are unchanged. New verified picks continue to populate the Recent Wins rail and the tracked record. The historical figures are not represented as derived from the 72–76 tracked sample shown in the owner's screenshot.

## Customer-facing review

1. Historical-rate heading: show NBA/NFL/MLB beside each supplied percentage so a qualified buyer can read the scope; evidence is the owner's Kobe-confirmed figures.
2. Historical-rate note: identify the period as dating back to 2024 and link the separate tracked record so a skeptic does not mistake these for the later 72–76 sample; underlying sport counts were not supplied.
3. Writeup example: show the original image and link the November 4 Discord post so the wording is attributable to Kobe rather than an invented website summary; evidence is the original #free-picks post.
4. Result footer: use the NBA-confirmed 7 rebounds and 112–106 score, since the owner's proposed 9-rebound blowout sentence conflicts with the box score; evidence is the NBA game record.
5. Next-step and design continuity: retain the Recent Wins, membership and referral actions in their approved positions and keep the writeup's full-size action within the white card; evidence is populated 320px, 390px and desktop rendering plus an opened image link.

## November 10 follow-up: writeup example

The owner supplied the Jaylen Brown screenshot for the homepage example and asked for a closing “this play cashed” line without the phrase “If possible.” Discord's #free-picks post from Kobe Bot is dated November 4, 2026 at 9:52 AM MST and matches the supplied image. The [NBA box score](https://www.nba.com/game/0022600173/box-score) records 7 rebounds in Philadelphia's 112–106 win over Detroit. The suggested “9 total boards in a blowout” wording was not used because it conflicts with that record. The first-half rebound count was not independently checked and is omitted.

- `home-writeup-proof.js`: replace the Jalen Smith text example with the owner's original screenshot, Discord source, verified result, and full-size image action.
- `home-writeup-proof.css`: fit the image and result within the existing white card at mobile and desktop widths. Preserve the membership artwork, shared header, and surrounding composition.
- `assets/social/jaylen-brown-writeup-example-20261110.jpg`: owner-supplied screenshot.
- `index.html`: refresh the example CSS and JS URLs for cache invalidation.

The screenshot contains Kobe's original pregame reasoning, which this change presents as the original post rather than independently verified game statistics. The card identifies it as a free pick, not a VIP #writeups pick.

## Verification and status

- `npm run build:site`: passed after the example follow-up; 117 public entries prepared.
- `node --test scripts/prepare-public-site.test.mjs scripts/writeup-record.test.mjs`: 6 passed after the example follow-up.
- Local preview at `127.0.0.1:4175`: inspected populated 320px, 390px, and 1440px views. No document-level horizontal overflow. At 320px, the date label initially exceeded the card; the scoped font fix brought card `scrollWidth` to `clientWidth` (270px). The historical rate grid stayed within its container at all three widths. The full-size image link opened the local JPEG in a new tab.
- Local only. No GitHub publication or Cloudflare site release yet.
