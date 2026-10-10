-- Standard $32.99 monthly checkout becomes available when the October first-month offer ends.
-- Existing offer identifiers stay valid for active checkout sessions and subscriptions.
ALTER TABLE membership_checkout_associations
  DROP CONSTRAINT IF EXISTS membership_checkout_associations_offer_check;

ALTER TABLE membership_checkout_associations
  ADD CONSTRAINT membership_checkout_associations_offer_check
  CHECK (offer IN ('starter','trial_2_day','referral_trial','first_month_back','monthly','six_month','annual'));

INSERT INTO pick_operations_schema_migrations (version, applied_at)
VALUES ('018_standard_monthly_offer', now()) ON CONFLICT (version) DO NOTHING;
