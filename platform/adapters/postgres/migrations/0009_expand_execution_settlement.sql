-- description: Add tenant-scoped idempotent external-effect evidence for terminal task settlement
-- rollback: Pre-cutover only: export unresolved external-effect evidence, then drop execution.external_effects after confirming no task settlement references remain
-- minimum-app-version: 0.1.0

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE execution.external_effects (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES identity.organizations(id) ON DELETE RESTRICT,
  project_id text NOT NULL,
  task_id text NOT NULL,
  attempt_id text,
  provider text NOT NULL,
  operation text NOT NULL,
  external_reference text,
  request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  state text NOT NULL CHECK (state IN ('pending','succeeded','failed','unknown')),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(evidence) = 'object'),
  error_code text,
  idempotency_key text NOT NULL,
  correlation_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,provider,idempotency_key),
  FOREIGN KEY (organization_id,project_id) REFERENCES project_governance.projects(organization_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id,project_id,task_id) REFERENCES execution.tasks(organization_id,project_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id,attempt_id) REFERENCES execution.job_attempts(organization_id,id) ON DELETE RESTRICT
);
CREATE INDEX external_effects_task_idx ON execution.external_effects (organization_id,project_id,task_id,created_at,id);
CREATE INDEX external_effects_unknown_idx ON execution.external_effects (state,updated_at,id) WHERE state IN ('pending','unknown');

DO $permissions$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='oneshowseo_app') THEN
    GRANT SELECT,INSERT,UPDATE ON execution.external_effects TO oneshowseo_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='oneshowseo_worker') THEN
    GRANT SELECT,INSERT,UPDATE ON execution.external_effects TO oneshowseo_worker;
  END IF;
END
$permissions$;
