# Kobe's Betting Hub Discord Bot

This is an approval-first publisher. It publishes under the bot identity, never as
Kobe's personal Discord account. It does not read private Discord messages,
automate a user account, place bets, or create picks from unverified claims.

## What it does

- `/preview-pick` — sends the numbered complete post only to the publisher who runs it.
- `/publish-pick` — sends the same post to an approved channel.
- `/preview-recap` — sends the day’s verified recap only to the publisher who runs it.
- `/publish-recap` — publishes that recap to the configured or selected allowed recap channel.
- `/post-welcome-invite` — administrator-only; posts a button in the configured welcome channel. A member receives the welcome DM only after clicking it.
- `/hub-help` — shows the short publishing workflow.

The command requires Kobe's approval number, sport, pick headline, 4–8 evidence
points, confidence score, and an approved image/GIF (direct upload or URL). In the
Discord command, separate evidence points with semicolons. It rejects
guarantee-style language. All facts, odds, source rights, and approval still need
to be checked before publishing.

## Setup

1. In the [Discord Developer Portal](https://discord.com/developers/applications), create an application and add a bot.
2. Copy the bot token **once** into a local `.env` file. Do not send it in chat or commit it. Enable no privileged gateway intents; this bot only needs the standard `Guilds` intent.
3. Under **OAuth2 → URL Generator**, select scopes `bot` and `applications.commands`; grant the bot `View Channels`, `Send Messages`, and `Embed Links` in only the destination channels.
4. Enable Developer Mode in Discord, then copy the application, server, channel, and authorized publisher-role IDs.
5. Copy `../.env.example` to `../.env` and set the values. During setup set `DISCORD_GUILD_ID` so command updates are immediate. Add every production destination to `ALLOWED_CHANNEL_IDS`; map sport defaults with `SPORT_CHANNEL_MAP`, such as `baseball:123,basketball:456`. A publisher can select a different allowlisted channel at the final step.
6. From the project root, run `npm install` (or `pnpm install`), then `npm run register:commands`, then `npm run bot`.

## Welcome existing members

1. Create or confirm `#start-here`, then copy its channel ID into `WELCOME_CHANNEL_ID` in `.env`. Optionally set `WELCOME_ROLE_ID` to the role that should receive the one-time announcement, such as `@Active Member`.
2. Restart the bot and run `npm run register:commands` so Discord receives `/post-welcome-invite`.
3. In your own Hub server, an administrator runs `/post-welcome-invite`.
4. Existing members click **Send me the welcome**. The bot sends the welcome only to that member, once per running bot session. If their Discord privacy settings block DMs, the same welcome appears privately in the button response.

This is intentionally opt-in: it avoids unsolicited mass DMs, works without the privileged Server Members Intent, and handles users who have DMs disabled. Keep the button pinned in `#start-here` for future members instead of automatically DMing them.

## Keep the bot online 24/7 with Render

This project includes `../render.yaml` for a Render Background Worker. It keeps the Discord connection running without a Mac or Terminal window. The worker registers the slash commands automatically whenever it starts.

1. Push this project to a private GitHub repository. `.env` is excluded by `.gitignore`; never upload it or paste its token into GitHub.
2. Create a Render account and choose **New → Blueprint**. Connect the GitHub repository and select it.
3. Render detects `render.yaml` and creates the `kobes-betting-hub-bot` Background Worker.
4. In Render’s Environment page, enter the values marked as secrets: `DISCORD_TOKEN`, `DISCORD_APPLICATION_ID`, `DISCORD_GUILD_ID`, `WELCOME_CHANNEL_ID`, optionally `WELCOME_ROLE_ID`, plus the pick-publishing IDs you use.
5. Deploy. In the worker logs, look for `Registered guild commands on startup.` followed by `Logged in as ...`.
6. In your Hub server, run `/post-welcome-invite` once as an administrator and pin the resulting button in `#start-here`.

Do not use a free web service that sleeps when idle for this bot: it needs a continuously running worker to keep its Discord connection alive. Render Background Workers are designed for continuously running processes.

`PUBLISHER_ROLE_IDS` is required outside a private test server. Server
administrators are also allowed. Keep `ALLOWED_CHANNEL_IDS` nonempty in production
so the bot cannot be aimed at an unintended channel.

## Publishing workflow

1. Verify the numbered Kobe approval, event, exact line/odds, stat timeframes,
   source attribution, and image/GIF permission.
2. Run `/preview-pick` and review how it renders.
3. Have the designated approver confirm the exact text and media.
4. Run `/publish-pick` in the staff channel, choosing the sport and optionally an
   allowed destination. Record the resulting Discord message link in the pick log.
5. After all published events conclude, verify each exact published result, use
   `/preview-recap`, then `/publish-recap`. Cross-post to Instagram Story and X
   only after those official account connections are configured and the recap is reviewed.

The `source_url` is shown publicly, so use it only for a public source that is
appropriate for members to see. Keep internal approval notes in the project’s
intake tracker instead.
