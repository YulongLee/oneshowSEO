import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { AppDatabase } from "../lib/database";
import { SqliteApprovalGovernanceRepository } from "../platform/adapters/sqlite/approval-governance-repository";
import {
  ApprovalOperationError,
  ApprovalOperationsService,
  type ApprovalOperationActor,
  type GovernedApprovalAction,
} from "../platform/modules/approvals/operations";

function fixture(expiresAt = 200) {
  const db = new AppDatabase(new DatabaseSync(":memory:"));
  db.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE identity_organizations(id TEXT PRIMARY KEY);
    CREATE TABLE projects(id TEXT,organization_id TEXT,UNIQUE(organization_id,id));
    CREATE TABLE identity_memberships(id TEXT PRIMARY KEY,organization_id TEXT NOT NULL,status TEXT NOT NULL,project_scope TEXT NOT NULL);
    INSERT INTO identity_organizations VALUES('org_a'),('org_b');
    INSERT INTO projects VALUES('project_a','org_a'),('project_b','org_b');
    INSERT INTO identity_memberships VALUES('membership_a','org_a','active','[]'),('membership_b','org_a','active','["project_a"]'),('membership_x','org_b','active','[]'),('membership_suspended','org_a','suspended','[]');
  `);
  const repository = new SqliteApprovalGovernanceRepository(db);
  repository.ensureSchema();
  addRecommendation(db, "recommendation_a", expiresAt);
  const service = new ApprovalOperationsService(repository, () => 100);
  return { db, repository, service };
}

function addRecommendation(db: AppDatabase, id: string, expiresAt = 200) {
  db.prepare(
    "INSERT INTO approval_recommendations(id,organization_id,project_id,task_id,agent_key,agent_version,capability,state,state_revision,current_version,risk,confidence,estimated_cost,expires_at,created_at,updated_at)VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
  )
    .bind(id, "org_a", "project_a", `task_${id}`, "seo.audit", "1.0.0", "audit.run", "pending", 1, 1, "medium", 0.9, 2, expiresAt, 90, 90)
    .run();
  db.prepare("INSERT INTO approval_recommendation_versions VALUES(?,?,?,?,?,?,?,?)")
    .bind(id, 1, "Recommendation", "Impact", "{}", "a".repeat(64), "agent", 90)
    .run();
}

function actor(overrides: Partial<ApprovalOperationActor> = {}): ApprovalOperationActor {
  return {
    id: "account_a",
    membershipId: "membership_a",
    kind: "human",
    organizationId: "org_a",
    active: true,
    projectIds: new Set(["project_a"]),
    permissions: new Set(["approvals.decide"]),
    ...overrides,
  };
}

function decision(action: GovernedApprovalAction, recommendationId = "recommendation_a", expectedStateRevision = 1) {
  return {
    organizationId: "org_a",
    projectId: "project_a",
    recommendationId,
    action,
    reason: "Reviewed supporting evidence",
    expectedStateRevision,
    correlationId: `approval:${recommendationId}:0001`,
    policy: { id: "policy_a", version: 3 },
  };
}

test("approve persists an immutable version-bound decision and append-only audit", () => {
  const { db, service } = fixture();
  const result = service.decide(actor(), decision("approve"));
  assert.equal(result.state, "approved");
  assert.equal(result.stateRevision, 2);
  const stored = db
    .prepare("SELECT recommendation_version AS version,policy_id AS policyId,policy_version AS policyVersion,correlation_id AS correlationId FROM approval_governed_decisions")
    .first<{ version: number; policyId: string; policyVersion: number; correlationId: string }>();
  assert.deepEqual({ ...stored }, { version: 1, policyId: "policy_a", policyVersion: 3, correlationId: "approval:recommendation_a:0001" });
  assert.equal(db.prepare("SELECT COUNT(*) count FROM operations_audit_events WHERE action='approval.approve'").first<{ count: number }>()?.count, 1);
  assert.throws(() => db.prepare("UPDATE approval_governed_decisions SET reason='changed'").run(), /APPROVAL_DECISION_IMMUTABLE/);
  assert.throws(() => db.prepare("DELETE FROM operations_audit_events").run(), /AUDIT_EVENTS_APPEND_ONLY/);
});

test("reject, request changes, defer, and expiry use explicit safe transitions", () => {
  for (const [action, state] of [
    ["reject", "rejected"],
    ["request_changes", "changes_requested"],
    ["defer", "deferred"],
  ] as const) {
    const { service } = fixture();
    assert.equal(service.decide(actor(), decision(action)).state, state);
  }
  const future = fixture(200);
  assert.throws(() => future.service.decide(actor({ kind: "system" }), decision("expire")), (error) =>
    error instanceof ApprovalOperationError && error.code === "NOT_EXPIRED",
  );
  const expired = fixture(100);
  assert.equal(expired.service.decide(actor({ kind: "system" }), decision("expire")).state, "expired");
});

test("tenant, project, permission, assignment, reason, and revision checks fail closed", () => {
  const { db, service } = fixture();
  assert.throws(() => service.decide(actor({ organizationId: "org_b" }), decision("approve")), (error) =>
    error instanceof ApprovalOperationError && error.code === "TENANT_MISMATCH",
  );
  assert.throws(() => service.decide(actor({ projectIds: new Set() }), decision("approve")), (error) =>
    error instanceof ApprovalOperationError && error.code === "PROJECT_FORBIDDEN",
  );
  assert.throws(() => service.decide(actor({ permissions: new Set() }), decision("approve")), (error) =>
    error instanceof ApprovalOperationError && error.code === "FORBIDDEN",
  );
  assert.throws(() => service.decide(actor({ kind: "system" }), decision("approve")), (error) =>
    error instanceof ApprovalOperationError && error.code === "FORBIDDEN",
  );
  db.exec("INSERT INTO approval_assignments VALUES('assignment_a','recommendation_a','membership_b',1,'account_a',90,90)");
  assert.throws(() => service.decide(actor(), decision("approve")), (error) =>
    error instanceof ApprovalOperationError && error.code === "NOT_ASSIGNED",
  );
  assert.throws(() => service.decide(actor({ membershipId: "membership_b" }), { ...decision("approve"), reason: " " }), (error) =>
    error instanceof ApprovalOperationError && error.code === "INVALID_REASON",
  );
  assert.throws(() => service.decide(actor({ membershipId: "membership_b" }), decision("approve", "recommendation_a", 2)), (error) =>
    error instanceof ApprovalOperationError && error.code === "STATE_CONFLICT",
  );
});

test("reassignment validates project membership and uses optimistic revisions", () => {
  const { service } = fixture();
  const first = service.reassign(actor(), {
    organizationId: "org_a",
    projectId: "project_a",
    recommendationId: "recommendation_a",
    membershipId: "membership_b",
    reason: "Assign to content owner",
    expectedAssignmentRevision: 0,
    correlationId: "approval:reassign:0001",
  });
  assert.equal(first.revision, 1);
  assert.throws(
    () =>
      service.reassign(actor(), {
        organizationId: "org_a",
        projectId: "project_a",
        recommendationId: "recommendation_a",
        membershipId: "membership_a",
        reason: "Stale retry",
        expectedAssignmentRevision: 0,
        correlationId: "approval:reassign:0002",
      }),
    (error) => error instanceof ApprovalOperationError && error.code === "ASSIGNMENT_CONFLICT",
  );
  assert.throws(
    () =>
      service.reassign(actor(), {
        organizationId: "org_a",
        projectId: "project_a",
        recommendationId: "recommendation_a",
        membershipId: "membership_x",
        reason: "Cross tenant",
        expectedAssignmentRevision: 1,
        correlationId: "approval:reassign:0003",
      }),
    (error) => error instanceof ApprovalOperationError && error.code === "ASSIGNEE_NOT_FOUND",
  );
});

test("bulk decisions are bounded, unique, and atomic on any conflict", () => {
  const { db, service } = fixture();
  addRecommendation(db, "recommendation_b");
  assert.throws(
    () => service.decideBulk(actor(), [decision("approve"), decision("reject", "recommendation_b", 2)]),
    (error) => error instanceof ApprovalOperationError && error.code === "STATE_CONFLICT",
  );
  assert.equal(db.prepare("SELECT COUNT(*) count FROM approval_governed_decisions").first<{ count: number }>()?.count, 0);
  assert.equal(db.prepare("SELECT state FROM approval_recommendations WHERE id='recommendation_a'").first<{ state: string }>()?.state, "pending");
  const results = service.decideBulk(actor(), [decision("approve"), decision("reject", "recommendation_b")]);
  assert.deepEqual(results.map((result) => result.state), ["approved", "rejected"]);
  assert.throws(() => service.decideBulk(actor(), [decision("approve"), decision("reject")]), (error) =>
    error instanceof ApprovalOperationError && error.code === "INVALID_REQUEST",
  );
  assert.throws(() => service.decideBulk(actor(), []), (error) =>
    error instanceof ApprovalOperationError && error.code === "INVALID_REQUEST",
  );
});

test("PostgreSQL operation migration adds state concurrency and decision correlation", async () => {
  const migration = await readFile(
    new URL("../platform/adapters/postgres/migrations/0015_expand_approval_operations.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /state_revision bigint NOT NULL DEFAULT 1/);
  assert.match(migration, /policy_version integer/);
  assert.match(migration, /correlation_id text NOT NULL/);
  assert.match(migration, /ALTER COLUMN correlation_id DROP DEFAULT/);
  assert.match(migration, /audit_events_no_mutation/);
  assert.match(migration, /REVOKE UPDATE,DELETE ON operations\.audit_events/);
});

test("PostgreSQL records explicit human approval provenance", async () => {
  const migration = await readFile(
    new URL("../platform/adapters/postgres/migrations/0016_expand_human_approval.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /actor_type text NOT NULL DEFAULT 'unknown'/);
  assert.match(migration, /decision='approve' AND actor_type='human'/);
  assert.match(migration, /ALTER COLUMN actor_type DROP DEFAULT/);
});
