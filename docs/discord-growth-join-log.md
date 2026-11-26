# Discord daily join log (proposal; not deployed)

The Render `bot/index.js` process already has a Discord gateway connection with
`GuildMembers` intent in code. A new in-process minute tick takes one snapshot
at 11:55 PM `America/Phoenix`. It makes exactly two Discord REST reads on a
normal day: `GET /guilds/{id}?with_counts=true` and `GET /guilds/{id}/invites`.
It then writes through the existing bearer-protected publisher Worker into D1.
The Worker does not start a second gateway or a new cron trigger. On 429 the
daily run stops and logs the retry delay; it does not retry in a loop.

The migration adds only `discord_member_snapshots`, `discord_invite_snapshots`,
and `discord_joins`. All dates in the daily report are Phoenix dates. A first
snapshot is a **baseline**, so its invite use totals are not counted as new
joins. A new invite's first observed uses are also a baseline for that code;
a deleted invite never produces a negative join count. Invite use deltas can
miss expired/deleted invites and cannot prove unique people joined. Gateway
join/remove events and VIP-role additions provide an independent event log;
invite attribution is null if the per-join invite diff is ambiguous or the bot
cannot read invites. No user ID is returned from the admin report.

`paid_role_at` records addition of the configured Discord membership role. The
current checkout code can grant that role during a trial or creator access, so
this is **not** a Stripe-verified paid conversion count. A payment-only metric
would require a separate Stripe entitlement signal and is outside this join-log
change.

Invite labels live in `config/discord-invite-labels.json`. The existing
`sB9vzGz2xj` code is `x-first-reply`; unknown codes are `other`. The owner will
create separate invite codes for Instagram, TikTok, YouTube, and the website;
add their labels to this config afterward. One shared invite cannot distinguish
those sources.

## Required access and rollout (owner approval required)

- Bot permission: **Manage Server / Manage Guild** is required to read guild
  invites. The repository does not prove the bot currently has it in the live
  guild; verify its actual role permissions and category overrides before
  deployment. The daily count read uses the existing bot token.
- Gateway intent: `GuildMembers` is already requested in code; **Server Members
  Intent** must also remain enabled for this application in the Discord
  Developer Portal. No new gateway is added.
- Existing Render variables: `DISCORD_TOKEN`, `DISCORD_GUILD_ID`,
  `FREE_PICK_SITE_PUBLISH_URL`, `FREE_PICK_SITE_PUBLISH_SECRET`. No new secret is
  introduced. Optional `DISCORD_GROWTH_PAID_ROLE_ID` selects the role whose
  addition is logged; its default is the current checkout member role
  `1539063967878619218`. The publisher Worker needs its existing `DB` D1 binding and the
  same `FREE_PICK_SITE_PUBLISH_SECRET`.
- After approval: apply `cloudflare/migrations/005_discord_growth.sql` to the
  `bettinghub-publisher` D1 database; deploy the publisher Worker; deploy the
  Render bot worker from the same commit. Check the first snapshot log and
  `GET /admin/discord-growth?days=7` with the publisher bearer secret.
- This branch does **not** apply the migration, deploy, or change Discord
  roles/permissions. No member DMs or public posts are added.

## Mock dry run

`npm run discord-growth:dry-run` makes zero writes and uses only mocked Discord
responses. It prints:

```json
{
  "status": "dry_run",
  "date": "2026-11-26",
  "taken_at": "2026-11-27T06:55:00.000Z",
  "member_count": 1326,
  "presence_count": 248,
  "invites": [
    { "code": "sB9vzGz2xj", "uses": 82, "label": "x-first-reply", "channel_label": "start-here" },
    { "code": "exampleIG", "uses": 4, "label": "other", "channel_label": "general" }
  ]
}
```

The numbers above are fixtures, **not** current server counts.
