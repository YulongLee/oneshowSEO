-- description: Add organization-owned scoped developer credentials with expiry, rotation, usage metadata, policy, and immutable audit
-- rollback: Revoke all developer credentials, export redacted key metadata, then drop the additive developer schema
-- minimum-app-version: 0.1.0
CREATE SCHEMA IF NOT EXISTS developer;
CREATE TABLE developer.api_keys(
 id text PRIMARY KEY,
 organization_id text NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,
 name text NOT NULL,
 key_prefix text NOT NULL UNIQUE,
 secret_hash text NOT NULL UNIQUE CHECK(secret_hash ~ '^[a-f0-9]{64}$'),
 status text NOT NULL CHECK(status IN('active','revoked')),
 scopes jsonb NOT NULL CHECK(jsonb_typeof(scopes)='array'),
 project_scopes jsonb NOT NULL CHECK(project_scopes='"*"'::jsonb OR jsonb_typeof(project_scopes)='array'),
 expires_at timestamptz,
 last_used_at timestamptz,
 rotated_from_id text REFERENCES developer.api_keys(id) ON DELETE SET NULL,
 created_by_account_id text NOT NULL REFERENCES identity.accounts(id) ON DELETE RESTRICT,
 rate_limit_policy jsonb NOT NULL CHECK(jsonb_typeof(rate_limit_policy)='object'),
 created_at timestamptz NOT NULL DEFAULT now(),
 revoked_at timestamptz,
 CHECK(expires_at IS NULL OR expires_at>created_at),
 CHECK((status='active' AND revoked_at IS NULL) OR (status='revoked' AND revoked_at IS NOT NULL))
);
CREATE INDEX developer_api_keys_org_state_idx ON developer.api_keys(organization_id,status,expires_at,created_at);
CREATE TABLE developer.api_key_events(
 id text PRIMARY KEY,
 organization_id text NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,
 key_id text NOT NULL REFERENCES developer.api_keys(id) ON DELETE RESTRICT,
 actor_account_id text NOT NULL REFERENCES identity.accounts(id) ON DELETE RESTRICT,
 action text NOT NULL CHECK(action IN('created','rotated','revoked')),
 metadata jsonb NOT NULL CHECK(jsonb_typeof(metadata)='object'),
 correlation_id text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION developer.reject_key_event_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'API_KEY_EVENTS_APPEND_ONLY';END $$;
CREATE TRIGGER developer_key_event_no_mutation BEFORE UPDATE OR DELETE ON developer.api_key_events FOR EACH ROW EXECUTE FUNCTION developer.reject_key_event_mutation();
CREATE INDEX developer_key_events_org_idx ON developer.api_key_events(organization_id,created_at,id);
DO $p$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='oneshowseo_app')THEN
  GRANT USAGE ON SCHEMA developer TO oneshowseo_app;
  GRANT SELECT,INSERT,UPDATE ON developer.api_keys TO oneshowseo_app;
  GRANT SELECT,INSERT ON developer.api_key_events TO oneshowseo_app;
  REVOKE DELETE ON ALL TABLES IN SCHEMA developer FROM oneshowseo_app;
 END IF;
END $p$;
