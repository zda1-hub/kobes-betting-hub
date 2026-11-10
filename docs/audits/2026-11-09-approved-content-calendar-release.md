# Approved content calendar release — November 9, 2026

## Request

Activate Kobe's weekly X and Instagram calendar in Pacific time, including Thursday arbitrage at 3:30 PM, while preserving the canonical Free Pick automation and separate result-approval gate. Only verified, approved copy and art may publish. Avoid duplicate or stale posts and inspect separate platform receipts.

## Changed

- `bot/lib/marketing-calendar.js`: 28 DST-safe Pacific slots. The existing Free Pick publisher owns seven slots. Four native Instagram poll slots stay manual.
- `bot/commands.js` and `bot/index.js`: Kobe/owner-only `/approve-calendar-post` and `/calendar-status`. A scheduled post needs exact X copy pointing directly to the free Discord, a 1080 × 1920 JPEG, an internal evidence reference and confirmed rights. Arbitrage submission is limited to the 45 minutes before its slot.
- `cloudflare/bettinghub-publisher.js`: one immutable image per approved slot; scheduled X image post; distinct X and Instagram receipt states; unknown failures held; no missed-slot replay. Dispatch counts already delivered Free Pick and calendar posts against four slots for the day.
- `cloudflare/bettinghub-instagram.js`: reuses the connected @kobebettinghub Story publisher for the exact same approved calendar asset and target time. Native polls/link stickers remain manual app actions.
- `docs/operations/kobe-approved-content-calendar.md`: operator steps and limitations.

## Verification

- PR #377 merged into `main` as `5694536`.
- Render `kobes-betting-hub` deployment `dep-dbp823u7bikc73d96k1g` reached `live` and startup logged guild command registration.
- Cloudflare publisher deployed version `f4dfaf93-b83e-41d6-96c2-2d5dae288690` with a five-minute trigger; Instagram deployed `23c06629-f3cf-48d3-89ef-22293c7cf1e2` with the same trigger.
- Public health: X connected; publisher media ready; Instagram configured with Story/Reel publishing enabled. Read-only D1 inspection showed @kobebettinghub stored connection, valid through November 26, 2026, and recently published Free Pick Story/Reel receipts.
- 28-slot/DST, calendar queue and duplicate/media access, four-slot hold, and Instagram single-delivery tests passed. Both Wrangler production dry runs and `git diff --check` passed.

## Remaining evidence and limits

No approved calendar content was supplied for these slots, so no calendar post was queued or published as a release test. The first real approved X/Instagram pair must be checked in both public platforms after its target time. The connected Instagram Story API cannot add a native poll or tappable Discord link sticker. Member screenshots need the specific owner's consent and factual context before the new command is used. A four-slot cap is best effort for connected publishers; separately posted content and later Free Picks can change the day's total.
