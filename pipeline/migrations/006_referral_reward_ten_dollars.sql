-- New referrals earn $10. Keep the former $20 value valid so any reward
-- recorded under the original program can still be paid as promised.
ALTER TABLE referral_rewards
  DROP CONSTRAINT IF EXISTS referral_rewards_reward_amount_cents_check;

ALTER TABLE referral_rewards
  ALTER COLUMN reward_amount_cents SET DEFAULT 1000;

ALTER TABLE referral_rewards
  ADD CONSTRAINT referral_rewards_reward_amount_cents_valid
  CHECK (reward_amount_cents IN (1000, 2000));

INSERT INTO pick_operations_schema_migrations (version, applied_at)
VALUES ('006_referral_reward_ten_dollars', NOW())
ON CONFLICT (version) DO NOTHING;
