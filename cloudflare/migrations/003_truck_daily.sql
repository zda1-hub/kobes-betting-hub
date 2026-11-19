-- Last observed verified spot count per Phoenix date. No historical backfill.
CREATE TABLE IF NOT EXISTS wall_spot_daily (
  day TEXT PRIMARY KEY,
  spot INTEGER NOT NULL,
  observed_at TEXT NOT NULL
);
