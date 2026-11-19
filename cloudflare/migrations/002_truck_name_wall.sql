-- This schema is intentionally empty at migration time. Activation creates the
-- start timestamp; no historical referrals or subscriptions are imported.
CREATE TABLE IF NOT EXISTS name_wall_state (
  id INTEGER PRIMARY KEY CHECK (id = 1), started_at TEXT NOT NULL,
  active_paid_spots INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS referral_tiers (
  user_id TEXT PRIMARY KEY, discord_id TEXT NOT NULL, display_name TEXT NOT NULL,
  qualified_count INTEGER NOT NULL DEFAULT 0, tier TEXT NOT NULL DEFAULT 'none',
  name_set_at TEXT, joined_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tier_events (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, from_tier TEXT NOT NULL,
  to_tier TEXT NOT NULL, reason TEXT NOT NULL, created_at TEXT NOT NULL,
  notified_at TEXT
);
CREATE TABLE IF NOT EXISTS name_wall_optout (
  user_id TEXT PRIMARY KEY
);
CREATE TABLE IF NOT EXISTS wall_referrals (
  customer_id TEXT PRIMARY KEY, subscription_id TEXT NOT NULL,
  referrer_id TEXT NOT NULL, first_paid_at TEXT, second_paid_at TEXT,
  active INTEGER NOT NULL DEFAULT 0, canceled INTEGER NOT NULL DEFAULT 0,
  refunded INTEGER NOT NULL DEFAULT 0, disqualified INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS wall_hood_reservations (
  user_id TEXT PRIMARY KEY, reserved_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS wall_milestones (
  spot INTEGER PRIMARY KEY, claimed_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS wall_abuse_flags (
  id TEXT PRIMARY KEY, referrer_id TEXT NOT NULL, customer_id TEXT,
  reason TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS wall_setup_receipts (
  id TEXT PRIMARY KEY, value TEXT NOT NULL, created_at TEXT NOT NULL
);
