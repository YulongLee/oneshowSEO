-- description: Add optimistic approval state revisions and immutable decision policy correlation
-- rollback: Preserve approval decision evidence before removing additive revision and correlation columns
-- minimum-app-version: 0.1.0
ALTER TABLE approvals.recommendations ADD COLUMN state_revision bigint NOT NULL DEFAULT 1 CHECK(state_revision>0);
ALTER TABLE approvals.decisions ADD COLUMN policy_id text,ADD COLUMN policy_version integer CHECK(policy_version IS NULL OR policy_version>0),ADD COLUMN correlation_id text NOT NULL DEFAULT 'legacy-migration';
ALTER TABLE approvals.decisions ALTER COLUMN correlation_id DROP DEFAULT;
CREATE INDEX approval_decisions_correlation_idx ON approvals.decisions(correlation_id,created_at,id);
CREATE FUNCTION operations.reject_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'AUDIT_EVENTS_APPEND_ONLY'; END $$;
CREATE TRIGGER audit_events_no_mutation BEFORE UPDATE OR DELETE ON operations.audit_events FOR EACH ROW EXECUTE FUNCTION operations.reject_audit_mutation();
DO $p$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='oneshowseo_app') THEN REVOKE UPDATE,DELETE ON operations.audit_events FROM oneshowseo_app; END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='oneshowseo_worker') THEN REVOKE UPDATE,DELETE ON operations.audit_events FROM oneshowseo_worker; END IF;
END $p$;
