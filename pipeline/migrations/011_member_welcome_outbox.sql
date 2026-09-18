-- Transactional onboarding only. Not a marketing list or arbitrary mail relay.
CREATE TABLE IF NOT EXISTS member_welcome_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_subscription_id text NOT NULL UNIQUE,
  stripe_checkout_session_id text NOT NULL UNIQUE,
  stripe_customer_id text NOT NULL,
  recipient text NOT NULL CHECK (length(recipient) BETWEEN 3 AND 254),
  subject text NOT NULL,
  body text NOT NULL CHECK (length(body) <= 12000),
  status text NOT NULL DEFAULT 'QUEUED'
    CHECK (status IN ('QUEUED', 'SEND_STARTED', 'DELIVERED', 'REVIEW_REQUIRED')),
  claim_token uuid,
  send_started_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'QUEUED' AND claim_token IS NULL AND send_started_at IS NULL)
    OR (status <> 'QUEUED' AND claim_token IS NOT NULL AND send_started_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS member_welcome_outbox_queue_idx
  ON member_welcome_outbox (created_at) WHERE status = 'QUEUED';
ALTER TABLE member_welcome_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON member_welcome_outbox FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON member_welcome_outbox TO service_role;
INSERT INTO pick_operations_schema_migrations (version, applied_at)
VALUES ('011_member_welcome_outbox', NOW()) ON CONFLICT (version) DO NOTHING;
