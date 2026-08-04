-- description: Add resumable SQLite import runs, steps, and immutable reports
-- rollback: Pre-cutover only: archive reports, then drop public.platform_import_reports, public.platform_import_steps, and public.platform_import_runs
-- minimum-app-version: 0.1.0

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE identity.invitations
  ADD COLUMN IF NOT EXISTS project_scope jsonb NOT NULL DEFAULT '[]'::jsonb
  CHECK (jsonb_typeof(project_scope) = 'array');

ALTER TABLE operations.feature_flags
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

CREATE TABLE public.platform_import_runs (
  id text PRIMARY KEY,
  source_file_hash text NOT NULL,
  source_label text NOT NULL,
  status text NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  error_class text,
  UNIQUE (source_file_hash)
);

CREATE TABLE public.platform_import_steps (
  run_id text NOT NULL REFERENCES public.platform_import_runs(id) ON DELETE RESTRICT,
  step_key text NOT NULL,
  source_hash text NOT NULL,
  status text NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  source_rows integer NOT NULL CHECK (source_rows >= 0),
  target_rows integer,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  error_class text,
  PRIMARY KEY (run_id, step_key)
);

CREATE TABLE public.platform_import_reports (
  id text PRIMARY KEY,
  run_id text NOT NULL UNIQUE REFERENCES public.platform_import_runs(id) ON DELETE RESTRICT,
  report_hash text NOT NULL UNIQUE,
  report jsonb NOT NULL CHECK (jsonb_typeof(report) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);
