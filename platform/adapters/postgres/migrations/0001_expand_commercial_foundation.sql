-- description: Create tenant, project, commerce, audit, and feature-flag foundation schemas
-- rollback: Pre-cutover only: restore the verified database snapshot or drop the empty foundation schemas after an ownership review
-- minimum-app-version: 0.1.0

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE SCHEMA IF NOT EXISTS identity;
CREATE SCHEMA IF NOT EXISTS project_governance;
CREATE SCHEMA IF NOT EXISTS commerce;
CREATE SCHEMA IF NOT EXISTS operations;

CREATE TABLE identity.accounts (
  id text PRIMARY KEY,
  email text NOT NULL,
  display_name text NOT NULL,
  password_hash text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('pending', 'active', 'suspended', 'deleted')),
  verified_at timestamptz,
  last_login_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX accounts_email_normalized_uq ON identity.accounts (lower(email));

CREATE TABLE identity.organizations (
  id text PRIMARY KEY,
  slug text NOT NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'trial' CHECK (status IN ('trial', 'active', 'past_due', 'restricted', 'suspended', 'deleted')),
  default_locale text NOT NULL DEFAULT 'zh-CN' CHECK (default_locale IN ('zh-CN', 'en')),
  timezone text NOT NULL DEFAULT 'Asia/Shanghai',
  owner_account_id text NOT NULL REFERENCES identity.accounts(id) ON DELETE RESTRICT,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE UNIQUE INDEX organizations_slug_normalized_uq ON identity.organizations (lower(slug));
CREATE INDEX organizations_owner_idx ON identity.organizations (owner_account_id);

CREATE TABLE identity.roles (
  id text PRIMARY KEY,
  organization_id text REFERENCES identity.organizations(id) ON DELETE CASCADE,
  role_key text NOT NULL,
  name text NOT NULL,
  permissions jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(permissions) = 'array'),
  is_system boolean NOT NULL DEFAULT false,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX roles_scope_key_uq ON identity.roles (coalesce(organization_id, ''), role_key);
CREATE INDEX roles_organization_idx ON identity.roles (organization_id);

CREATE TABLE identity.memberships (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,
  account_id text NOT NULL REFERENCES identity.accounts(id) ON DELETE CASCADE,
  role_id text NOT NULL REFERENCES identity.roles(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('invited', 'active', 'suspended', 'revoked')),
  joined_at timestamptz,
  suspended_at timestamptz,
  revoked_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, account_id)
);
CREATE INDEX memberships_account_status_idx ON identity.memberships (account_id, status);
CREATE INDEX memberships_organization_status_idx ON identity.memberships (organization_id, status);

CREATE TABLE identity.invitations (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  role_id text NOT NULL REFERENCES identity.roles(id) ON DELETE RESTRICT,
  token_hash text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'cancelled', 'expired')),
  invited_by_account_id text NOT NULL REFERENCES identity.accounts(id) ON DELETE RESTRICT,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  cancelled_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at)
);
CREATE UNIQUE INDEX invitations_pending_email_uq
  ON identity.invitations (organization_id, lower(email)) WHERE status = 'pending';
CREATE INDEX invitations_organization_status_idx ON identity.invitations (organization_id, status, expires_at);

CREATE TABLE identity.sessions (
  id text PRIMARY KEY,
  account_id text NOT NULL REFERENCES identity.accounts(id) ON DELETE CASCADE,
  active_organization_id text NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,
  membership_id text NOT NULL REFERENCES identity.memberships(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'rotated', 'revoked', 'expired')),
  expires_at timestamptz NOT NULL,
  rotated_from_id text REFERENCES identity.sessions(id) ON DELETE SET NULL,
  revoked_at timestamptz,
  last_seen_at timestamptz,
  correlation_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at)
);
CREATE INDEX sessions_account_status_idx ON identity.sessions (account_id, status, expires_at);
CREATE INDEX sessions_organization_status_idx ON identity.sessions (active_organization_id, status, expires_at);

CREATE TABLE project_governance.projects (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,
  slug text NOT NULL,
  name text NOT NULL,
  canonical_url text NOT NULL,
  canonical_host text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'pending_deletion', 'deleted')),
  locale text NOT NULL DEFAULT 'zh-CN' CHECK (locale IN ('zh-CN', 'en')),
  market text,
  timezone text NOT NULL DEFAULT 'Asia/Shanghai',
  business_type text,
  goals jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(goals) = 'array'),
  approval_mode text NOT NULL DEFAULT 'manual' CHECK (approval_mode IN ('manual', 'risk_based')),
  created_by_account_id text NOT NULL REFERENCES identity.accounts(id) ON DELETE RESTRICT,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  deleted_at timestamptz,
  UNIQUE (organization_id, slug),
  UNIQUE (organization_id, canonical_host)
);
CREATE INDEX projects_organization_status_idx ON project_governance.projects (organization_id, status);

CREATE TABLE project_governance.project_access (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,
  project_id text NOT NULL REFERENCES project_governance.projects(id) ON DELETE CASCADE,
  membership_id text NOT NULL REFERENCES identity.memberships(id) ON DELETE CASCADE,
  access_level text NOT NULL CHECK (access_level IN ('manager', 'editor', 'contributor', 'viewer')),
  granted_by_account_id text NOT NULL REFERENCES identity.accounts(id) ON DELETE RESTRICT,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, membership_id)
);
CREATE INDEX project_access_organization_member_idx
  ON project_governance.project_access (organization_id, membership_id);
