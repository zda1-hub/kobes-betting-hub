-- Allow the September 22–October 21 first-month-back subscription offer.
-- Keep legacy offers valid for existing checkout sessions and referrals.
ALTER TABLE membership_checkout_associations
  DROP CONSTRAINT IF EXISTS membership_checkout_associations_offer_check;

ALTER TABLE membership_checkout_associations
  ADD CONSTRAINT membership_checkout_associations_offer_check
  CHECK (offer IN ('starter','trial_2_day','referral_trial','first_month_back','six_month','annual'));

INSERT INTO pick_operations_schema_migrations (version, applied_at)
VALUES ('015_first_month_back_offer', now()) ON CONFLICT (version) DO NOTHING;
