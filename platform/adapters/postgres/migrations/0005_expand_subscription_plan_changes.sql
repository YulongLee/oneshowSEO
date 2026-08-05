-- description: Add versioned end-of-period subscription plan changes and due-change lookup
-- rollback: Pre-cutover only: clear pending plan changes, then drop the pending plan columns and due-change index from commerce.subscriptions
-- minimum-app-version: 0.1.0

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE commerce.subscriptions
  ADD COLUMN pending_plan_key text,
  ADD COLUMN plan_change_at timestamptz,
  ADD COLUMN plan_change_reason text,
  ADD CONSTRAINT subscriptions_pending_plan_key_check
    CHECK (pending_plan_key IS NULL OR pending_plan_key IN ('trial', 'starter', 'pro', 'business')),
  ADD CONSTRAINT subscriptions_plan_change_complete_check
    CHECK ((pending_plan_key IS NULL) = (plan_change_at IS NULL));

CREATE INDEX subscriptions_due_plan_change_idx
  ON commerce.subscriptions (plan_change_at, organization_id)
  WHERE pending_plan_key IS NOT NULL;
