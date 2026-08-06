import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { AppDatabase } from "../lib/database";
import { SqliteApprovalGovernanceRepository } from "../platform/adapters/sqlite/approval-governance-repository";
import { ApprovalPolicyEvaluator, type ApprovalPolicyInput } from "../platform/modules/approvals/policy";

function fixture() {
  const db = new AppDatabase(new DatabaseSync(":memory:"));
  db.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE identity_organizations(id TEXT PRIMARY KEY);
    CREATE TABLE projects(id TEXT,organization_id TEXT,UNIQUE(organization_id,id));
    INSERT INTO identity_organizations VALUES('org_a'),('org_x');
    INSERT INTO projects VALUES('project_a','org_a'),('project_b','org_a'),('project_x','org_x');
  `);
  const repository = new SqliteApprovalGovernanceRepository(db);
  repository.ensureSchema();
  const evaluator = new ApprovalPolicyEvaluator(repository, () => 100);
  return { db, repository, evaluator };
}

function input(overrides: Partial<ApprovalPolicyInput> = {}): ApprovalPolicyInput {
  return {
    organizationId: "org_a",
    projectId: "project_a",
    capability: "audit.run",
    environment: "production",
    risk: "low",
    actor: {
      id: "actor_a",
      kind: "human",
      organizationId: "org_a",
      active: true,
      projectIds: new Set(["project_a"]),
      permissions: new Set(["audits.run"]),
    },
    requiredPermission: "audits.run",
    entitlement: {
      organizationId: "org_a",
      access: "active",
      capabilities: new Set(["audit.run"]),
      version: 7,
      validUntil: 200,
    },
    expiresAt: 200,
    ...overrides,
  };
}

function insertPolicy(
  db: AppDatabase,
  values: {
    id: string;
    organizationId?: string;
    projectId?: string | null;
    capability?: string | null;
    environment?: "production" | "staging";
    risk?: "low" | "medium" | "high" | "critical";
    action: "allow" | "require_approval" | "deny";
    version?: number;
    active?: boolean;
  },
) {
  db.prepare("INSERT INTO approval_policies VALUES(?,?,?,?,?,?,?,?,?,?)")
    .bind(
      values.id,
      values.organizationId ?? "org_a",
      values.projectId ?? null,
      values.capability ?? null,
      values.environment ?? "production",
      values.risk ?? "low",
      values.action,
      values.version ?? 1,
      values.active === false ? 0 : 1,
      100,
    )
    .run();
}

test("the most specific policy wins and equal-scope conflicts fail toward safety", () => {
  const { db, evaluator } = fixture();
  insertPolicy(db, { id: "org_default", action: "require_approval" });
  insertPolicy(db, { id: "project_capability", projectId: "project_a", capability: "audit.run", action: "allow" });
  assert.deepEqual(evaluator.evaluate(input()), {
    action: "allow",
    reason: "POLICY_ALLOWED",
    policy: { id: "project_capability", version: 1 },
    entitlementVersion: 7,
    requiresHuman: false,
  });
  insertPolicy(db, { id: "project_capability_deny", projectId: "project_a", capability: "audit.run", action: "deny" });
  assert.equal(evaluator.evaluate(input()).reason, "POLICY_DENIED");
});

test("high-risk and known external mutations can never be auto-approved", () => {
  const { db, evaluator } = fixture();
  insertPolicy(db, { id: "unsafe_allow", projectId: "project_a", capability: "audit.run", risk: "high", action: "allow" });
  const high = evaluator.evaluate(input({ risk: "high" }));
  assert.equal(high.action, "require_approval");
  assert.equal(high.reason, "EXPLICIT_HUMAN_APPROVAL_REQUIRED");
  assert.equal(high.requiresHuman, true);

  insertPolicy(db, { id: "publish_allow", projectId: "project_a", capability: "content.publish", action: "allow" });
  const publish = evaluator.evaluate(
    input({
      capability: "content.publish",
      entitlement: { ...input().entitlement, capabilities: new Set(["content.publish"]) },
    }),
  );
  assert.equal(publish.reason, "EXPLICIT_HUMAN_APPROVAL_REQUIRED");
  for (const capability of ["wordpress.publish.post", "site.robots.update", "page.delete", "oauth.token.rotate", "database.destructive.overwrite"]) {
    insertPolicy(db, { id: `allow_${capability}`, projectId: "project_a", capability, action: "allow" });
    const result = evaluator.evaluate(
      input({ capability, entitlement: { ...input().entitlement, capabilities: new Set([capability]) } }),
    );
    assert.equal(result.reason, "EXPLICIT_HUMAN_APPROVAL_REQUIRED", capability);
  }
  insertPolicy(db, { id: "effect_allow", projectId: "project_a", capability: "site.change", action: "allow" });
  assert.equal(
    evaluator.evaluate(
      input({
        capability: "site.change",
        effects: new Set(["external_publication"]),
        entitlement: { ...input().entitlement, capabilities: new Set(["site.change"]) },
      }),
    ).reason,
    "EXPLICIT_HUMAN_APPROVAL_REQUIRED",
  );
});

test("actor organization, project, state, and permission are enforced before policy lookup", () => {
  const { evaluator } = fixture();
  assert.equal(evaluator.evaluate(input({ actor: { ...input().actor, active: false } })).reason, "ACTOR_INACTIVE");
  assert.equal(
    evaluator.evaluate(input({ actor: { ...input().actor, organizationId: "org_x" } })).reason,
    "ACTOR_TENANT_MISMATCH",
  );
  assert.equal(
    evaluator.evaluate(input({ actor: { ...input().actor, projectIds: new Set(["project_b"]) } })).reason,
    "ACTOR_PROJECT_FORBIDDEN",
  );
  assert.equal(
    evaluator.evaluate(input({ actor: { ...input().actor, permissions: new Set() } })).reason,
    "ACTOR_PERMISSION_MISSING",
  );
});

test("entitlement scope, access, capability, validity, and recommendation expiry fail closed", () => {
  const { evaluator } = fixture();
  const entitlement = input().entitlement;
  assert.equal(
    evaluator.evaluate(input({ entitlement: { ...entitlement, organizationId: "org_x" } })).reason,
    "ENTITLEMENT_TENANT_MISMATCH",
  );
  assert.equal(
    evaluator.evaluate(input({ entitlement: { ...entitlement, access: "restricted" } })).reason,
    "ENTITLEMENT_RESTRICTED",
  );
  assert.equal(
    evaluator.evaluate(input({ entitlement: { ...entitlement, validUntil: 100 } })).reason,
    "ENTITLEMENT_EXPIRED",
  );
  assert.equal(
    evaluator.evaluate(input({ entitlement: { ...entitlement, capabilities: new Set() } })).reason,
    "ENTITLEMENT_CAPABILITY_MISSING",
  );
  assert.equal(evaluator.evaluate(input({ expiresAt: 100 })).reason, "RECOMMENDATION_EXPIRED");
});

test("only the latest policy version is effective and no match requires approval", () => {
  const { db, evaluator, repository } = fixture();
  insertPolicy(db, { id: "versioned", projectId: "project_a", capability: "audit.run", action: "allow" });
  insertPolicy(db, {
    id: "versioned",
    projectId: "project_a",
    capability: "audit.run",
    action: "allow",
    version: 2,
    active: false,
  });
  assert.equal(repository.activePolicies("org_a", "project_a").length, 0);
  assert.equal(evaluator.evaluate(input()).reason, "SAFE_DEFAULT_REQUIRES_APPROVAL");
});
