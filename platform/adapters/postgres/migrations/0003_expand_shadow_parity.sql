-- description: Add immutable staging shadow-read parity snapshots and metrics
-- rollback: Pre-cutover only: archive parity evidence, then drop public.platform_shadow_metrics and public.platform_shadow_snapshots
-- minimum-app-version: 0.1.0

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE public.platform_shadow_snapshots (
  id text PRIMARY KEY,
  source_snapshot_hash text NOT NULL UNIQUE,
  source_label text NOT NULL,
  status text NOT NULL CHECK (status IN ('capturing', 'complete', 'failed')),
  captured_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  error_class text
);

CREATE TABLE public.platform_shadow_metrics (
  snapshot_id text NOT NULL REFERENCES public.platform_shadow_snapshots(id) ON DELETE RESTRICT,
  category text NOT NULL CHECK (category IN ('authentication', 'users', 'projects', 'tasks', 'findings', 'research', 'approvals', 'usage', 'billing', 'api_access')),
  source_table text NOT NULL,
  row_count integer NOT NULL CHECK (row_count >= 0),
  row_hash text NOT NULL,
  PRIMARY KEY (snapshot_id, category, source_table)
);
CREATE INDEX platform_shadow_metrics_category_idx
  ON public.platform_shadow_metrics (category, snapshot_id);
