ALTER TABLE source_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE pick_operations_schema_migrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE extraction_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE pick_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE published_picks ENABLE ROW LEVEL SECURITY;
ALTER TABLE grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE recap_runs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON source_posts FROM anon, authenticated;
REVOKE ALL ON pick_operations_schema_migrations FROM anon, authenticated;
REVOKE ALL ON extraction_runs FROM anon, authenticated;
REVOKE ALL ON pick_candidates FROM anon, authenticated;
REVOKE ALL ON workflow_events FROM anon, authenticated;
REVOKE ALL ON approval_cards FROM anon, authenticated;
REVOKE ALL ON published_picks FROM anon, authenticated;
REVOKE ALL ON grades FROM anon, authenticated;
REVOKE ALL ON recap_runs FROM anon, authenticated;

INSERT INTO pick_operations_schema_migrations (version, applied_at)
VALUES ('003_audit_table_security', NOW())
ON CONFLICT (version) DO NOTHING;
