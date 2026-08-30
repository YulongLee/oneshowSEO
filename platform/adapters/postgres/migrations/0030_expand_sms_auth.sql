-- description: Add privacy-preserving mainland China phone identities and one-time SMS login challenges
-- rollback: Disable SMS_AUTH_ENABLED, retain identity and verification audit records, and remove tables only after account recovery review
-- minimum-app-version: 0.1.0

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE identity.phone_identities (
  account_id text PRIMARY KEY REFERENCES identity.accounts(id) ON DELETE CASCADE,
  phone_hash text NOT NULL UNIQUE CHECK (phone_hash ~ '^[a-f0-9]{64}$'),
  phone_last4 text NOT NULL CHECK (phone_last4 ~ '^\d{4}$'),
  country_code text NOT NULL DEFAULT '+86' CHECK (country_code = '+86'),
  verified_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE identity.sms_verification_codes (
  id text PRIMARY KEY,
  phone_hash text NOT NULL CHECK (phone_hash ~ '^[a-f0-9]{64}$'),
  purpose text NOT NULL DEFAULT 'login' CHECK (purpose = 'login'),
  code_hash text NOT NULL CHECK (code_hash ~ '^[a-f0-9]{64}$'),
  code_salt text NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  max_attempts integer NOT NULL DEFAULT 5 CHECK (max_attempts = 5),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  provider_request_id text,
  provider_biz_id text,
  ip_hash text NOT NULL CHECK (ip_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sms_verification_lookup_idx ON identity.sms_verification_codes(phone_hash,purpose,created_at DESC);
CREATE INDEX sms_verification_expiry_idx ON identity.sms_verification_codes(expires_at,consumed_at);

CREATE TABLE identity.policy_acceptances (
  id text PRIMARY KEY,
  account_id text NOT NULL REFERENCES identity.accounts(id) ON DELETE CASCADE,
  policy_type text NOT NULL CHECK (policy_type IN ('terms','privacy')),
  policy_version text NOT NULL,
  source text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(account_id,policy_type,policy_version)
);

DO $permissions$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oneshowseo_app') THEN
    GRANT SELECT,INSERT,UPDATE ON identity.phone_identities,identity.sms_verification_codes,identity.policy_acceptances TO oneshowseo_app;
    REVOKE DELETE ON identity.phone_identities,identity.sms_verification_codes,identity.policy_acceptances FROM oneshowseo_app;
  END IF;
END
$permissions$;
