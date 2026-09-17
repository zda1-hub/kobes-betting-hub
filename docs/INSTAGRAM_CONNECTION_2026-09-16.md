# Bettinhub Instagram connection — September 16, 2026

## State and scope

Prepared and locally verified, **not deployed or connected**. Target is **@bettinhub**, a Business account (939 followers per owner). Kobe's Locks is excluded. No Instagram, X, Discord or email content was sent. No membership, Stripe, tax or existing production runtime changed.

The separate connection-only Worker keeps this work out of the existing Discord approval, website, X and Story-artwork paths. It deliberately has **no publishing endpoint, queue consumer or cron**. A connected account is not proof that Story delivery works. The existing approved-Free-Pick artwork/email path is unchanged; API Story publishing remains the next implementation/acceptance boundary after owner authorization.

## Built

- Operator-authenticated, 24-hour, single-use invitations. Opening the link or a messaging-service preview does not consume it; Kobe must press Authorize.
- Meta Instagram Business Login requesting only `instagram_business_basic` and `instagram_business_content_publish`. No messaging, comments, advertising, personal-account or Kobe's Locks access.
- Ten-minute one-use OAuth state bound to the same browser with Secure/HttpOnly/SameSite cookie. Denial, expiry and replay fail closed.
- Short-to-long-lived token exchange; permission checks; server verification of username, Business type and stable professional account ID. Account IDs are handled as strings without numeric rounding.
- Independent AES-GCM key with random nonce and account-bound authenticated data. Tokens and app secrets never reach the client, logs, status response or audit ledger.
- Profile-only account check, guarded manual token refresh and local disconnect. Refresh is refused while a token is too young or expired; no automatic refresh is installed in this connection-only release.
- Redacted, append-only D1 provider-call/action trail with correlation ID, controlled endpoint class, outcome/status, timing, response-shape hash, trace ID and Worker version. Audit initialization/attempt recording precedes external requests.
- Automatic request invocation logging and tracing are disabled for this OAuth Worker so invite/state/code-bearing request URLs are not persisted through those mechanisms; structured redacted application logs remain enabled. Do not enable URL-bearing logs/tails when a real authorization is in progress.
- Disconnect invalidates pending invitations/states and prevents an in-flight callback from restoring a removed connection. Provider failures preserve any prior verified credential.

## Configuration / operator work before Kobe can authorize

1. Locate or create the owner-approved **Business-type Meta developer app** and add **Instagram → API setup with Instagram business login**. Use its **Instagram App ID/Secret**, not the Facebook app credentials. New Meta-account/app legal agreements require the human account owner.
2. Confirm permitted access level. Meta documents Standard Access for professional accounts owned/managed by the app operator and added in the dashboard; serving an account not owned/managed requires Advanced Access/App Review. Being able to log in is not a substitute for this check. Add/accept the appropriate account/app role when required; do not assume review or verification can be bypassed.
3. Register the exact redirect URI (no extra slash):

   `https://bettinghub-instagram.kobedirwin.workers.dev/auth/instagram/callback`

   If using the isolated staging Worker, register its separate URI:

   `https://bettinghub-instagram-staging.kobedirwin.workers.dev/auth/instagram/callback`

4. Keep `INSTAGRAM_PUBLIC_ORIGIN` pinned to the deployed service. Set `INSTAGRAM_APP_ID`; `INSTAGRAM_API_VERSION=v25.0` matches Meta's current Get Started example retrieved September 16. Review the app's supported version before activation.
5. Install encrypted Worker secrets: `INSTAGRAM_APP_SECRET`, a dedicated random operator credential of at least 32 characters (`INSTAGRAM_OPERATOR_SECRET`), and an independent random 32-byte base64 AES key (`INSTAGRAM_TOKEN_ENCRYPTION_KEY`). Do not copy the X/website/email queue secrets. Keep a secure recoverable copy of the encryption key; replacing it makes saved tokens unreadable.
6. Deploy only this Worker, with `wrangler.instagram.jsonc`. Staging uses the existing isolated Publisher staging D1; production uses separate Instagram tables in the existing production Publisher D1. Never deploy the Publisher or bot as part of this change. There are no schema writes while app configuration is missing.
7. Verify public `/health`: configured must be true, mode must be `connection-only`, publishingEnabled must be false. The response intentionally does not disclose whether Kobe authorized or expose account details.
8. Using the private operator credential, POST `/operator/instagram/invite`. Send only its returned `authorizeUrl` to Kobe, never the operator key, encryption key, app secret or access token. The invite URL itself is a short-lived capability: keep it out of repositories/public announcements.

