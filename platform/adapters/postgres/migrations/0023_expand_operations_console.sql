-- description: Add scoped incident records used by the real operator console and correlation search
-- rollback: Export unresolved incident evidence, disable incident mutation endpoints, then drop the incident table
-- minimum-app-version: 0.1.0
CREATE TABLE operations.incidents(id text PRIMARY KEY,severity text NOT NULL CHECK(severity IN('low','medium','high','critical')),state text NOT NULL CHECK(state IN('open','investigating','monitoring','resolved')),title text NOT NULL,organization_id text REFERENCES identity.organizations(id) ON DELETE RESTRICT,correlation_id text NOT NULL,owner_account_id text REFERENCES identity.accounts(id) ON DELETE SET NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),resolved_at timestamptz);
CREATE INDEX incidents_state_idx ON operations.incidents(state,severity,updated_at DESC);
CREATE INDEX incidents_correlation_idx ON operations.incidents(correlation_id,updated_at DESC);
DO $p$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='oneshowseo_app')THEN GRANT SELECT,INSERT,UPDATE ON operations.incidents TO oneshowseo_app;REVOKE DELETE ON operations.incidents FROM oneshowseo_app;END IF;END $p$;
