# NBA writeup approval routing — October 20, 2026

## Requested change

Kobe asked for NBA writeups to use the private pick approval flow and, after his approval, post to the basketball writeups channel (`1562152923725701141`).

## Before

The source collector already sent normal NBA writeup candidates to `PICK_APPROVAL_CHANNEL_ID`, subject to the existing completeness and odds checks. `SPORT_CHANNEL_MAP` in the local configuration contained football and baseball only, so basketball approval cards did not have a configured paid destination. The bot's manual sport default had the same gap.

Discord's bot API listed the basketball channel but returned `403 Missing Access` when reading it. Its channel and parent grant View Channel and Read Message History to the VIP role but not the Kobe Bot role. The bot cannot add its own channel permission.

## After

`BASKETBALL_WRITEUPS_CHANNEL_ID` is the explicit paid destination for basketball writeups. The collector's approval button and the bot's final publish route use this same ID; the bot allowlist and manual basketball default include it. Other sport routes and the stricter-than-`-200` approval gate remain as before. `render.yaml` declares the non-secret channel ID and `.env.example` documents the key.

## Verification and release state

Focused routing and collector tests passed locally. Production still requires the Render setting/deploy and a Discord permission grant for the Kobe Bot role on the basketball channel. A successful deploy alone does not prove that an NBA post can publish; bot access and a real approved NBA card must be checked before claiming end-to-end delivery.

### Release follow-up — October 20

PR #260 was merged as `03839f9`. Render deployment `dep-dbbq7342ggas73fnn7e0` reached **live**, and the new process logged in as Kobe Bot. The production Render service received `BASKETBALL_WRITEUPS_CHANNEL_ID=1562152923725701141` without replacing other variables. Kobe granted the bot access to the basketball category and channel; subsequent bot API reads of the channel and message history both succeeded. The channel grants View and Send to the bot, while the bot role supplies Embed Links. This verifies configuration and access, but no real NBA writeup was approved or published merely for this test.
