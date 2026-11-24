-- Paid VIP progress is distinct from qualified referral tiers. These rows are
-- private source data; public names require explicit /wallshow opt-in.
CREATE TABLE IF NOT EXISTS wall_paid_vips (
  customer_id TEXT PRIMARY KEY,
  discord_id TEXT,
  display_name TEXT,
  first_paid_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS wall_paid_vip_optin (
  user_id TEXT PRIMARY KEY,
  opted_in_at TEXT NOT NULL
);
