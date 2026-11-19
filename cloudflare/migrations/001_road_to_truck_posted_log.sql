CREATE TABLE IF NOT EXISTS posted_log (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL CHECK (platform IN ('x','discord')),
  post_id TEXT,
  posted_at TEXT,
  status TEXT NOT NULL DEFAULT 'claimed',
  reply_post_id TEXT,
  detail TEXT,
  claimed_at TEXT NOT NULL
);
