# Isolated Image Free Pick Acceptance — 2026-09-13

Owner: Zakai Martin  
Environment: Cloudflare staging only  
Outcome: Passed and fixtures cleaned

## Isolation boundary

- Worker: `bettinghub-publisher-staging`
- Final verified Worker version: `8c2bb6df-d13c-47f7-8f28-06eec7225b16`
- D1: `bettinghub-publisher-staging` (`b75fa523-7bd9-4c65-b19d-10ea54a3f5c5`)
- KV: `bettinghub-publisher-staging-free-pick` (`1796c6de13894ecfa0355298633317e4`)
- Publish credential: encrypted Cloudflare Worker secret; its value was not printed or committed.
- Disabled in staging: scheduled cron, X client/connection, recap recipient, Discord delivery, production D1, and production KV.

## Request/result trail

| Check | Expected | Observed |
|---|---:|---:|
| Worker health | `200` | `200`; ready, Free Pick store configured, `xConnected=false` |
| Publish with wrong credential | `401` | `401` |
| Publish 1×1 PNG fixture with staging credential | `201` | `201`; `xPosted=false` |
| Read current metadata | `200` | `200`; date `2099-01-01`, selection `fixture only` |
| Read current image | `200 image/png` | `200 image/png`, 68 bytes |
| Exact byte comparison | identical SHA-256 | `431ced6916a2a21a156e38701afe55bbd7f88969fbbfc56d7fe099d47f265460` |
| State after cleanup | no current fixture | `404` |

The fixture image key and `free-picks/current.json` were deleted from only the staging KV namespace. The staging resources and encrypted credential remain for future isolated acceptance runs.

## Failed attempts retained as evidence

1. The first health probe returned `500` because a fresh D1 database had no `oauth_tokens` table even though X was intentionally absent. The Worker now returns `xConnected=false` without querying OAuth storage when `X_CLIENT_ID` is empty. A regression test covers that boundary.
2. The first immediate request after a secret change returned `401` because the new secret version was not yet active at the edge. The final harness verifies credential activation with a non-publishing invalid payload before running the media acceptance.

Neither failed attempt wrote a production record or invoked X, Discord, email, Stripe, Supabase, or any customer-facing route.

## Reproduction

Run `scripts/staging-free-pick-smoke.mjs` with `STAGING_FREE_PICK_URL` and `STAGING_FREE_PICK_SECRET`. The script checks health, unauthorized rejection, authorized multipart publication, current metadata, image content type, and exact image bytes. Cleanup remains an explicit operator step so the exact generated object key can be validated before deletion.