## Kobe action and subsequent checks

Kobe opens the invite **in one regular browser**, presses Authorize, logs in to **@bettinhub**, grants the two requested permissions, and waits for “Connected @bettinhub successfully.” He can then tell Zakai it completed. Do not send an authorization link before the Meta app and live callback are actually configured.

Afterward, authenticated GET `/operator/instagram/status` confirms encrypted connection metadata. POST `/operator/instagram/check` makes one profile GET and verifies the expected username, Business account and pinned ID, without posting. Inspect correlated `instagram_connection_audit` rows. Tokens remain secret.

POST `/operator/instagram/refresh` is a deliberate credential-maintenance operation, not a read-only check; it verifies identity first and refreshes only a valid long-lived token at least 24 hours old. Schedule reliable maintenance in the later publishing release, before expiration. Revocation/password/provider changes can still require renewed consent.

POST `/operator/instagram/disconnect` deletes only this service's token, invitations and OAuth states and retains the audit. It does **not** revoke Meta's app grant; Kobe can remove that separately in Instagram's app permissions. Rollback/disable this separate Worker without changing the existing Publisher, bot or membership service.

## Remaining Story-publishing acceptance — not implemented/activated by this release

After read-only authorization passes, implement a separately disabled Story dispatch boundary using approved free-pick terms/artwork only; verify Meta's supported image format (the existing artwork is PNG), never silently truncate wager terms, enforce daily/pick idempotency, exclude past picks/backlog, record container/media IDs, hold ambiguous delivery rather than blind-retry, and require explicit approval for the first real public Story. No paid or rejected Discord pick should enter that path. Confirm the Story on Instagram and its corresponding audit row before enabling automatic publishing. Link stickers/cross-posting are not promised by this connection release.

## Verification trail

- Node 24 local connection tests: **19/19 passed** with in-memory SQLite executing real SQL/atomic claims/append-only triggers and mocked Instagram responses, plus log/secret/staging configuration and no-publish regression guards. No Meta request was made by tests. Older Node versions without `node:sqlite` skip the SQLite-backed suite; use Node 24 for release verification.
- Wrangler 4.132.0 staging deploy dry run passed (24.23 KiB module bundle). This command did not deploy or touch remote D1.
- Full repository regression suite: **236/236 passed**, including the existing locked Discord formatting, Story artwork, website/X transport, checkout and billing tests.
- Local Cloudflare Worker-runtime/D1 verification: **16 assertions passed** (real crypto/bindings, invite preview, consent start, declined consent, replay rejection, operator authentication, no publishing route and local disconnect). The retained local audit contains five fixture action/failure rows, **zero provider calls** and **zero account connections** after cleanup. No remote D1 or production call occurred.
- No live account authorization or public Story test has passed yet.

## Official references retrieved

- [Meta Business Login: current scopes, consent, token exchange, refresh and access-level requirements](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login/)
- [Meta Get Started: profile fields, Business/Creator type and current API example](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/get-started)
- [Meta's official Instagram Postman collection](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api)
- [Cloudflare Workers best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/)

The Meta docs returned 429 in the web reader but their full Markdown content was successfully retrieved directly from the official URLs. This is source verification, not a successful live integration test.

### Reproduce the loopback-only runtime check

Use Node 24. Create a gitignored `.dev.vars` containing only these explicit fake fixtures (never a real Instagram token): app secret `fixture-not-real`, operator key `operator-fixture-key-not-real-1234567890`, and encryption key `DAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAw=` under the three secret names above. Start Wrangler with `dev --config wrangler.instagram.jsonc --env staging --local --local-protocol https --port 8796 --var INSTAGRAM_PUBLIC_ORIGIN:https://localhost:8796 --var INSTAGRAM_APP_ID:123456789`, then run `node scripts/check-instagram-local.mjs`. The script is hard-pinned to loopback and never follows Instagram redirects. Stop the local server and remove only this fake `.dev.vars` afterward. Both storage and actions are local; this does not create a Meta app or prove a real account authorization.
