-- description: Add notification preferences and auditable delivery attempts
-- rollback: Export notification preference and delivery evidence before dropping these additive tables
-- minimum-app-version: 0.1.0

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE operations.notification_preferences (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,
  account_id text NOT NULL REFERENCES identity.accounts(id) ON DELETE CASCADE,
  notification_type text NOT NULL,
  in_app_enabled boolean NOT NULL DEFAULT true,
  email_enabled boolean NOT NULL DEFAULT true,
  locale text NOT NULL CHECK (locale IN ('zh-CN','en')),
  version integer NOT NULL DEFAULT 1 CHECK (version>0),
  created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,account_id,notification_type)
);
CREATE INDEX notification_preferences_account_idx ON operations.notification_preferences (organization_id,account_id,notification_type);

CREATE TABLE operations.notification_deliveries (
  id text PRIMARY KEY,
  notification_id text NOT NULL REFERENCES operations.notifications(id) ON DELETE CASCADE,
  organization_id text NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,
  account_id text NOT NULL REFERENCES identity.accounts(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('in_app','email')),
  attempt_number integer NOT NULL CHECK (attempt_number>0),
  state text NOT NULL CHECK (state IN ('delivering','sent','retrying','failed','quarantined')),
  provider_reference text,error_code text,error_message text,next_attempt_at timestamptz,
  started_at timestamptz NOT NULL DEFAULT now(),finished_at timestamptz,correlation_id text NOT NULL,
  UNIQUE (notification_id,attempt_number)
);
CREATE INDEX notification_deliveries_retry_idx ON operations.notification_deliveries (state,next_attempt_at,notification_id);

DO $permissions$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='oneshowseo_app') THEN
    GRANT SELECT,INSERT,UPDATE,DELETE ON operations.notification_preferences,operations.notification_deliveries TO oneshowseo_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='oneshowseo_worker') THEN
    GRANT SELECT,INSERT,UPDATE,DELETE ON operations.notification_preferences,operations.notification_deliveries TO oneshowseo_worker;
  END IF;
END $permissions$;