CREATE INDEX project_access_organization_project_idx
  ON project_governance.project_access (organization_id, project_id);

CREATE TABLE commerce.entitlements (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,
  entitlement_key text NOT NULL,
  value jsonb NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('plan', 'trial', 'override', 'grace', 'suspension')),
  source_version text NOT NULL,
  valid_from timestamptz NOT NULL,
  valid_until timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (valid_until IS NULL OR valid_until > valid_from),
  UNIQUE (organization_id, entitlement_key, source_type, source_version)
);
CREATE INDEX entitlements_organization_validity_idx
  ON commerce.entitlements (organization_id, entitlement_key, valid_from, valid_until);

CREATE TABLE commerce.ledger_entries (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES identity.organizations(id) ON DELETE RESTRICT,
  project_id text REFERENCES project_governance.projects(id) ON DELETE RESTRICT,
  entry_type text NOT NULL CHECK (entry_type IN ('reservation', 'commit', 'release', 'grant', 'expiry', 'refund', 'adjustment')),
  unit text NOT NULL,
  amount bigint NOT NULL CHECK (amount <> 0),
  idempotency_key text NOT NULL,
  task_id text,
  price_version text,
  related_entry_id text REFERENCES commerce.ledger_entries(id) ON DELETE RESTRICT,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  correlation_id text NOT NULL,
  actor_account_id text REFERENCES identity.accounts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, idempotency_key)
);
CREATE INDEX ledger_entries_organization_unit_time_idx
  ON commerce.ledger_entries (organization_id, unit, created_at, id);
CREATE INDEX ledger_entries_project_time_idx
  ON commerce.ledger_entries (organization_id, project_id, created_at) WHERE project_id IS NOT NULL;

CREATE TABLE operations.audit_events (
  id text PRIMARY KEY,
  organization_id text REFERENCES identity.organizations(id) ON DELETE RESTRICT,
  project_id text REFERENCES project_governance.projects(id) ON DELETE RESTRICT,
  actor_type text NOT NULL CHECK (actor_type IN ('user', 'api', 'mcp', 'agent', 'worker', 'system', 'support')),
  actor_id text,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text,
  outcome text NOT NULL CHECK (outcome IN ('success', 'denied', 'failed', 'pending')),
  reason text,
  policy_version text,
  correlation_id text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_events_organization_time_idx
  ON operations.audit_events (organization_id, occurred_at DESC, id);
CREATE INDEX audit_events_project_time_idx
  ON operations.audit_events (organization_id, project_id, occurred_at DESC) WHERE project_id IS NOT NULL;
CREATE INDEX audit_events_correlation_idx ON operations.audit_events (correlation_id);

CREATE TABLE operations.feature_flags (
  id text PRIMARY KEY,
  flag_key text NOT NULL,
  environment text NOT NULL,
  organization_id text REFERENCES identity.organizations(id) ON DELETE CASCADE,
  project_id text REFERENCES project_governance.projects(id) ON DELETE CASCADE,
  plan_key text,
  cohort_key text,
  capability_key text,
  agent_key text,
  agent_version text,
  enabled boolean NOT NULL,
  reason text NOT NULL,
  changed_by text NOT NULL,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (project_id IS NULL OR organization_id IS NOT NULL)
);
CREATE UNIQUE INDEX feature_flags_scope_uq ON operations.feature_flags
  (flag_key, environment, organization_id, project_id, plan_key, cohort_key, capability_key, agent_key, agent_version)
  NULLS NOT DISTINCT;
CREATE INDEX feature_flags_organization_project_idx
  ON operations.feature_flags (organization_id, project_id, flag_key, enabled);

DO $permissions$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oneshowseo_app') THEN
    GRANT USAGE ON SCHEMA identity, project_governance, commerce, operations TO oneshowseo_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA identity, project_governance, commerce, operations TO oneshowseo_app;
    ALTER DEFAULT PRIVILEGES FOR ROLE oneshowseo_migrator IN SCHEMA identity GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO oneshowseo_app;
    ALTER DEFAULT PRIVILEGES FOR ROLE oneshowseo_migrator IN SCHEMA project_governance GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO oneshowseo_app;
    ALTER DEFAULT PRIVILEGES FOR ROLE oneshowseo_migrator IN SCHEMA commerce GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO oneshowseo_app;
    ALTER DEFAULT PRIVILEGES FOR ROLE oneshowseo_migrator IN SCHEMA operations GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO oneshowseo_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oneshowseo_worker') THEN
    GRANT USAGE ON SCHEMA identity, project_governance, commerce, operations TO oneshowseo_worker;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA identity, project_governance, commerce, operations TO oneshowseo_worker;
    ALTER DEFAULT PRIVILEGES FOR ROLE oneshowseo_migrator IN SCHEMA identity GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO oneshowseo_worker;
    ALTER DEFAULT PRIVILEGES FOR ROLE oneshowseo_migrator IN SCHEMA project_governance GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO oneshowseo_worker;
    ALTER DEFAULT PRIVILEGES FOR ROLE oneshowseo_migrator IN SCHEMA commerce GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO oneshowseo_worker;
    ALTER DEFAULT PRIVILEGES FOR ROLE oneshowseo_migrator IN SCHEMA operations GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO oneshowseo_worker;
  END IF;
END
$permissions$;
