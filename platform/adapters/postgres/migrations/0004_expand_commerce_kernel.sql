-- description: Add immutable plan catalog, subscriptions, idempotent usage metering, and reservation settlement guarantees
-- rollback: Pre-cutover only: archive commerce records, then drop commerce.usage_events, commerce.subscriptions, and commerce.plan_versions and remove the reservation terminal index
-- minimum-app-version: 0.1.0

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE commerce.plan_versions (
  plan_key text NOT NULL CHECK (plan_key IN ('trial', 'starter', 'pro', 'business')),
  catalog_version text NOT NULL,
  price_version text NOT NULL,
  currency text NOT NULL,
  monthly_price_cents bigint NOT NULL CHECK (monthly_price_cents >= 0),
  entitlements jsonb NOT NULL CHECK (jsonb_typeof(entitlements) = 'object'),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (plan_key, catalog_version, currency)
);
CREATE INDEX plan_versions_active_idx
  ON commerce.plan_versions (active, plan_key, currency, catalog_version);

CREATE TABLE commerce.subscriptions (
  organization_id text PRIMARY KEY REFERENCES identity.organizations(id) ON DELETE CASCADE,
  plan_key text NOT NULL CHECK (plan_key IN ('trial', 'starter', 'pro', 'business')),
  state text NOT NULL CHECK (state IN ('trial', 'active', 'past_due', 'cancelled', 'expired', 'suspended')),
  source_type text NOT NULL DEFAULT 'legacy' CHECK (source_type IN ('legacy', 'manual', 'provider')),
  catalog_version text NOT NULL,
  currency text NOT NULL,
  current_period_start timestamptz NOT NULL,
  current_period_end timestamptz NOT NULL,
  grace_until timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  provider_customer_ref text,
  provider_subscription_ref text,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (current_period_end >= current_period_start)
);
CREATE INDEX subscriptions_state_period_idx
  ON commerce.subscriptions (state, current_period_end);

UPDATE commerce.ledger_entries SET price_version = 'legacy' WHERE price_version IS NULL;
ALTER TABLE commerce.ledger_entries ALTER COLUMN price_version SET NOT NULL;
CREATE UNIQUE INDEX ledger_entries_reservation_terminal_uq
  ON commerce.ledger_entries (organization_id, related_entry_id)
  WHERE entry_type IN ('commit', 'release');

CREATE TABLE commerce.usage_events (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,
  project_id text REFERENCES project_governance.projects(id) ON DELETE SET NULL,
  account_id text REFERENCES identity.accounts(id) ON DELETE SET NULL,
  metric text NOT NULL,
  quantity bigint NOT NULL CHECK (quantity >= 0),
  state text NOT NULL CHECK (state IN ('pending', 'final')),
  idempotency_key text NOT NULL,
  task_id text,
  price_version text NOT NULL,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  finalized_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, idempotency_key),
  CHECK (period_end >= period_start)
);
CREATE INDEX usage_events_organization_period_metric_idx
  ON commerce.usage_events (organization_id, period_start, period_end, metric, state);
CREATE INDEX usage_events_project_time_idx
  ON commerce.usage_events (organization_id, project_id, created_at)
  WHERE project_id IS NOT NULL;

DO $permissions$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oneshowseo_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON commerce.plan_versions, commerce.subscriptions, commerce.usage_events TO oneshowseo_app;
  END IF;
END
$permissions$;
