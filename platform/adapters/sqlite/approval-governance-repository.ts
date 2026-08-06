import type { AppDatabase } from "../../../lib/database";
import type { ApprovalPolicy } from "../../modules/approvals/model";
import type { ApprovalPolicyRepository } from "../../modules/approvals/policy";

export class SqliteApprovalGovernanceRepository implements ApprovalPolicyRepository {
  constructor(private readonly db: AppDatabase) {}

  ensureSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS approval_recommendations(
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        task_id TEXT NOT NULL,
        agent_key TEXT NOT NULL,
        agent_version TEXT NOT NULL,
        capability TEXT NOT NULL,
        state TEXT NOT NULL CHECK(state IN('pending','approved','rejected','changes_requested','deferred','expired','executing','verified','failed','rolled_back')),
        current_version INTEGER NOT NULL CHECK(current_version > 0),
        risk TEXT NOT NULL CHECK(risk IN('low','medium','high','critical')),
        confidence REAL NOT NULL CHECK(confidence BETWEEN 0 AND 1),
        estimated_cost REAL NOT NULL CHECK(estimated_cost >= 0),
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE(organization_id,project_id,id),
        FOREIGN KEY(organization_id,project_id) REFERENCES projects(organization_id,id)
      );
      CREATE TABLE IF NOT EXISTS approval_recommendation_versions(
        recommendation_id TEXT NOT NULL REFERENCES approval_recommendations(id),
        version INTEGER NOT NULL CHECK(version > 0),
        title TEXT NOT NULL,
        impact_hypothesis TEXT NOT NULL,
        payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
        payload_hash TEXT NOT NULL CHECK(length(payload_hash)=64),
        created_by TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY(recommendation_id,version)
      );
      CREATE TABLE IF NOT EXISTS approval_evidence_refs(
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        recommendation_id TEXT NOT NULL,
        kind TEXT NOT NULL CHECK(kind IN('artifact','integration','public')),
        reference_id TEXT NOT NULL,
        digest TEXT NOT NULL CHECK(length(digest)=64),
        captured_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        provenance_json TEXT NOT NULL CHECK(json_valid(provenance_json)),
        created_at INTEGER NOT NULL,
        FOREIGN KEY(organization_id,project_id,recommendation_id) REFERENCES approval_recommendations(organization_id,project_id,id)
      );
      CREATE TABLE IF NOT EXISTS approval_change_sets(
        id TEXT NOT NULL,
        recommendation_id TEXT NOT NULL,
        version INTEGER NOT NULL,
        target_type TEXT NOT NULL,
        target_ref TEXT NOT NULL,
        before_hash TEXT NOT NULL,
        after_hash TEXT NOT NULL,
        operations_json TEXT NOT NULL CHECK(json_valid(operations_json)),
        rollback_required INTEGER NOT NULL CHECK(rollback_required IN(0,1)),
        created_at INTEGER NOT NULL,
        PRIMARY KEY(id,version),
        FOREIGN KEY(recommendation_id,version) REFERENCES approval_recommendation_versions(recommendation_id,version)
      );
      CREATE TABLE IF NOT EXISTS approval_policies(
        id TEXT NOT NULL,
        organization_id TEXT NOT NULL,
        project_id TEXT,
        capability TEXT,
        environment TEXT NOT NULL CHECK(environment IN('production','staging')),
        risk TEXT NOT NULL CHECK(risk IN('low','medium','high','critical')),
        action TEXT NOT NULL CHECK(action IN('allow','require_approval','deny')),
        version INTEGER NOT NULL CHECK(version > 0),
        active INTEGER NOT NULL CHECK(active IN(0,1)),
        created_at INTEGER NOT NULL,
        PRIMARY KEY(id,version)
      );
      CREATE TABLE IF NOT EXISTS approval_assignments(
        id TEXT PRIMARY KEY,
        recommendation_id TEXT NOT NULL REFERENCES approval_recommendations(id),
        membership_id TEXT NOT NULL,
        revision INTEGER NOT NULL CHECK(revision > 0),
        assigned_by TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS approval_governed_decisions(
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        recommendation_id TEXT NOT NULL,
        recommendation_version INTEGER NOT NULL,
        actor_id TEXT NOT NULL,
        decision TEXT NOT NULL CHECK(decision IN('approve','reject','request_changes','defer','expire')),
        reason TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        UNIQUE(organization_id,project_id,id),
        FOREIGN KEY(organization_id,project_id,recommendation_id) REFERENCES approval_recommendations(organization_id,project_id,id),
        FOREIGN KEY(recommendation_id,recommendation_version) REFERENCES approval_recommendation_versions(recommendation_id,version)
      );
      CREATE TABLE IF NOT EXISTS approval_executions(
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        recommendation_id TEXT NOT NULL,
        decision_id TEXT NOT NULL,
        task_id TEXT NOT NULL,
        state TEXT NOT NULL CHECK(state IN('queued','running','completed','failed')),
        idempotency_key TEXT NOT NULL UNIQUE,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY(organization_id,project_id,recommendation_id) REFERENCES approval_recommendations(organization_id,project_id,id),
        FOREIGN KEY(organization_id,project_id,decision_id) REFERENCES approval_governed_decisions(organization_id,project_id,id)
      );
      CREATE TABLE IF NOT EXISTS approval_verifications(
        id TEXT PRIMARY KEY,
        execution_id TEXT NOT NULL REFERENCES approval_executions(id),
        state TEXT NOT NULL CHECK(state IN('pending','passed','failed')),
        evidence_ref_id TEXT REFERENCES approval_evidence_refs(id),
        verified_at INTEGER,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS approval_rollbacks(
        id TEXT PRIMARY KEY,
        execution_id TEXT NOT NULL REFERENCES approval_executions(id),
        state TEXT NOT NULL CHECK(state IN('available','requested','running','completed','failed')),
        artifact_ref_id TEXT,
        requested_by TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TRIGGER IF NOT EXISTS approval_versions_no_update BEFORE UPDATE ON approval_recommendation_versions BEGIN SELECT RAISE(ABORT,'APPROVAL_VERSION_IMMUTABLE'); END;
      CREATE TRIGGER IF NOT EXISTS approval_versions_no_delete BEFORE DELETE ON approval_recommendation_versions BEGIN SELECT RAISE(ABORT,'APPROVAL_VERSION_IMMUTABLE'); END;
      CREATE TRIGGER IF NOT EXISTS approval_evidence_no_update BEFORE UPDATE ON approval_evidence_refs BEGIN SELECT RAISE(ABORT,'APPROVAL_EVIDENCE_IMMUTABLE'); END;
      CREATE TRIGGER IF NOT EXISTS approval_evidence_no_delete BEFORE DELETE ON approval_evidence_refs BEGIN SELECT RAISE(ABORT,'APPROVAL_EVIDENCE_IMMUTABLE'); END;
      CREATE TRIGGER IF NOT EXISTS approval_changes_no_update BEFORE UPDATE ON approval_change_sets BEGIN SELECT RAISE(ABORT,'APPROVAL_CHANGE_SET_IMMUTABLE'); END;
      CREATE TRIGGER IF NOT EXISTS approval_changes_no_delete BEFORE DELETE ON approval_change_sets BEGIN SELECT RAISE(ABORT,'APPROVAL_CHANGE_SET_IMMUTABLE'); END;
      CREATE TRIGGER IF NOT EXISTS approval_policies_no_update BEFORE UPDATE ON approval_policies BEGIN SELECT RAISE(ABORT,'APPROVAL_POLICY_IMMUTABLE'); END;
      CREATE TRIGGER IF NOT EXISTS approval_policies_no_delete BEFORE DELETE ON approval_policies BEGIN SELECT RAISE(ABORT,'APPROVAL_POLICY_IMMUTABLE'); END;
      CREATE TRIGGER IF NOT EXISTS approval_decisions_no_update BEFORE UPDATE ON approval_governed_decisions BEGIN SELECT RAISE(ABORT,'APPROVAL_DECISION_IMMUTABLE'); END;
      CREATE TRIGGER IF NOT EXISTS approval_decisions_no_delete BEFORE DELETE ON approval_governed_decisions BEGIN SELECT RAISE(ABORT,'APPROVAL_DECISION_IMMUTABLE'); END;
      CREATE INDEX IF NOT EXISTS approval_queue_idx ON approval_recommendations(organization_id,project_id,state,risk,expires_at);
    `);
  }

  activePolicies(organizationId: string, projectId: string): ApprovalPolicy[] {
    return this.db
      .prepare(`
        SELECT p.id,p.organization_id AS organizationId,p.project_id AS projectId,p.capability,
          p.environment,p.risk,p.action,p.version,p.active,p.created_at AS createdAt
        FROM approval_policies p
        JOIN (
          SELECT id,organization_id,MAX(version) AS version
          FROM approval_policies
          GROUP BY id,organization_id
        ) latest ON latest.id=p.id AND latest.organization_id=p.organization_id AND latest.version=p.version
        WHERE p.organization_id=? AND (p.project_id IS NULL OR p.project_id=?) AND p.active=1
      `)
      .bind(organizationId, projectId)
      .all<Omit<ApprovalPolicy, "active"> & { active: number }>()
      .results.map((policy) => ({ ...policy, active: policy.active === 1 }));
  }
}
