CREATE TABLE IF NOT EXISTS source_posts (
  id uuid PRIMARY KEY,
  platform text NOT NULL,
  external_post_id text NOT NULL,
  source_handle text NOT NULL,
  post_url text,
  posted_at timestamptz,
  raw_text text NOT NULL DEFAULT '',
  media_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  media_url_hashes jsonb NOT NULL DEFAULT '[]'::jsonb,
  first_seen_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  UNIQUE (platform, external_post_id)
);

CREATE TABLE IF NOT EXISTS pick_operations_schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL
);

ALTER TABLE source_posts ADD COLUMN IF NOT EXISTS media_url_hashes jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS extraction_runs (
  id uuid PRIMARY KEY,
  source_post_id uuid NOT NULL REFERENCES source_posts(id),
  provider text NOT NULL,
  model text NOT NULL,
  prompt_version text NOT NULL,
  code_commit text,
  input_sha256 text NOT NULL,
  request_id text,
  provider_response_id text,
  started_at timestamptz NOT NULL,
  completed_at timestamptz,
  latency_ms integer,
  response_status integer,
  input_tokens integer,
  cached_input_tokens integer,
  image_tokens integer,
  output_tokens integer,
  image_count integer NOT NULL DEFAULT 0,
  image_detail text,
  estimated_cost_usd numeric(14, 8),
  cost_basis text,
  status text NOT NULL,
  error_code text,
  error_detail text,
  raw_structured_output jsonb,
  created_at timestamptz NOT NULL
);

ALTER TABLE extraction_runs ADD COLUMN IF NOT EXISTS provider_response_id text;

CREATE INDEX IF NOT EXISTS extraction_runs_source_lookup
  ON extraction_runs (source_post_id, prompt_version, model, status, completed_at DESC);

CREATE TABLE IF NOT EXISTS pick_candidates (
  id uuid PRIMARY KEY,
  source_post_id uuid NOT NULL REFERENCES source_posts(id),
  extraction_run_id uuid REFERENCES extraction_runs(id),
  candidate_key text NOT NULL,
  extraction_version text NOT NULL,
  status text NOT NULL,
  rejection_codes text[] NOT NULL DEFAULT '{}',
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE (source_post_id, candidate_key, extraction_version)
);

CREATE TABLE IF NOT EXISTS workflow_events (
  id uuid PRIMARY KEY,
  source_post_id uuid REFERENCES source_posts(id),
  candidate_id uuid REFERENCES pick_candidates(id),
  event_type text NOT NULL,
  actor_type text NOT NULL,
  actor_id text,
  before_state text,
  after_state text,
  code_commit text,
  prompt_version text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS workflow_events_candidate_timeline
  ON workflow_events (candidate_id, occurred_at);

CREATE TABLE IF NOT EXISTS approval_cards (
  id uuid PRIMARY KEY,
  candidate_id uuid NOT NULL REFERENCES pick_candidates(id),
  discord_channel_id text NOT NULL,
  discord_message_id text NOT NULL,
  rendered_payload jsonb NOT NULL,
  rendered_payload_sha256 text NOT NULL,
  status text NOT NULL,
  action text,
  action_actor_id text,
  action_at timestamptz,
  created_at timestamptz NOT NULL,
  UNIQUE (discord_channel_id, discord_message_id)
);

CREATE TABLE IF NOT EXISTS published_picks (
  id uuid PRIMARY KEY,
  candidate_id uuid REFERENCES pick_candidates(id),
  pick_id text NOT NULL UNIQUE,
  discord_channel_id text,
  discord_message_id text,
  post_reference text,
  ledger_entry jsonb NOT NULL DEFAULT '{}'::jsonb,
  exact_payload jsonb NOT NULL,
  exact_payload_sha256 text NOT NULL,
  status text NOT NULL,
  error_detail text,
  published_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

ALTER TABLE published_picks ADD COLUMN IF NOT EXISTS ledger_entry jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS grades (
  id uuid PRIMARY KEY,
  published_pick_id uuid NOT NULL REFERENCES published_picks(id),
  result text,
  status text NOT NULL,
  provider text,
  source_reference text,
  source_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_type text NOT NULL,
  actor_id text,
  error_detail text,
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS recap_runs (
  id uuid PRIMARY KEY,
  operating_date date NOT NULL,
  recap_type text NOT NULL,
  included_pick_ids text[] NOT NULL DEFAULT '{}',
  status text NOT NULL,
  recipient text,
  provider_message_id text,
  content_sha256 text,
  error_detail text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL
);

INSERT INTO pick_operations_schema_migrations (version, applied_at)
VALUES ('001_pick_operations_audit', NOW())
ON CONFLICT (version) DO NOTHING;
