ALTER TABLE membership_subscriptions
  ADD COLUMN IF NOT EXISTS cancel_at timestamptz;

INSERT INTO pick_operations_schema_migrations (version, applied_at)
VALUES ('008_subscription_cancellation_fields', NOW())
ON CONFLICT (version) DO NOTHING;
