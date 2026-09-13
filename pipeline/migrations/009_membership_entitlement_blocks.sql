ALTER TABLE membership_subscriptions
  ADD COLUMN IF NOT EXISTS entitlement_blocked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS entitlement_block_reason text,
  ADD COLUMN IF NOT EXISTS entitlement_blocked_at timestamptz;

INSERT INTO pick_operations_schema_migrations (version, applied_at)
VALUES ('009_membership_entitlement_blocks', NOW())
ON CONFLICT (version) DO NOTHING;
