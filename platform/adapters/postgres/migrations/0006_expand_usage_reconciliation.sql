-- description: Add immutable organization usage reconciliation snapshots and alert evidence
-- rollback: Pre-cutover only: export reconciliation evidence, then drop commerce.usage_reconciliations
-- minimum-app-version: 0.1.0

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE commerce.usage_reconciliations (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  catalog_version text NOT NULL,
  status text NOT NULL CHECK (status IN ('ok', 'attention')),
  usage_event_count bigint NOT NULL CHECK (usage_event_count >= 0),
  stale_pending_count bigint NOT NULL CHECK (stale_pending_count >= 0),
  inconsistent_state_count bigint NOT NULL CHECK (inconsistent_state_count >= 0),
  over_limit_metric_count bigint NOT NULL CHECK (over_limit_metric_count >= 0),
  credit_imbalance boolean NOT NULL DEFAULT false,
  summary jsonb NOT NULL CHECK (jsonb_typeof(summary) = 'array'),
  correlation_id text NOT NULL,
  actor_account_id text REFERENCES identity.accounts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (period_end >= period_start)
);

CREATE INDEX usage_reconciliations_organization_time_idx
  ON commerce.usage_reconciliations (organization_id, created_at DESC, id DESC);

DO $permissions$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oneshowseo_app') THEN
    GRANT SELECT, INSERT ON commerce.usage_reconciliations TO oneshowseo_app;
  END IF;
END
$permissions$;
