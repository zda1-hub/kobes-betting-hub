-- Record actual Discord member joins separately from website invite clicks.
ALTER TABLE analytics_events DROP CONSTRAINT IF EXISTS analytics_events_event_name_check;
ALTER TABLE analytics_events ADD CONSTRAINT analytics_events_event_name_check CHECK (event_name IN (
  'page_view','join_page_view','offer_selected','discord_connect_started','discord_verified',
  'discord_connect_failed','discord_join','checkout_started','payment_completed','vip_activated',
  'vip_activation_failed','subscription_started','subscription_renewed',
  'cancellation_scheduled','cancellation_completed','membership_expired','payment_failed',
  'starter_started','starter_expired','starter_upgraded','referral_visit','referral_checkout',
  'referral_conversion','refund','dispute','retention_offer_shown','retention_offer_accepted'
));

INSERT INTO pick_operations_schema_migrations (version, applied_at)
VALUES ('016_discord_join_attribution', now()) ON CONFLICT (version) DO NOTHING;
