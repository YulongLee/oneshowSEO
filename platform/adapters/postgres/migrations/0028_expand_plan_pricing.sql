-- description: Add centrally managed CNY product pricing with immutable change history
-- rollback: Disable checkout, restore the previous active pricing snapshot, and retain pricing history for finance audit
-- minimum-app-version: 0.1.0

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE commerce.plan_pricing (
  plan_key text PRIMARY KEY CHECK (plan_key IN ('trial','starter','pro','business')),
  monthly_price_fen bigint NOT NULL CHECK (monthly_price_fen >= 0),
  currency text NOT NULL DEFAULT 'CNY' CHECK (currency = 'CNY'),
  available boolean NOT NULL DEFAULT true,
  featured boolean NOT NULL DEFAULT false,
  price_version text NOT NULL,
  updated_by_account_id text REFERENCES identity.accounts(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE commerce.plan_pricing_history (
  id text PRIMARY KEY,
  plan_key text NOT NULL CHECK (plan_key IN ('trial','starter','pro','business')),
  monthly_price_fen bigint NOT NULL CHECK (monthly_price_fen >= 0),
  currency text NOT NULL CHECK (currency = 'CNY'),
  available boolean NOT NULL,
  featured boolean NOT NULL,
  price_version text NOT NULL,
  updated_by_account_id text REFERENCES identity.accounts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_key,price_version)
);
CREATE INDEX plan_pricing_history_time_idx ON commerce.plan_pricing_history (created_at DESC,id DESC);
CREATE UNIQUE INDEX plan_pricing_single_featured_idx ON commerce.plan_pricing (featured) WHERE featured;

INSERT INTO commerce.plan_pricing(plan_key,monthly_price_fen,currency,available,featured,price_version)
VALUES ('trial',0,'CNY',true,false,'cny-initial-2026-08-11'),
       ('starter',3500,'CNY',true,false,'cny-initial-2026-08-11'),
       ('pro',9800,'CNY',true,true,'cny-initial-2026-08-11'),
       ('business',23800,'CNY',true,false,'cny-initial-2026-08-11')
ON CONFLICT (plan_key) DO NOTHING;

DO $permissions$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oneshowseo_app') THEN
    GRANT SELECT,INSERT,UPDATE ON commerce.plan_pricing TO oneshowseo_app;
    GRANT SELECT,INSERT ON commerce.plan_pricing_history TO oneshowseo_app;
    REVOKE DELETE ON commerce.plan_pricing,commerce.plan_pricing_history FROM oneshowseo_app;
    REVOKE UPDATE ON commerce.plan_pricing_history FROM oneshowseo_app;
  END IF;
END
$permissions$;
