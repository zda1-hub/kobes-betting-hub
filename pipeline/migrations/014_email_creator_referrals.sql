-- Creator referrals have a verified contact email and a separate payout identity.
-- Existing member referral ownership and rewards remain unchanged.
CREATE TABLE IF NOT EXISTS creator_referral_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_email text NOT NULL UNIQUE CHECK (contact_email = lower(contact_email)),
  display_name text NOT NULL CHECK (length(display_name) BETWEEN 2 AND 120),
  referral_code text NOT NULL UNIQUE CHECK (referral_code ~ '^KBC-[A-Z0-9]{10}$'),
  discord_user_id text UNIQUE,
  trial_expires_at timestamptz,
  trial_role_removed_at timestamptz,
  stripe_recipient_account_id text UNIQUE,
  payout_status text NOT NULL DEFAULT 'NOT_CONNECTED',
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACTIVE','PAUSED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE referral_rewards ADD COLUMN IF NOT EXISTS creator_profile_id uuid REFERENCES creator_referral_profiles(id);
ALTER TABLE referral_rewards ALTER COLUMN referrer_discord_user_id DROP NOT NULL;
ALTER TABLE referral_rewards DROP CONSTRAINT IF EXISTS referral_rewards_referral_code_fkey;
ALTER TABLE referral_rewards ADD CONSTRAINT referral_rewards_one_owner CHECK (
  (creator_profile_id IS NOT NULL AND referrer_discord_user_id IS NULL)
  OR (creator_profile_id IS NULL AND referrer_discord_user_id IS NOT NULL)
);
CREATE OR REPLACE FUNCTION validate_referral_reward_owner() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.creator_profile_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM creator_referral_profiles
                   WHERE id = NEW.creator_profile_id AND referral_code = NEW.referral_code) THEN
      RAISE EXCEPTION 'Creator referral owner and code do not match';
    END IF;
  ELSIF NOT EXISTS (SELECT 1 FROM referral_profiles
                    WHERE discord_user_id = NEW.referrer_discord_user_id AND referral_code = NEW.referral_code) THEN
    RAISE EXCEPTION 'Member referral owner and code do not match';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS referral_rewards_validate_owner ON referral_rewards;
CREATE TRIGGER referral_rewards_validate_owner
  BEFORE INSERT OR UPDATE OF referral_code, referrer_discord_user_id, creator_profile_id
  ON referral_rewards FOR EACH ROW EXECUTE FUNCTION validate_referral_reward_owner();
CREATE INDEX IF NOT EXISTS referral_rewards_creator_timeline
  ON referral_rewards (creator_profile_id, created_at DESC) WHERE creator_profile_id IS NOT NULL;

ALTER TABLE creator_referral_profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON creator_referral_profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON creator_referral_profiles TO service_role;

INSERT INTO pick_operations_schema_migrations (version, applied_at)
VALUES ('014_email_creator_referrals', now()) ON CONFLICT (version) DO NOTHING;
