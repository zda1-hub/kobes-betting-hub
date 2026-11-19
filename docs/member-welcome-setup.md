# Free-member welcome setup

The new flow is disabled until the reviewed live setup is approved. The welcome
copy is in `data/member-welcome.json` under `WELCOME_MESSAGE`.

1. Resolve every channel reference in the message. Both `#free-picks`
   references map to the existing `🆓・free-picks`; `#general` maps to
   `💬・community-chat`. Do not create a results channel.
2. The owner confirmed `26-17 since sep 22` from a separate box-score-graded
   ledger on November 18. Recheck the current two-day trial offer before posting.
3. Run `npm run welcome:dry-run` with the bot's existing Discord credentials.
   Review the role, channel, permissions, pin action, and member counts.
4. After explicit owner approval, run `WELCOME_SETUP_APPROVED=true node
   bot/member-welcome-setup.js --apply`. The script creates or reuses `Free` and
   `#start-here`, updates the pin, and backfills only members without VIP.
5. Set `WELCOME_FLOW_ENABLED=true` on the Render bot after setup, then verify
   a free account can see the channel, a VIP account cannot, and `/welcome-refresh`
   edits the same pin. Keep the flag false until these steps are authorized.

The November 18 refreshed read-only live dry run found 1,322 non-bot members: 1,294 would
receive `Free`; 0 VIPs had `Free` to remove. Neither `Free` nor `#start-here`
existed. The bot had Administrator, Manage Roles, Manage Channels, and Manage
Messages. These counts may change before the approved apply.

The full suite's eight failures were reproduced on untouched `origin/main` at
`418ccf7`: one ESPN evidence test, one archived-writeup recovery test, one group
recovery test, one expired introductory-offer test, and four learning-guide UI
tests. All six new welcome-flow tests passed.
