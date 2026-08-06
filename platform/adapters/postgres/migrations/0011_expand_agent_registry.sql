-- description: Add immutable Agent versions and tenant-scoped project Agent configuration
-- rollback: Export Agent manifests and project configuration history before dropping additive registry tables
-- minimum-app-version: 0.1.0
SET LOCAL lock_timeout = '5s';SET LOCAL statement_timeout = '60s';
CREATE SCHEMA IF NOT EXISTS agents;
CREATE TABLE agents.versions(id text PRIMARY KEY,agent_key text NOT NULL,version text NOT NULL,manifest jsonb NOT NULL CHECK(jsonb_typeof(manifest)='object'),digest text NOT NULL CHECK(digest ~ '^[0-9a-f]{64}$'),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(agent_key,version));
CREATE INDEX agent_versions_history_idx ON agents.versions(agent_key,created_at DESC,version);
CREATE FUNCTION agents.reject_version_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'AGENT_VERSION_IMMUTABLE'; END $$;
CREATE TRIGGER agent_versions_no_update BEFORE UPDATE OR DELETE ON agents.versions FOR EACH ROW EXECUTE FUNCTION agents.reject_version_mutation();
CREATE TABLE agents.project_agents(id text PRIMARY KEY,organization_id text NOT NULL,project_id text NOT NULL,agent_key text NOT NULL,agent_version text NOT NULL,enabled boolean NOT NULL DEFAULT false,configuration jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(configuration)='object'),revision integer NOT NULL CHECK(revision>0),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(organization_id,project_id,agent_key),FOREIGN KEY(organization_id,project_id) REFERENCES project_governance.projects(organization_id,id) ON DELETE CASCADE,FOREIGN KEY(agent_key,agent_version) REFERENCES agents.versions(agent_key,version) ON DELETE RESTRICT);
CREATE INDEX project_agents_project_idx ON agents.project_agents(organization_id,project_id,enabled,agent_key);
DO $permissions$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='oneshowseo_app') THEN GRANT USAGE ON SCHEMA agents TO oneshowseo_app;GRANT SELECT,INSERT ON agents.versions TO oneshowseo_app;GRANT SELECT,INSERT,UPDATE ON agents.project_agents TO oneshowseo_app;END IF;IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='oneshowseo_worker') THEN GRANT USAGE ON SCHEMA agents TO oneshowseo_worker;GRANT SELECT ON agents.versions,agents.project_agents TO oneshowseo_worker;END IF;END $permissions$;
