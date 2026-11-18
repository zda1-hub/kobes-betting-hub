# Free-member welcome setup

The new flow is disabled until the reviewed live setup is approved. The welcome
copy is in `data/member-welcome.json` under `WELCOME_MESSAGE`.

1. Resolve every channel reference in the message. `#free-picks` maps to the
   existing `🆓・free-picks`; `#general` maps to `💬・community-chat`. There is no
   `#results` channel in the November 18 guild snapshot, so setup is blocked.
   Do not create a results channel merely to make the message pass.
2. Verify the `26-17 since sep 22` record and the current two-day trial offer
   before posting this public message. The repository's tracked pick log does
   not contain rows that establish the record.
3. Run `npm run welcome:dry-run` with the bot's existing Discord credentials.
   Review the role, channel, permissions, pin action, and member counts.
4. After explicit owner approval, run `WELCOME_SETUP_APPROVED=true node
   bot/member-welcome-setup.js --apply`. The script creates or reuses `Free` and
   `#start-here`, updates the pin, and backfills only members without VIP.
5. Set `WELCOME_FLOW_ENABLED=true` on the Render bot after setup, then verify
   a free account can see the channel, a VIP account cannot, and `/welcome-refresh`
   edits the same pin. Keep the flag false until these steps are authorized.

The November 18 read-only live dry run found 1,323 non-bot members: 1,295 would
receive `Free`; 0 VIPs had `Free` to remove. Neither `Free` nor `#start-here`
existed. The bot had Administrator, Manage Roles, Manage Channels, and Manage
Messages. These counts may change before the approved apply.
