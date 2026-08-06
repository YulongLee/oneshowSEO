-- description: Add durable execution tasks, jobs, attempts, leases, progress, cancellation, idempotency, messaging, artifacts, and notifications
-- rollback: Pre-cutover only: export execution and notification evidence, then drop the execution schema and operations.notifications after confirming no jobs are active
-- minimum-app-version: 0.1.0

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Execution audit writes reuse the append-only operations.audit_events table created by migration 0001.

CREATE SCHEMA IF NOT EXISTS execution;
CREATE UNIQUE INDEX projects_organization_id_uq ON project_governance.projects (organization_id, id);

CREATE TABLE execution.tasks (
  id text PRIMARY KEY,organization_id text NOT NULL REFERENCES identity.organizations(id) ON DELETE RESTRICT,project_id text NOT NULL,requested_by_account_id text REFERENCES identity.accounts(id) ON DELETE SET NULL,
  trigger_type text NOT NULL CHECK (trigger_type IN ('manual','scheduled','api','mcp','approval','agent','system')),task_type text NOT NULL,capability text NOT NULL,
  state text NOT NULL CHECK (state IN ('queued','running','retrying','waiting_approval','completed','failed','cancelled','quarantined')),progress integer NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),cancellable boolean NOT NULL DEFAULT true,
  input jsonb NOT NULL CHECK (jsonb_typeof(input)='object'),locale text NOT NULL CHECK (locale IN ('zh-CN','en')),idempotency_key text NOT NULL,correlation_id text NOT NULL,version bigint NOT NULL DEFAULT 1 CHECK (version>0),
  created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),started_at timestamptz,completed_at timestamptz,
  UNIQUE (organization_id,id),UNIQUE (organization_id,project_id,id),UNIQUE (organization_id,idempotency_key),FOREIGN KEY (organization_id,project_id) REFERENCES project_governance.projects(organization_id,id) ON DELETE RESTRICT,
  CHECK (completed_at IS NULL OR state IN ('completed','failed','cancelled','quarantined'))
);
CREATE INDEX tasks_org_project_state_idx ON execution.tasks (organization_id,project_id,state,updated_at DESC,id DESC);
CREATE INDEX tasks_correlation_idx ON execution.tasks (correlation_id);

CREATE TABLE execution.jobs (
  id text PRIMARY KEY,organization_id text NOT NULL REFERENCES identity.organizations(id) ON DELETE RESTRICT,project_id text NOT NULL,task_id text NOT NULL,queue text NOT NULL,job_type text NOT NULL,
  state text NOT NULL CHECK (state IN ('queued','running','retrying','completed','failed','cancelled','quarantined')),priority integer NOT NULL DEFAULT 50 CHECK (priority BETWEEN 0 AND 100),available_at timestamptz NOT NULL,
  max_attempts integer NOT NULL CHECK (max_attempts BETWEEN 1 AND 100),timeout_seconds integer NOT NULL CHECK (timeout_seconds BETWEEN 1 AND 86400),attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count>=0),
  idempotency_key text NOT NULL,correlation_id text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz,
  UNIQUE (organization_id,id),UNIQUE (organization_id,idempotency_key),FOREIGN KEY (organization_id,project_id) REFERENCES project_governance.projects(organization_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id,project_id,task_id) REFERENCES execution.tasks(organization_id,project_id,id) ON DELETE RESTRICT
);
CREATE INDEX jobs_claim_idx ON execution.jobs (queue,state,available_at,priority DESC,created_at,id);
CREATE INDEX jobs_org_task_idx ON execution.jobs (organization_id,task_id,created_at,id);

CREATE TABLE execution.job_attempts (
  id text PRIMARY KEY,organization_id text NOT NULL REFERENCES identity.organizations(id) ON DELETE RESTRICT,job_id text NOT NULL,task_id text NOT NULL,attempt_number integer NOT NULL CHECK (attempt_number>0),worker_id text NOT NULL,
  state text NOT NULL CHECK (state IN ('running','succeeded','failed','cancelled','timed_out')),started_at timestamptz NOT NULL DEFAULT now(),finished_at timestamptz,error_code text,error_message text,retry_at timestamptz,correlation_id text NOT NULL,
  UNIQUE (organization_id,id),UNIQUE (job_id,attempt_number),FOREIGN KEY (organization_id,job_id) REFERENCES execution.jobs(organization_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id,task_id) REFERENCES execution.tasks(organization_id,id) ON DELETE RESTRICT,CHECK ((state='running')=(finished_at IS NULL))
);
CREATE INDEX attempts_org_job_idx ON execution.job_attempts (organization_id,job_id,attempt_number DESC);

