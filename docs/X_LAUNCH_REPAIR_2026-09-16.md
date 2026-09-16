# X launch repair — September 16, 2026

## Outcome and boundary

Production X authentication and the Render → Publisher delivery credential are repaired. Post-deploy verification completed at approximately 16:44 MST (23:44 UTC). **No public X post, Discord message, email, ad, payment, refund, or membership change was created by this repair.** One genuine newly approved Free Pick must still prove the X write and recorded post ID/URL. Provider write quota/credits and image upload are not established by the read-only authentication check.

## Root causes and repair

1. Publisher version `ea6896dc-fcff-4fc2-b692-7322bacb6544` lacked `TOKEN_ENCRYPTION_KEY`. Decryption failed before an audited X API call even though public health reported `xConnected:true`. The original encrypted binding was inherited from version `5db6c12b-4085-48a9-ab9e-e068b8c87c42`, without disclosing its value or rolling code back.
2. Render's existing `FREE_PICK_X_QUEUE_SECRET` no longer matched the Publisher's general `QUEUE_INGEST_SECRET`. The matching historical binding was identified by a fingerprint-only probe, then inherited from version `64d556e6-678d-4a6a-91f8-e6aa2639ccaf` into a separate encrypted Publisher binding `FREE_PICK_X_QUEUE_SECRET`. Only the X queue accepts that dedicated key; other queue keys were preserved.
3. Regression checks exposed missing `await` in daily queue authorization and recap fallback checks. Daily reads/writes/acknowledgements now fail closed; legitimate recap credentials retain their intended fallback behavior.
4. The public X account-connection start endpoint could initiate replacement of the publishing identity. It now requires the operator's general queue credential. The dedicated Render X delivery credential cannot initiate replacement. This does not change membership Discord OAuth.

Twenty-four queued plays created August 29–September 5 were reversibly placed in `draft` before recovering X authorization. Their complete original rows remain in `x_launch_hold_20260916`. Do not release them as current plays. The encrypted token row was copied to `x_launch_token_backup_20260916` before refresh; its values were not exposed.

## Deployment

- Source fix: `dbd23fd42389ec3e58bfb960a4637f186a67067d`, pushed to GitHub `main`.
- Publisher active version: `2f3418de-62bc-4f36-b169-e8521d77d815`.
- Pre-code-fix, restored-key rollback version: `776d3c3f-e5d0-4895-9b13-25a34115c768`. It lacks the new scoped-key/admin/await fixes; use only after reviewing impact, not as an automatic regression rollback.
- The deployed patch was applied to the **pinned active live bundle**, not the older dirty operating worktree. Live image and Instagram Story code was preserved; all prior binding names remain plus the dedicated X key.
- Historical encrypted bindings were inherited through the version-specific Workers API. No credential value was written into source, logs, chat or disk.
- Temporary readiness/fingerprint routes and probe bindings were removed from both the active and latest-uploaded version.
- No destructive schema migration. Recovery tables are additive and the queue hold is reversible.
- Render service `srv-da6hvmijnfac73apb6v0` became live after the source push at 16:43:45 MST, registered commands and logged in as Kobe Bot at 16:43:47.

## Verification evidence

- Exact-main release: **217/217** tests passed. Initial dependency resolution failures were resolved using existing project/runtime dependencies; the final complete suite passed.
- Operating worktree: **194/194** tests passed.
- Exact edited live bundle: **29** mock authorization assertions passed, with zero provider calls.
- Production credential-free website smoke: **5/5** passed.
- X token refresh: `/2/oauth2/token` returned **200**, recorded as `launch_preflight_token_refresh / SUCCEEDED` in `x_api_call_audit`.
- X identity: `/2/users/me` returned **200**, recorded as `launch_preflight / SUCCEEDED`. Confirmed publishing account **@kobesbettinghub**, with `tweet.write`, `media.write`, `users.read`, `tweet.read` and `offline.access`.
- From the authenticated Render hosted shell using only its existing environment: `FREE_PICK_X_SYNC_ENABLED=true`; X queue GET returned **200**; malformed POST `{}` returned **400** without an insert; X connection start using that dedicated key returned **401**.
- Anonymous X connection start returned **401**.
- D1 recheck: **24 draft**, zero approved/publishing; recovery hold table contains **24** original rows. No public fixture or old wager was posted.
- Render logs show normal startup. One September 15 official pick remains pending because no matching ESPN event was found; the recap is correctly held rather than guessed. This is an existing grading exception, not proof of a new recap delivery.

## Remaining launch checklist

1. Kobe confirms Thursday September 17's announcement time; tentative 10 AM Pacific/Arizona is not an installed launch timer.
2. Kobe uses the **Free Pick approval button** on one genuine current play. Verify matching Discord message → website item → X post ID/URL and durable successful audit. If X fails, preserve the website/Discord outcome and investigate sanitized provider status; never replay the old held queue.
3. Monitor the first five new members for payment/trial → correct Discord access → available billing portal. Stop new invitations for a charge/access, duplicate subscription or portal defect.
4. Seller confirms tax applicability/registration and corresponding Stripe configuration. Tax was neither enabled nor disabled here. Zakai retains the fully executed agreement and completes his own signature if still outstanding.
5. Marketing spend requires separate approval. Existing social copy is compact `FREE PLAY` plus wager terms, not yet a campaign-attributed CTA renderer; do not describe it as fully conversion-optimized.

Ordinary human Discord messages and manual `/publish-pick` do not automatically enter the inspected Free Pick X approval bridge. Multiple same-day image picks use a date guard, not a complete per-pick exactly-once ledger. The first real write, media acceptance, ambiguous-response duplicate protection, and expanded manual/channel ingestion remain explicit follow-ups.
