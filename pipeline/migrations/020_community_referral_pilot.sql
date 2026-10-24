-- Community referral links never grant VIP access. Cash stays behind a recorded
-- human review even after a qualifying first monthly payment and seven-day hold.
ALTER TABLE referral_profiles
  ADD COLUMN IF NOT EXISTS contact_email text,
  ADD COLUMN IF NOT EXISTS community_joined_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS referral_profiles_one_community_email
  ON referral_profiles (lower(contact_email)) WHERE contact_email IS NOT NULL;

ALTER TABLE referral_rewards
  ADD COLUMN IF NOT EXISTS referrer_access_kind text NOT NULL DEFAULT 'VIP'
    CHECK (referrer_access_kind IN ('VIP', 'COMMUNITY')),
  ADD COLUMN IF NOT EXISTS community_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS community_reviewed_by text,
  ADD COLUMN IF NOT EXISTS community_review_note text;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'referral_rewards_community_requires_review') THEN
    ALTER TABLE referral_rewards
      ADD CONSTRAINT referral_rewards_community_requires_review
      CHECK (referrer_access_kind <> 'COMMUNITY' OR status NOT IN ('READY', 'PAYOUT_SENT')
        OR (community_reviewed_at IS NOT NULL AND community_reviewed_by IS NOT NULL));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS referral_rewards_community_review_queue
  ON referral_rewards (eligible_at)
  WHERE referrer_access_kind = 'COMMUNITY' AND status = 'REVIEW_REQUIRED'
    AND stripe_outbound_payment_id IS NULL;

INSERT INTO pick_operations_schema_migrations (version, applied_at)
VALUES ('020_community_referral_pilot', now()) ON CONFLICT (version) DO NOTHING;
