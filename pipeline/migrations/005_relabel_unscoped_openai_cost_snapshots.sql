-- Preserve the first organization-wide cost import as historical evidence.
-- New reconciliations are filtered and grouped by API key, so leaving these
-- keyless rows under the current source label would make them look equivalent.
UPDATE provider_usage_snapshots
SET source = 'openai_costs_api_unscoped'
WHERE provider = 'openai'
  AND source = 'openai_costs_api'
  AND api_key_reference IS NULL;

INSERT INTO pick_operations_schema_migrations (version, applied_at)
VALUES ('005_relabel_unscoped_openai_cost_snapshots', NOW())
ON CONFLICT (version) DO NOTHING;
