-- description: Record the approver kind so mandatory human approval cannot be inferred from an opaque actor identifier
-- rollback: Export approval decisions before removing the additive actor type column
-- minimum-app-version: 0.1.0
ALTER TABLE approvals.decisions ADD COLUMN actor_type text NOT NULL DEFAULT 'unknown' CHECK(actor_type IN('human','system','unknown'));
ALTER TABLE approvals.decisions ALTER COLUMN actor_type DROP DEFAULT;
CREATE INDEX approval_human_decisions_idx ON approvals.decisions(organization_id,project_id,recommendation_id,created_at DESC) WHERE decision='approve' AND actor_type='human';
