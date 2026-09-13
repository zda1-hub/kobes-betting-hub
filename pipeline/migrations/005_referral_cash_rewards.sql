CREATE TABLE IF NOT EXISTS referral_profiles (
  discord_user_id text PRIMARY KEY,
  referral_code text NOT NULL UNIQUE,
  stripe_recipient_account_id text UNIQUE,
  payout_status text NOT NULL DEFAULT 'NOT_CONNECTED',
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS referral_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_code text NOT NULL REFERENCES referral_profiles (referral_code),
  referrer_discord_user_id text NOT NULL REFERENCES referral_profiles (discord_user_id),
  referred_stripe_customer_id text NOT NULL UNIQUE,
  referred_subscription_id text NOT NULL UNIQUE,
  referred_discord_user_id text,
  first_paid_invoice_id text UNIQUE,
  first_paid_at timestamptz,
  eligible_at timestamptz,
  reward_amount_cents integer NOT NULL DEFAULT 2000 CHECK (reward_amount_cents = 2000),
  currency text NOT NULL DEFAULT 'usd' CHECK (currency = 'usd'),
  status text NOT NULL DEFAULT 'PENDING_PAYMENT',
  status_reason text,
  stripe_outbound_payment_id text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS referral_rewards_payout_queue
  ON referral_rewards (status, eligible_at)
  WHERE stripe_outbound_payment_id IS NULL;

CREATE INDEX IF NOT EXISTS referral_rewards_referrer_timeline
  ON referral_rewards (referrer_discord_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS referral_events (
  id uuid PRIMARY KEY,
  referral_reward_id uuid REFERENCES referral_rewards (id),
  event_type text NOT NULL,
  actor_type text NOT NULL,
  actor_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS referral_auth_sessions (
  token_hash text PRIMARY KEY,
  discord_user_id text NOT NULL REFERENCES referral_profiles (discord_user_id),
  contact_email text NOT NULL,
  display_name text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS referral_events_reward_timeline
  ON referral_events (referral_reward_id, occurred_at DESC);

ALTER TABLE referral_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_auth_sessions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON referral_profiles FROM anon, authenticated;
REVOKE ALL ON referral_rewards FROM anon, authenticated;
REVOKE ALL ON referral_events FROM anon, authenticated;
REVOKE ALL ON referral_auth_sessions FROM anon, authenticated;

INSERT INTO pick_operations_schema_migrations (version, applied_at)
VALUES ('005_referral_cash_rewards', NOW())
ON CONFLICT (version) DO NOTHING;