CREATE TABLE execution.job_leases (
  id text PRIMARY KEY,organization_id text NOT NULL REFERENCES identity.organizations(id) ON DELETE RESTRICT,job_id text NOT NULL,attempt_id text NOT NULL,worker_id text NOT NULL,token_hash text NOT NULL CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  state text NOT NULL CHECK (state IN ('active','released','expired')),acquired_at timestamptz NOT NULL DEFAULT now(),heartbeat_at timestamptz NOT NULL,expires_at timestamptz NOT NULL,released_at timestamptz,version bigint NOT NULL DEFAULT 1 CHECK (version>0),
  FOREIGN KEY (organization_id,job_id) REFERENCES execution.jobs(organization_id,id) ON DELETE RESTRICT,FOREIGN KEY (organization_id,attempt_id) REFERENCES execution.job_attempts(organization_id,id) ON DELETE RESTRICT,
  CHECK (expires_at>acquired_at),CHECK ((state='active' AND released_at IS NULL) OR (state='released' AND released_at IS NOT NULL) OR state='expired')
);
CREATE UNIQUE INDEX leases_active_job_idx ON execution.job_leases (job_id) WHERE state='active';
CREATE INDEX leases_expiry_idx ON execution.job_leases (state,expires_at,job_id);

CREATE TABLE execution.progress_events (
  id text PRIMARY KEY,organization_id text NOT NULL REFERENCES identity.organizations(id) ON DELETE RESTRICT,project_id text NOT NULL,task_id text NOT NULL,attempt_id text,
  sequence bigint NOT NULL CHECK (sequence>0),progress integer NOT NULL CHECK (progress BETWEEN 0 AND 100),stage text NOT NULL,message_key text,metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata)='object'),correlation_id text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_id,sequence),FOREIGN KEY (organization_id,project_id) REFERENCES project_governance.projects(organization_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id,project_id,task_id) REFERENCES execution.tasks(organization_id,project_id,id) ON DELETE RESTRICT,FOREIGN KEY (organization_id,attempt_id) REFERENCES execution.job_attempts(organization_id,id) ON DELETE RESTRICT
);
CREATE INDEX progress_org_task_idx ON execution.progress_events (organization_id,task_id,sequence DESC);

CREATE TABLE execution.cancellations (
  id text PRIMARY KEY,organization_id text NOT NULL REFERENCES identity.organizations(id) ON DELETE RESTRICT,project_id text NOT NULL,task_id text NOT NULL,requested_by_account_id text REFERENCES identity.accounts(id) ON DELETE SET NULL,
  state text NOT NULL CHECK (state IN ('requested','acknowledged','completed','rejected')),reason text NOT NULL,idempotency_key text NOT NULL,correlation_id text NOT NULL,requested_at timestamptz NOT NULL DEFAULT now(),acknowledged_at timestamptz,completed_at timestamptz,
  UNIQUE (task_id),UNIQUE (organization_id,idempotency_key),FOREIGN KEY (organization_id,project_id) REFERENCES project_governance.projects(organization_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id,project_id,task_id) REFERENCES execution.tasks(organization_id,project_id,id) ON DELETE RESTRICT
);
CREATE INDEX cancellations_pending_idx ON execution.cancellations (organization_id,state,requested_at,task_id);

CREATE TABLE execution.idempotency_keys (
  id text PRIMARY KEY,organization_id text NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,scope text NOT NULL,idempotency_key text NOT NULL,request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  resource_type text NOT NULL,resource_id text NOT NULL,response_status integer,response jsonb CHECK (response IS NULL OR jsonb_typeof(response)='object'),expires_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,scope,idempotency_key)
);
CREATE INDEX idempotency_expiry_idx ON execution.idempotency_keys (expires_at) WHERE expires_at IS NOT NULL;

CREATE TABLE execution.outbox (
  id text PRIMARY KEY,organization_id text REFERENCES identity.organizations(id) ON DELETE RESTRICT,project_id text REFERENCES project_governance.projects(id) ON DELETE RESTRICT,aggregate_type text NOT NULL,aggregate_id text NOT NULL,event_type text NOT NULL,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),state text NOT NULL CHECK (state IN ('pending','published','failed')),attempts integer NOT NULL DEFAULT 0 CHECK (attempts>=0),available_at timestamptz NOT NULL,published_at timestamptz,last_error text,
  idempotency_key text NOT NULL,correlation_id text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE NULLS NOT DISTINCT (organization_id,idempotency_key),CHECK ((state='published')=(published_at IS NOT NULL))
);
CREATE INDEX outbox_delivery_idx ON execution.outbox (state,available_at,created_at,id);

