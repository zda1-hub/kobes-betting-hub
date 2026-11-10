# Future Free Pick X CTA — November 9, 2026

Request: Kobe asked to replace the circled Free Pick X CTA with “join our free discord for multiple plays like this everyday.” Apply to future original Free Pick X posts only; preserve the Discord invite and age/responsibility line. Do not edit or repost an existing pick.

Claim check: the approved Free Pick pipeline has a daily cap and each pick still requires approval. The November 9 Reel-caption audit already records that this workflow does not guarantee a pick every day. The words “multiple plays like this everyday” therefore promise an unverified free-channel quantity and frequency, and are not used. The direct invite `https://discord.gg/sB9vzGz2xj` returned guild `1215407647155683358`, Kobe's Betting Hub, with no expiration from Discord's public invite API during this check.

Changed future CTA in `bot/lib/free-pick-x.js` to: `Join our free Discord for more approved plays like this: https://discord.gg/sB9vzGz2xj`. The next line remains `21+ where permitted. Bet responsibly.` The actual wager and complete supporting claims still lead the post. The builder now counts this URL as 23 X characters, following [X's `twitter-text` v3 configuration](https://github.com/twitter/twitter-text/blob/master/config/v3.json), and conservatively counts other non-ASCII characters; it drops complete optional evidence bullets when necessary and refuses a post if fixed terms exceed 280.

Verification: the focused X builder suite passed 10/10 and `node --check`/`git diff --check` passed. A representative whole post was 150 conservatively counted X characters, including the URL and legal line. No X post was created, edited, or queued by this change. Release and the next real publisher receipt still require separate verification.
