-- Creator VIP access can be tied to an active partnership instead of a short trial.
-- A null partnership end date means access continues until an administrator pauses
-- the creator or explicitly records an end date.
ALTER TABLE creator_referral_profiles
  ADD COLUMN IF NOT EXISTS access_mode text NOT NULL DEFAULT 'TRIAL'
    CHECK (access_mode IN ('TRIAL', 'PARTNERSHIP')),
  ADD COLUMN IF NOT EXISTS access_ends_at timestamptz;

CREATE INDEX IF NOT EXISTS creator_partnership_access_expiry
  ON creator_referral_profiles (access_ends_at)
  WHERE access_mode = 'PARTNERSHIP' AND access_ends_at IS NOT NULL
    AND trial_role_removed_at IS NULL;

INSERT INTO pick_operations_schema_migrations (version, applied_at)
VALUES ('017_creator_partnership_access', now()) ON CONFLICT (version) DO NOTHING;
