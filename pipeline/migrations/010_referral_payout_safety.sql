-- No existing amounts or eligibility periods are changed. Provider-uncertain
-- legacy attempts must be reconciled, never automatically replayed.
ALTER TABLE referral_rewards
  ADD COLUMN IF NOT EXISTS payment_fingerprint_sha256 text,
  ADD COLUMN IF NOT EXISTS qualifying_charge_id text,
  ADD COLUMN IF NOT EXISTS payout_attempt_started_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS referral_rewards_one_discord_identity
  ON referral_rewards (referred_discord_user_id)
  WHERE referred_discord_user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS referral_rewards_one_payment_fingerprint
  ON referral_rewards (payment_fingerprint_sha256)
  WHERE payment_fingerprint_sha256 IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS referral_rewards_one_qualifying_charge
  ON referral_rewards (qualifying_charge_id)
  WHERE qualifying_charge_id IS NOT NULL;

UPDATE referral_rewards SET status = 'REVIEW_REQUIRED',
  status_reason = 'LEGACY_PAYOUT_ATTEMPT_REQUIRES_RECONCILIATION', updated_at = NOW()
WHERE status IN ('READY', 'PAYOUT_FAILED') AND stripe_outbound_payment_id IS NULL
  AND payout_attempt_started_at IS NULL;

INSERT INTO pick_operations_schema_migrations (version, applied_at)
VALUES ('010_referral_payout_safety', NOW()) ON CONFLICT (version) DO NOTHING;
