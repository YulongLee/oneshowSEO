-- description: Add atomic distributed developer API and MCP rate-limit buckets across credential, tenant, project, endpoint, and cost dimensions
-- rollback: Stop API and MCP traffic, export aggregate bucket metrics, then drop the ephemeral rate-limit table
-- minimum-app-version: 0.1.0
CREATE TABLE developer.rate_limit_buckets(
 dimension text NOT NULL CHECK(dimension IN('credential','organization','project','endpoint','cost')),
 subject_id text NOT NULL,
 organization_id text NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,
 project_id text NOT NULL,
 endpoint text NOT NULL,
 bucket_start bigint NOT NULL,
 window_seconds integer NOT NULL CHECK(window_seconds>0 AND window_seconds<=86400),
 request_count bigint NOT NULL CHECK(request_count>=0),
 cost_units bigint NOT NULL CHECK(cost_units>=0),
 expires_at bigint NOT NULL,
 PRIMARY KEY(dimension,subject_id,project_id,endpoint,bucket_start,window_seconds)
);
CREATE INDEX developer_rate_limit_expiry_idx ON developer.rate_limit_buckets(expires_at);
CREATE INDEX developer_rate_limit_org_idx ON developer.rate_limit_buckets(organization_id,bucket_start,dimension);
DO $p$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='oneshowseo_app')THEN GRANT SELECT,INSERT,UPDATE,DELETE ON developer.rate_limit_buckets TO oneshowseo_app;END IF;END $p$;