CREATE TABLE execution.inbox (
  id text PRIMARY KEY,organization_id text REFERENCES identity.organizations(id) ON DELETE RESTRICT,source text NOT NULL,message_id text NOT NULL,message_type text NOT NULL,payload_hash text NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),state text NOT NULL CHECK (state IN ('received','processed','failed')),received_at timestamptz NOT NULL DEFAULT now(),processed_at timestamptz,last_error text,correlation_id text NOT NULL,UNIQUE (source,message_id),CHECK ((state='processed')=(processed_at IS NOT NULL))
);
CREATE INDEX inbox_state_idx ON execution.inbox (state,received_at,id);

CREATE TABLE execution.artifacts (
  id text PRIMARY KEY,organization_id text NOT NULL REFERENCES identity.organizations(id) ON DELETE RESTRICT,project_id text NOT NULL,task_id text NOT NULL,attempt_id text,kind text NOT NULL,object_key text NOT NULL UNIQUE,
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),mime_type text NOT NULL,size_bytes bigint NOT NULL CHECK (size_bytes>=0),scan_state text NOT NULL CHECK (scan_state IN ('pending','clean','blocked','failed')),retention_class text NOT NULL,expires_at timestamptz,
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(provenance)='object'),idempotency_key text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE (organization_id,idempotency_key),
  FOREIGN KEY (organization_id,project_id) REFERENCES project_governance.projects(organization_id,id) ON DELETE RESTRICT,FOREIGN KEY (organization_id,project_id,task_id) REFERENCES execution.tasks(organization_id,project_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id,attempt_id) REFERENCES execution.job_attempts(organization_id,id) ON DELETE RESTRICT
);
CREATE INDEX artifacts_org_project_task_idx ON execution.artifacts (organization_id,project_id,task_id,created_at DESC,id);
CREATE INDEX artifacts_expiry_idx ON execution.artifacts (expires_at) WHERE expires_at IS NOT NULL;

CREATE TABLE operations.notifications (
  id text PRIMARY KEY,organization_id text NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,account_id text NOT NULL REFERENCES identity.accounts(id) ON DELETE CASCADE,project_id text,task_id text,
  channel text NOT NULL CHECK (channel IN ('in_app','email')),notification_type text NOT NULL,locale text NOT NULL CHECK (locale IN ('zh-CN','en')),title_key text NOT NULL,body_key text NOT NULL,arguments jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(arguments)='object'),
  state text NOT NULL CHECK (state IN ('pending','sent','failed','read','cancelled')),idempotency_key text NOT NULL,available_at timestamptz NOT NULL,sent_at timestamptz,read_at timestamptz,last_error text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,channel,idempotency_key),CHECK (task_id IS NULL OR project_id IS NOT NULL),FOREIGN KEY (organization_id,project_id) REFERENCES project_governance.projects(organization_id,id) ON DELETE CASCADE,FOREIGN KEY (organization_id,project_id,task_id) REFERENCES execution.tasks(organization_id,project_id,id) ON DELETE RESTRICT
);
CREATE INDEX notifications_account_state_idx ON operations.notifications (organization_id,account_id,state,created_at DESC,id);

ALTER TABLE operations.audit_events
  ADD CONSTRAINT audit_events_organization_project_fk FOREIGN KEY (organization_id,project_id)
  REFERENCES project_governance.projects(organization_id,id) ON DELETE RESTRICT NOT VALID;

DO $permissions$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='oneshowseo_app') THEN
    GRANT USAGE ON SCHEMA execution TO oneshowseo_app;
    GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA execution TO oneshowseo_app;
    GRANT SELECT,INSERT,UPDATE,DELETE ON operations.notifications TO oneshowseo_app;
    ALTER DEFAULT PRIVILEGES FOR ROLE oneshowseo_migrator IN SCHEMA execution GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO oneshowseo_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='oneshowseo_worker') THEN
    GRANT USAGE ON SCHEMA execution TO oneshowseo_worker;
    GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA execution TO oneshowseo_worker;
    GRANT SELECT,INSERT,UPDATE,DELETE ON operations.notifications TO oneshowseo_worker;
    ALTER DEFAULT PRIVILEGES FOR ROLE oneshowseo_migrator IN SCHEMA execution GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO oneshowseo_worker;
  END IF;
END
$permissions$;
