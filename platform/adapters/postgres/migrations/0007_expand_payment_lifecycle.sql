-- description: Add verified payment webhook inbox, normalized provider invoices, provider event ordering, and reconciliation evidence
-- rollback: Pre-cutover only: export payment evidence, then drop commerce.payment_reconciliations, commerce.provider_invoices, commerce.payment_webhook_inbox, and the provider ordering columns/index
-- minimum-app-version: 0.1.0

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE commerce.subscriptions
  ADD COLUMN provider_event_created_at timestamptz,
  ADD COLUMN last_provider_event_id text;

CREATE UNIQUE INDEX subscriptions_provider_ref_idx
  ON commerce.subscriptions (provider_subscription_ref)
  WHERE provider_subscription_ref IS NOT NULL;

CREATE TABLE commerce.payment_webhook_inbox (
  id text PRIMARY KEY,
  provider text NOT NULL CHECK (provider IN ('sandbox')),
  provider_event_id text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('subscription.updated', 'subscription.deleted', 'invoice.updated')),
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  event jsonb NOT NULL CHECK (jsonb_typeof(event) = 'object'),
  state text NOT NULL CHECK (state IN ('received', 'processing', 'processed', 'failed', 'quarantined')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  received_at timestamptz NOT NULL DEFAULT now(),
  processing_started_at timestamptz,
  processed_at timestamptz,
  last_error text,
  UNIQUE (provider, provider_event_id)
);
CREATE INDEX payment_webhook_pending_idx
  ON commerce.payment_webhook_inbox (provider, state, received_at, id);

CREATE TABLE commerce.provider_invoices (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('sandbox')),
  customer_ref text NOT NULL,
  subscription_ref text,
  invoice_ref text NOT NULL,
  invoice_number text NOT NULL,
  state text NOT NULL CHECK (state IN ('draft', 'open', 'paid', 'void', 'uncollectible')),
  amount_cents bigint NOT NULL CHECK (amount_cents >= 0),
  currency text NOT NULL,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  hosted_url text,
  provider_created_at timestamptz NOT NULL,
  last_provider_event_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, invoice_ref),
  CHECK (period_end >= period_start)
);
CREATE INDEX provider_invoices_org_time_idx
  ON commerce.provider_invoices (organization_id, provider_created_at DESC, id DESC);

CREATE TABLE commerce.payment_reconciliations (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('sandbox')),
  customer_ref text NOT NULL,
  subscription_ref text,
  status text NOT NULL CHECK (status IN ('ok', 'attention')),
  subscription_corrections integer NOT NULL CHECK (subscription_corrections >= 0),
  invoice_corrections integer NOT NULL CHECK (invoice_corrections >= 0),
  pending_webhook_count integer NOT NULL CHECK (pending_webhook_count >= 0),
  details jsonb NOT NULL CHECK (jsonb_typeof(details) = 'array'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payment_reconciliations_org_time_idx
  ON commerce.payment_reconciliations (organization_id, created_at DESC, id DESC);

DO $permissions$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oneshowseo_app') THEN
    GRANT SELECT, INSERT, UPDATE ON commerce.payment_webhook_inbox, commerce.provider_invoices TO oneshowseo_app;
    GRANT SELECT, INSERT ON commerce.payment_reconciliations TO oneshowseo_app;
  END IF;
END
$permissions$;
