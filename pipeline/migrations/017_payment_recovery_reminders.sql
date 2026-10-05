ALTER TABLE member_lifecycle_outbox DROP CONSTRAINT IF EXISTS member_lifecycle_outbox_email_type_check;
ALTER TABLE member_lifecycle_outbox ADD CONSTRAINT member_lifecycle_outbox_email_type_check
  CHECK (email_type IN ('INCOMPLETE_ONBOARDING','INTRO_EXPIRING','PAYMENT_FAILED'));
ALTER TABLE member_lifecycle_outbox DROP CONSTRAINT IF EXISTS member_lifecycle_outbox_status_check;
ALTER TABLE member_lifecycle_outbox ADD CONSTRAINT member_lifecycle_outbox_status_check
  CHECK (status IN ('QUEUED','SEND_STARTED','DELIVERED','REVIEW_REQUIRED','CANCELLED'));

INSERT INTO pick_operations_schema_migrations (version, applied_at)
VALUES ('017_payment_recovery_reminders', now()) ON CONFLICT (version) DO NOTHING;
