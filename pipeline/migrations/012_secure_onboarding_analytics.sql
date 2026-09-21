-- Payment-authorized Discord onboarding and privacy-minimized first-party analytics.
CREATE TABLE IF NOT EXISTS membership_checkout_associations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_token_hash text NOT NULL UNIQUE,
  offer text NOT NULL CHECK (offer IN ('starter','trial_2_day','referral_trial','six_month','annual')),
  referral_code text,
  analytics_session_id uuid,
  attribution jsonb NOT NULL DEFAULT '{}'::jsonb,
  discord_user_id text,
  stripe_checkout_session_id text UNIQUE,
  stripe_customer_id text,
  stripe_subscription_id text UNIQUE,
  status text NOT NULL DEFAULT 'PENDING_DISCORD' CHECK (status IN (
    'PENDING_DISCORD','DISCORD_VERIFIED','CHECKOUT_STARTED','PAYMENT_CONFIRMED',
    'VIP_PENDING','VIP_ACTIVE','VIP_FAILED','EXPIRED'
  )),
  activation_attempts integer NOT NULL DEFAULT 0,
  last_activation_attempt_at timestamptz,
  next_retry_at timestamptz,
  last_error_code text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS membership_checkout_retry_queue
  ON membership_checkout_associations (next_retry_at)
  WHERE status IN ('VIP_PENDING','VIP_FAILED');

CREATE TABLE IF NOT EXISTS analytics_sessions (
  id uuid PRIMARY KEY,
  first_path text NOT NULL,
  first_referrer_host text,
  first_touch jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_touch jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS analytics_events (
  id uuid PRIMARY KEY,
  dedupe_key text UNIQUE,
  session_id uuid,
  event_name text NOT NULL CHECK (event_name IN (
    'page_view','join_page_view','offer_selected','discord_verified','checkout_started',
    'payment_completed','vip_activated','vip_activation_failed','refund','dispute',
    'cancellation_scheduled','cancellation_completed','retention_offer_shown',
    'retention_offer_accepted'
  )),
  path text,
  offer text,
  stripe_customer_id text,
  stripe_subscription_id text,
  discord_user_id text,
  properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS analytics_events_funnel ON analytics_events (event_name, occurred_at DESC);
CREATE INDEX IF NOT EXISTS analytics_events_session ON analytics_events (session_id, occurred_at);

CREATE TABLE IF NOT EXISTS cancellation_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_subscription_id text NOT NULL,
  discord_user_id text,
  reason_code text NOT NULL,
  reason_text text,
  retention_offer_shown boolean NOT NULL DEFAULT false,
  retention_offer_accepted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS membership_billing_events (
  stripe_event_id text PRIMARY KEY,
  stripe_invoice_id text,
  stripe_charge_id text,
  stripe_customer_id text,
  stripe_subscription_id text,
  event_type text NOT NULL CHECK (event_type IN ('invoice_paid','invoice_failed','refund','dispute')),
  amount_cents integer,
  currency text,
  billing_reason text,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS membership_billing_timeline ON membership_billing_events (occurred_at DESC);

ALTER TABLE membership_checkout_associations ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE cancellation_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership_billing_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON membership_checkout_associations, analytics_sessions, analytics_events, cancellation_feedback, membership_billing_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON membership_checkout_associations, analytics_sessions, analytics_events, cancellation_feedback, membership_billing_events TO service_role;

INSERT INTO pick_operations_schema_migrations (version, applied_at)
VALUES ('012_secure_onboarding_analytics', now()) ON CONFLICT (version) DO NOTHING;
