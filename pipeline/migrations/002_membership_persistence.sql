CREATE TABLE IF NOT EXISTS membership_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_customer_id text NOT NULL UNIQUE,
  discord_user_id text UNIQUE,
  current_subscription_id text,
  linked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS membership_subscriptions (
  stripe_subscription_id text PRIMARY KEY,
  stripe_customer_id text NOT NULL,
  status text NOT NULL,
  price_id text,
  offer text,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  current_period_start timestamptz,
  current_period_end timestamptz,
  trial_end timestamptz,
  last_stripe_event_id text,
  raw_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS membership_subscriptions_customer_lookup
  ON membership_subscriptions (stripe_customer_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  stripe_created_at timestamptz,
  livemode boolean NOT NULL DEFAULT false,
  payload_sha256 text NOT NULL,
  status text NOT NULL,
  outcome text,
  error_detail text,
  received_at timestamptz NOT NULL,
  processed_at timestamptz
);

CREATE TABLE IF NOT EXISTS membership_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  actor_type text NOT NULL,
  actor_id text,
  stripe_customer_id text,
  stripe_subscription_id text,
  discord_user_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS membership_events_customer_timeline
  ON membership_events (stripe_customer_id, occurred_at DESC);

ALTER TABLE membership_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON membership_customers FROM anon, authenticated;
REVOKE ALL ON membership_subscriptions FROM anon, authenticated;
REVOKE ALL ON stripe_webhook_events FROM anon, authenticated;
REVOKE ALL ON membership_events FROM anon, authenticated;

INSERT INTO pick_operations_schema_migrations (version, applied_at)
VALUES ('002_membership_persistence', NOW())
ON CONFLICT (version) DO NOTHING;
