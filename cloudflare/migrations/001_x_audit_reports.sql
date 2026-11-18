CREATE TABLE IF NOT EXISTS x_audit_reports (
  id TEXT PRIMARY KEY,
  week_start TEXT NOT NULL UNIQUE,
  json TEXT NOT NULL,
  markdown TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_x_audit_reports_week_start ON x_audit_reports (week_start DESC);
