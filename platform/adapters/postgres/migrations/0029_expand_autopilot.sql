-- description: Add daily evidence-first Autopilot configuration, runs, and durable step state
-- rollback: Disable all Autopilot configurations and retain run history for audit before removing orchestration tables
-- minimum-app-version: 0.1.0

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE agents.autopilot_configs (project_id text PRIMARY KEY REFERENCES projects.projects(id) ON DELETE CASCADE,organization_id text NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,enabled boolean NOT NULL DEFAULT false,cron text NOT NULL DEFAULT '0 3 * * *',timezone text NOT NULL DEFAULT 'Asia/Shanghai',daily_credit_limit integer NOT NULL DEFAULT 43 CHECK (daily_credit_limit BETWEEN 23 AND 500),content_enabled boolean NOT NULL DEFAULT true,paused_at timestamptz,next_run_at timestamptz,revision bigint NOT NULL DEFAULT 1,updated_by_account_id text REFERENCES identity.accounts(id) ON DELETE SET NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX autopilot_configs_due_idx ON agents.autopilot_configs(enabled,paused_at,next_run_at);
CREATE TABLE agents.autopilot_runs (id text PRIMARY KEY,organization_id text NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,project_id text NOT NULL REFERENCES projects.projects(id) ON DELETE CASCADE,scheduled_for timestamptz NOT NULL,status text NOT NULL CHECK(status IN('running','completed','partial','failed','paused')),credit_limit integer NOT NULL,credits_planned integer NOT NULL DEFAULT 0,credits_used integer NOT NULL DEFAULT 0,strategy_summary jsonb,started_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz,error_code text,UNIQUE(project_id,scheduled_for));
CREATE INDEX autopilot_runs_scope_idx ON agents.autopilot_runs(organization_id,project_id,started_at DESC);
CREATE TABLE agents.autopilot_steps (id text PRIMARY KEY,run_id text NOT NULL REFERENCES agents.autopilot_runs(id) ON DELETE CASCADE,stage text NOT NULL CHECK(stage IN('research','audit','content','geo','analytics')),position integer NOT NULL,task_id text REFERENCES execution.tasks(id) ON DELETE SET NULL,credit_cost integer NOT NULL,status text NOT NULL CHECK(status IN('pending','queued','completed','failed','skipped')),reason text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(run_id,stage));
CREATE INDEX autopilot_steps_run_idx ON agents.autopilot_steps(run_id,position);

DO $permissions$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oneshowseo_app') THEN
    GRANT SELECT,INSERT,UPDATE ON agents.autopilot_configs,agents.autopilot_runs,agents.autopilot_steps TO oneshowseo_app;
    REVOKE DELETE ON agents.autopilot_configs,agents.autopilot_runs,agents.autopilot_steps FROM oneshowseo_app;
  END IF;
END
$permissions$;
