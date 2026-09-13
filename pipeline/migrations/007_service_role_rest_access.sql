-- The Worker uses a Supabase secret key through PostgREST. RLS bypass alone does
-- not confer table privileges, so grant only the DML operations the backend uses.
GRANT USAGE ON SCHEMA public TO service_role;

GRANT SELECT, INSERT, UPDATE ON
  source_posts,
  extraction_runs,
  pick_candidates,
  workflow_events,
  approval_cards,
  published_picks,
  grades,
  recap_runs,
  membership_customers,
  membership_subscriptions,
  stripe_webhook_events,
  membership_events,
  api_call_events,
  provider_usage_snapshots,
  referral_profiles,
  referral_rewards,
  referral_events,
  referral_auth_sessions
TO service_role;

GRANT SELECT ON pick_operations_schema_migrations TO service_role;

REVOKE ALL ON
  source_posts,
  extraction_runs,
  pick_candidates,
  workflow_events,
  approval_cards,
  published_picks,
  grades,
  recap_runs,
  membership_customers,
  membership_subscriptions,
  stripe_webhook_events,
  membership_events,
  api_call_events,
  provider_usage_snapshots,
  referral_profiles,
  referral_rewards,
  referral_events,
  referral_auth_sessions,
  pick_operations_schema_migrations
FROM anon, authenticated;

INSERT INTO pick_operations_schema_migrations (version, applied_at)
VALUES ('007_service_role_rest_access', NOW())
ON CONFLICT (version) DO NOTHING;
