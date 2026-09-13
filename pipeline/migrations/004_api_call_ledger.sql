CREATE TABLE IF NOT EXISTS api_call_events (
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
  request_payload_sha256 text,
  response_payload_sha256 text,
  response_status integer,
  outcome text NOT NULL,
  error_class text,
  retry_count integer NOT NULL DEFAULT 0,
  latency_ms integer,
  code_commit text,
  occurred_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS api_call_events_service_time
  ON api_call_events (service, occurred_at DESC);

CREATE INDEX IF NOT EXISTS api_call_events_workflow_time
  ON api_call_events (workflow_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS provider_usage_snapshots (
  id uuid PRIMARY KEY,
  provider text NOT NULL,
  account_reference text,
  project_reference text,
  api_key_reference text,
  model text,
  window_start timestamptz NOT NULL,
  window_end timestamptz NOT NULL,
  request_count integer,
  input_tokens bigint,
  cached_input_tokens bigint,
  output_tokens bigint,
  provider_cost_usd numeric(14, 8),
  source text NOT NULL,
  payload_sha256 text,
  imported_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS provider_usage_snapshots_lookup
  ON provider_usage_snapshots (provider, window_start, project_reference, model);

ALTER TABLE api_call_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_usage_snapshots ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON api_call_events FROM anon, authenticated;
REVOKE ALL ON provider_usage_snapshots FROM anon, authenticated;

INSERT INTO pick_operations_schema_migrations (version, applied_at)
VALUES ('004_api_call_ledger', NOW())
ON CONFLICT (version) DO NOTHING;
