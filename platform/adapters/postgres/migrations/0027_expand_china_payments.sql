-- description: Add encrypted Alipay and WeChat Pay configuration, immutable CNY checkout orders, and deduplicated verified notification evidence
-- rollback: Disable BILLING_LIVE_ENABLED first; retain payment orders and notifications for finance audit, then drop only after settlement reconciliation and retention approval
-- minimum-app-version: 0.1.0

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE commerce.payment_provider_configs (
  provider text PRIMARY KEY CHECK (provider IN ('alipay','wechatpay')),
  enabled boolean NOT NULL DEFAULT false,
  encrypted_config text,
  last_test_status text,
  last_tested_at timestamptz,
  last_error text,
  updated_by_account_id text REFERENCES identity.accounts(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE commerce.payment_orders (
  id text PRIMARY KEY,
  order_no text NOT NULL UNIQUE,
  organization_id text NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,
  account_id text NOT NULL REFERENCES identity.accounts(id) ON DELETE RESTRICT,
  provider text NOT NULL CHECK (provider IN ('alipay','wechatpay')),
  plan_key text NOT NULL CHECK (plan_key IN ('starter','pro','business')),
  catalog_version text NOT NULL,
  price_version text NOT NULL,
  amount_fen bigint NOT NULL CHECK (amount_fen > 0),
  currency text NOT NULL CHECK (currency = 'CNY'),
  status text NOT NULL CHECK (status IN ('created','pending','paid','closed','failed','refunded')),
  provider_transaction_id text,
  checkout_payload jsonb,
  expires_at timestamptz NOT NULL,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payment_orders_org_time_idx ON commerce.payment_orders (organization_id,created_at DESC,id DESC);
CREATE UNIQUE INDEX payment_orders_provider_transaction_idx ON commerce.payment_orders (provider,provider_transaction_id) WHERE provider_transaction_id IS NOT NULL;

CREATE TABLE commerce.payment_notifications (
  id text PRIMARY KEY,
  provider text NOT NULL CHECK (provider IN ('alipay','wechatpay')),
  provider_event_id text NOT NULL,
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  status text NOT NULL CHECK (status IN ('processing','processed','failed')),
  error_code text,
  UNIQUE (provider,provider_event_id)
);
CREATE INDEX payment_notifications_status_time_idx ON commerce.payment_notifications (status,received_at,id);

DO $permissions$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oneshowseo_app') THEN
    GRANT SELECT,INSERT,UPDATE ON commerce.payment_provider_configs,commerce.payment_orders,commerce.payment_notifications TO oneshowseo_app;
    REVOKE DELETE ON commerce.payment_provider_configs,commerce.payment_orders,commerce.payment_notifications FROM oneshowseo_app;
  END IF;
END
$permissions$;
