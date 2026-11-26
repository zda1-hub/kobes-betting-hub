CREATE TABLE IF NOT EXISTS discord_member_snapshots (
  date TEXT PRIMARY KEY,
  member_count INT,
  presence_count INT,
  taken_at TEXT
);

CREATE TABLE IF NOT EXISTS discord_invite_snapshots (
  date TEXT,
  invite_code TEXT,
  uses INT,
  label TEXT,
  channel_label TEXT,
  PRIMARY KEY(date, invite_code)
);

CREATE TABLE IF NOT EXISTS discord_joins (
  user_id TEXT,
  joined_at TEXT,
  invite_code TEXT NULL,
  left_at TEXT NULL,
  paid_role_at TEXT NULL,
  PRIMARY KEY(user_id, joined_at)
);
