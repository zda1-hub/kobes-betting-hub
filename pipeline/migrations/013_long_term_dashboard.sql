-- Long-term dashboard reporting and lifecycle-email infrastructure.
ALTER TABLE analytics_events DROP CONSTRAINT IF EXISTS analytics_events_event_name_check;
ALTER TABLE analytics_events ADD CONSTRAINT analytics_events_event_name_check CHECK (event_name IN (
  'page_view','join_page_view','offer_selected','discord_connect_started','discord_verified',
  'discord_connect_failed','checkout_started','payment_completed','vip_activated',
  'vip_activation_failed','subscription_started','subscription_renewed',
  'cancellation_scheduled','cancellation_completed','membership_expired','payment_failed',
  'starter_started','starter_expired','starter_upgraded','referral_visit','referral_checkout',
  'referral_conversion','refund','dispute','retention_offer_shown','retention_offer_accepted'
));

CREATE TABLE IF NOT EXISTS member_lifecycle_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dedupe_key text NOT NULL UNIQUE,
  stripe_subscription_id text NOT NULL,
  stripe_customer_id text NOT NULL,
  email_type text NOT NULL CHECK (email_type IN ('INCOMPLETE_ONBOARDING','INTRO_EXPIRING')),
  recipient text NOT NULL CHECK (length(recipient) BETWEEN 3 AND 254),
  subject text NOT NULL,
  body text NOT NULL CHECK (length(body) <= 12000),
  status text NOT NULL DEFAULT 'QUEUED'
    CHECK (status IN ('QUEUED','SEND_STARTED','DELIVERED','REVIEW_REQUIRED')),
  claim_token uuid,
  send_started_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'QUEUED' AND claim_token IS NULL AND send_started_at IS NULL)
    OR (status <> 'QUEUED' AND claim_token IS NOT NULL AND send_started_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS member_lifecycle_outbox_queue_idx
  ON member_lifecycle_outbox (created_at) WHERE status = 'QUEUED';
ALTER TABLE member_lifecycle_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON member_lifecycle_outbox FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON member_lifecycle_outbox TO service_role;

INSERT INTO pick_operations_schema_migrations (version, applied_at)
VALUES ('013_long_term_dashboard', now()) ON CONFLICT (version) DO NOTHING;
