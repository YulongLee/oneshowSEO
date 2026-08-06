import type { AppDatabase } from "../../../lib/database";
import type {
  ApprovalAssignment,
  ApprovalChangeSet,
  ApprovalDecisionRecord,
  ApprovalExecution,
  ApprovalPolicy,
  ApprovalRecommendation,
  ApprovalRollback,
  ApprovalVerification,
} from "../../modules/approvals/model";
import type { ApprovalExecutionRepository } from "../../modules/approvals/execution";
import type { ApprovalAuditRecord, ApprovalOperationsRepository } from "../../modules/approvals/operations";
import type { ApprovalPolicyRepository } from "../../modules/approvals/policy";

type Row = Record<string, unknown>;

export class SqliteApprovalGovernanceRepository
  implements ApprovalPolicyRepository, ApprovalOperationsRepository, ApprovalExecutionRepository
{
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
        state_revision INTEGER NOT NULL DEFAULT 1 CHECK(state_revision > 0),
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
        policy_id TEXT,
        policy_version INTEGER CHECK(policy_version IS NULL OR policy_version > 0),
        correlation_id TEXT NOT NULL,
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
      CREATE TABLE IF NOT EXISTS operations_audit_events(
        id TEXT PRIMARY KEY,organization_id TEXT REFERENCES identity_organizations(id) ON DELETE RESTRICT,project_id TEXT,actor_type TEXT NOT NULL CHECK(actor_type IN('user','api','mcp','agent','worker','system','support')),actor_id TEXT,action TEXT NOT NULL,target_type TEXT NOT NULL,target_id TEXT,
        outcome TEXT NOT NULL CHECK(outcome IN('success','denied','failed','pending')),reason TEXT,policy_version TEXT,correlation_id TEXT NOT NULL,metadata_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(metadata_json)),occurred_at INTEGER NOT NULL,
        CHECK(project_id IS NULL OR organization_id IS NOT NULL),FOREIGN KEY(organization_id,project_id) REFERENCES projects(organization_id,id) ON DELETE RESTRICT
      );
      CREATE INDEX IF NOT EXISTS operations_audit_org_time_idx ON operations_audit_events(organization_id,occurred_at DESC,id);
      CREATE INDEX IF NOT EXISTS operations_audit_correlation_idx ON operations_audit_events(correlation_id,occurred_at,id);
      CREATE TRIGGER IF NOT EXISTS operations_audit_no_update BEFORE UPDATE ON operations_audit_events BEGIN SELECT RAISE(ABORT,'AUDIT_EVENTS_APPEND_ONLY'); END;
      CREATE TRIGGER IF NOT EXISTS operations_audit_no_delete BEFORE DELETE ON operations_audit_events BEGIN SELECT RAISE(ABORT,'AUDIT_EVENTS_APPEND_ONLY'); END;
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

  transaction<T>(operation: () => T): T {
    return this.db.transaction(operation);
  }

  recommendation(organizationId: string, projectId: string, recommendationId: string): ApprovalRecommendation | null {
    const row = this.db
      .prepare("SELECT * FROM approval_recommendations WHERE organization_id=? AND project_id=? AND id=?")
      .bind(organizationId, projectId, recommendationId)
      .first<Row>();
    return row
      ? {
          id: String(row.id),
          organizationId: String(row.organization_id),
          projectId: String(row.project_id),
          taskId: String(row.task_id),
          agentKey: String(row.agent_key),
          agentVersion: String(row.agent_version),
          capability: String(row.capability),
          state: row.state as ApprovalRecommendation["state"],
          stateRevision: Number(row.state_revision),
          currentVersion: Number(row.current_version),
          risk: row.risk as ApprovalRecommendation["risk"],
          confidence: Number(row.confidence),
          estimatedCost: Number(row.estimated_cost),
          expiresAt: Number(row.expires_at),
          createdAt: Number(row.created_at),
          updatedAt: Number(row.updated_at),
        }
      : null;
  }

  assignment(recommendationId: string): ApprovalAssignment | null {
    const row = this.db
      .prepare("SELECT * FROM approval_assignments WHERE recommendation_id=?")
      .bind(recommendationId)
      .first<Row>();
    return row
      ? {
          id: String(row.id),
          recommendationId: String(row.recommendation_id),
          membershipId: String(row.membership_id),
          revision: Number(row.revision),
          assignedBy: String(row.assigned_by),
          createdAt: Number(row.created_at),
          updatedAt: Number(row.updated_at),
        }
      : null;
  }

  assignmentTargetExists(organizationId: string, projectId: string, membershipId: string): boolean {
    return Boolean(
      this.db
        .prepare(
          "SELECT 1 ok FROM identity_memberships WHERE id=? AND organization_id=? AND status='active' AND (project_scope='[]' OR EXISTS(SELECT 1 FROM json_each(project_scope) WHERE value=?))",
        )
        .bind(membershipId, organizationId, projectId)
        .first(),
    );
  }

  updateRecommendationState(input: {
    organizationId: string;
    projectId: string;
    recommendationId: string;
    state: ApprovalRecommendation["state"];
    expectedStateRevision: number;
    now: number;
  }): boolean {
    return (
      this.db
        .prepare(
          "UPDATE approval_recommendations SET state=?,state_revision=state_revision+1,updated_at=? WHERE organization_id=? AND project_id=? AND id=? AND state_revision=?",
        )
        .bind(
          input.state,
          input.now,
          input.organizationId,
          input.projectId,
          input.recommendationId,
          input.expectedStateRevision,
        )
        .run().meta.changes === 1
    );
  }

  appendDecision(value: ApprovalDecisionRecord): void {
    this.db
      .prepare(
        "INSERT INTO approval_governed_decisions(id,organization_id,project_id,recommendation_id,recommendation_version,actor_id,decision,reason,policy_id,policy_version,correlation_id,created_at)VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
      )
      .bind(
        value.id,
        value.organizationId,
        value.projectId,
        value.recommendationId,
        value.recommendationVersion,
        value.actorId,
        value.decision,
        value.reason,
        value.policyId,
        value.policyVersion,
        value.correlationId,
        value.createdAt,
      )
      .run();
  }

  putAssignment(value: ApprovalAssignment, expectedRevision: number): boolean {
    if (expectedRevision === 0)
      return (
        this.db
          .prepare(
            "INSERT OR IGNORE INTO approval_assignments(id,recommendation_id,membership_id,revision,assigned_by,created_at,updated_at)VALUES(?,?,?,?,?,?,?)",
          )
          .bind(
            value.id,
            value.recommendationId,
            value.membershipId,
            value.revision,
            value.assignedBy,
            value.createdAt,
            value.updatedAt,
          )
          .run().meta.changes === 1
      );
    return (
      this.db
        .prepare(
          "UPDATE approval_assignments SET membership_id=?,revision=?,assigned_by=?,updated_at=? WHERE recommendation_id=? AND revision=?",
        )
        .bind(
          value.membershipId,
          value.revision,
          value.assignedBy,
          value.updatedAt,
          value.recommendationId,
          expectedRevision,
        )
        .run().meta.changes === 1
    );
  }

  appendApprovalAudit(value: ApprovalAuditRecord): void {
    this.db
      .prepare(
        "INSERT INTO operations_audit_events(id,organization_id,project_id,actor_type,actor_id,action,target_type,target_id,outcome,reason,policy_version,correlation_id,metadata_json,occurred_at)VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      )
      .bind(
        value.id,
        value.organizationId,
        value.projectId,
        value.actorType,
        value.actorId,
        value.action,
        "approval_recommendation",
        value.targetId,
        "success",
        value.reason,
        value.policyVersion,
        value.correlationId,
        JSON.stringify(value.metadata),
        value.occurredAt,
      )
      .run();
  }

  approvedDecision(organizationId: string, projectId: string, recommendationId: string): ApprovalDecisionRecord | null {
    const row = this.db
      .prepare(
        "SELECT * FROM approval_governed_decisions WHERE organization_id=? AND project_id=? AND recommendation_id=? AND decision='approve' ORDER BY created_at DESC,rowid DESC LIMIT 1",
      )
      .bind(organizationId, projectId, recommendationId)
      .first<Row>();
    return row ? this.mapDecision(row) : null;
  }

  changeSets(recommendationId: string, version: number): ApprovalChangeSet[] {
    return this.db
      .prepare("SELECT * FROM approval_change_sets WHERE recommendation_id=? AND version=? ORDER BY id")
      .bind(recommendationId, version)
      .all<Row>()
      .results.map((row) => ({
        id: String(row.id),
        recommendationId: String(row.recommendation_id),
        version: Number(row.version),
        targetType: String(row.target_type),
        targetRef: String(row.target_ref),
        beforeHash: String(row.before_hash),
        afterHash: String(row.after_hash),
        operations: JSON.parse(String(row.operations_json)) as unknown[],
        rollbackRequired: Boolean(Number(row.rollback_required)),
        createdAt: Number(row.created_at),
      }));
  }

  executionByIdempotency(organizationId: string, idempotencyKey: string): ApprovalExecution | null {
    const row = this.db
      .prepare("SELECT * FROM approval_executions WHERE organization_id=? AND idempotency_key=?")
      .bind(organizationId, idempotencyKey)
      .first<Row>();
    return row ? this.mapExecution(row) : null;
  }

  appendApprovalExecution(value: ApprovalExecution): void {
    this.db
      .prepare(
        "INSERT INTO approval_executions(id,organization_id,project_id,recommendation_id,decision_id,task_id,state,idempotency_key,created_at,updated_at)VALUES(?,?,?,?,?,?,?,?,?,?)",
      )
      .bind(
        value.id,
        value.organizationId,
        value.projectId,
        value.recommendationId,
        value.decisionId,
        value.taskId,
        value.state,
        value.idempotencyKey,
        value.createdAt,
        value.updatedAt,
      )
      .run();
  }

  appendVerification(value: ApprovalVerification): void {
    this.db
      .prepare("INSERT INTO approval_verifications(id,execution_id,state,evidence_ref_id,verified_at,created_at)VALUES(?,?,?,?,?,?)")
      .bind(value.id, value.executionId, value.state, value.evidenceRefId, value.verifiedAt, value.createdAt)
      .run();
  }

  appendRollback(value: ApprovalRollback): void {
    this.db
      .prepare(
        "INSERT INTO approval_rollbacks(id,execution_id,state,artifact_ref_id,requested_by,created_at,updated_at)VALUES(?,?,?,?,?,?,?)",
      )
      .bind(
        value.id,
        value.executionId,
        value.state,
        value.artifactRefId,
        value.requestedBy,
        value.createdAt,
        value.updatedAt,
      )
      .run();
  }

  private mapDecision(row: Row): ApprovalDecisionRecord {
    return {
      id: String(row.id),
      organizationId: String(row.organization_id),
      projectId: String(row.project_id),
      recommendationId: String(row.recommendation_id),
      recommendationVersion: Number(row.recommendation_version),
      actorId: String(row.actor_id),
      decision: row.decision as ApprovalDecisionRecord["decision"],
      reason: String(row.reason),
      policyId: row.policy_id === null ? null : String(row.policy_id),
      policyVersion: row.policy_version === null ? null : Number(row.policy_version),
      correlationId: String(row.correlation_id),
      createdAt: Number(row.created_at),
    };
  }

  private mapExecution(row: Row): ApprovalExecution {
    return {
      id: String(row.id),
      organizationId: String(row.organization_id),
      projectId: String(row.project_id),
      recommendationId: String(row.recommendation_id),
      decisionId: String(row.decision_id),
      taskId: String(row.task_id),
      state: row.state as ApprovalExecution["state"],
      idempotencyKey: String(row.idempotency_key),
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
    };
  }
}
