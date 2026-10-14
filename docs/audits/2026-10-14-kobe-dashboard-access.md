# Kobe dashboard access - October 14, 2026

User explicitly confirmed full existing dashboard access for Kobe Discord ID 1209660006383755265. Production checkout Worker ADMIN_DISCORD_USER_IDS updated from 832944927884312606 to both IDs using settings-only Cloudflare PATCH. No Worker source uploaded. Read-back verified both IDs and unchanged inventory and values of all other 28 bindings, plus other settings. Existing user access preserved. wrangler.jsonc synchronized to prevent a later release removing Kobe.

Access is Discord OAuth based; no password created, no login impersonation, and email is not the authorization key. Kobe must sign in to /admin-analytics with that Discord account. Live configuration verified; his actual browser session has not been exercised. No messages sent to Kobe.
