CREATE TABLE IF NOT EXISTS referral_sandbox_api_call_events (
  id uuid PRIMARY KEY,
  environment text NOT NULL,
  operation_id text,
  workflow_id text,
  pick_id text,
  member_id text,
  service text NOT NULL,
  endpoint_class text NOT NULL,
  method text NOT NULL,
  caller_component text NOT NULL,
  trigger_type text NOT NULL,
  provider_request_id text,
  client_request_id text,
  idempotency_key text,
  provider_scope text,
  request_payload_sha256 text,
  response_payload_sha256 text,
  response_status integer,
  outcome text NOT NULL,
  error_class text,
  retry_count integer NOT NULL DEFAULT 0,
  latency_ms integer,
  model text,
  prompt_version text,
  input_tokens integer,
  cached_input_tokens integer,
  output_tokens integer,
  image_tokens integer,
  estimated_cost_usd numeric,
  pricing_version text,
  provider_billed_cost_usd numeric,
  code_commit text,
  runtime_instance text,
  occurred_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS referral_sandbox_membership_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_customer_id text NOT NULL UNIQUE,
  discord_user_id text UNIQUE,
  current_subscription_id text,
  linked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS referral_sandbox_membership_subscriptions (
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

CREATE TABLE IF NOT EXISTS referral_sandbox_stripe_webhook_events (
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

CREATE TABLE IF NOT EXISTS referral_sandbox_membership_events (
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

CREATE TABLE IF NOT EXISTS referral_sandbox_referral_profiles (
  discord_user_id text PRIMARY KEY,
  referral_code text NOT NULL UNIQUE,
  stripe_recipient_account_id text UNIQUE,
  payout_status text NOT NULL DEFAULT 'NOT_CONNECTED',
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS referral_sandbox_referral_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_code text NOT NULL REFERENCES referral_sandbox_referral_profiles (referral_code),
  referrer_discord_user_id text NOT NULL REFERENCES referral_sandbox_referral_profiles (discord_user_id),
  referred_discord_user_id text,
  referred_stripe_customer_id text NOT NULL,
  referred_subscription_id text NOT NULL UNIQUE,
  first_paid_invoice_id text UNIQUE,
  first_paid_at timestamptz,
  eligible_at timestamptz,
  reward_amount_cents integer NOT NULL DEFAULT 1000 CHECK (reward_amount_cents = 1000),
  currency text NOT NULL DEFAULT 'usd' CHECK (currency = 'usd'),
  status text NOT NULL DEFAULT 'PENDING_PAYMENT',
  status_reason text,
  stripe_outbound_payment_id text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS referral_sandbox_referral_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_reward_id uuid REFERENCES referral_sandbox_referral_rewards (id),
  event_type text NOT NULL,
  actor_type text NOT NULL DEFAULT 'system',
  actor_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS referral_sandbox_referral_auth_sessions (
  token_hash text PRIMARY KEY,
  discord_user_id text NOT NULL REFERENCES referral_sandbox_referral_profiles (discord_user_id),
  contact_email text NOT NULL,
  display_name text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS referral_sandbox_membership_subscriptions_customer_lookup ON referral_sandbox_membership_subscriptions (stripe_customer_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS referral_sandbox_referral_rewards_payout_queue ON referral_sandbox_referral_rewards (status, eligible_at) WHERE stripe_outbound_payment_id IS NULL;
CREATE INDEX IF NOT EXISTS referral_sandbox_referral_rewards_referrer_timeline ON referral_sandbox_referral_rewards (referrer_discord_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS referral_sandbox_referral_events_reward_timeline ON referral_sandbox_referral_events (referral_reward_id, occurred_at DESC);

ALTER TABLE referral_sandbox_api_call_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_sandbox_membership_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_sandbox_membership_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_sandbox_stripe_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_sandbox_membership_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_sandbox_referral_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_sandbox_referral_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_sandbox_referral_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_sandbox_referral_auth_sessions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON referral_sandbox_api_call_events, referral_sandbox_membership_customers, referral_sandbox_membership_subscriptions, referral_sandbox_stripe_webhook_events, referral_sandbox_membership_events, referral_sandbox_referral_profiles, referral_sandbox_referral_rewards, referral_sandbox_referral_events, referral_sandbox_referral_auth_sessions FROM anon, authenticated;

GRANT ALL ON referral_sandbox_api_call_events, referral_sandbox_membership_customers, referral_sandbox_membership_subscriptions, referral_sandbox_stripe_webhook_events, referral_sandbox_membership_events, referral_sandbox_referral_profiles, referral_sandbox_referral_rewards, referral_sandbox_referral_events, referral_sandbox_referral_auth_sessions TO service_role;
