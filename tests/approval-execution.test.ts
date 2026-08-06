import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { ensureAuthSchema } from "../lib/auth";
import { AppDatabase } from "../lib/database";
import { SqliteApprovalGovernanceRepository } from "../platform/adapters/sqlite/approval-governance-repository";
import { SqliteCommerceRepository } from "../platform/adapters/sqlite/commerce-repository";
import { SqliteExecutionProjectGate } from "../platform/adapters/sqlite/execution-project-gate";
import { SqliteExecutionRepository } from "../platform/adapters/sqlite/execution-repository";
import type { ApprovalExecutionRepository } from "../platform/modules/approvals/execution";
import { ApprovedExecutionService, ApprovalExecutionError, type ApprovedExecutionInput } from "../platform/modules/approvals/execution";
import { CommercialEntitlementService } from "../platform/modules/commerce/service";
import { AtomicTaskCreationService } from "../platform/modules/execution/task-creation";
import { permissions } from "../platform/modules/identity/authorization";

async function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys=ON");
  const database = new AppDatabase(sqlite);
  await ensureAuthSchema(database);
  const now = 1_786_500_000;
  database
    .prepare("INSERT INTO users(id,email,name,password_hash,role,status,plan,trial_ends_at,email_verified_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
    .bind("account_a", "owner@example.com", "Owner", "hash", "user", "active", "trial", now + 14 * 86400, now, now - 100, now - 100)
    .run();
  await ensureAuthSchema(database);
  database.exec("CREATE TABLE projects(id TEXT PRIMARY KEY,organization_id TEXT NOT NULL REFERENCES identity_organizations(id),status TEXT NOT NULL,UNIQUE(organization_id,id));INSERT INTO projects VALUES('project_a','org_account_a','active')");
  const commerceRepository = new SqliteCommerceRepository(database);
  const commerce = new CommercialEntitlementService(commerceRepository, () => now);
  const execution = new SqliteExecutionRepository(database);
  const taskCreation = new AtomicTaskCreationService(execution, commerce, new SqliteExecutionProjectGate(database), () => now);
  const approvals = new SqliteApprovalGovernanceRepository(database);
  approvals.ensureSchema();
  addApprovedRecommendation(database);
  const service = new ApprovedExecutionService(approvals, taskCreation, execution, () => now);
  return { database, commerceRepository, execution, approvals, taskCreation, service, now };
}

function addApprovedRecommendation(database: AppDatabase) {
  database.exec(`
    INSERT INTO approval_recommendations(id,organization_id,project_id,task_id,agent_key,agent_version,capability,state,state_revision,current_version,risk,confidence,estimated_cost,expires_at,created_at,updated_at)
      VALUES('recommendation_a','org_account_a','project_a','proposal_task','seo.publisher','1.0.0','content.publish','approved',2,1,'high',0.9,100,2000000000,100,110);
    INSERT INTO approval_recommendation_versions VALUES('recommendation_a',1,'Publish title','Improve CTR','{}','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','agent',100);
    INSERT INTO approval_change_sets VALUES('change_a','recommendation_a',1,'cms_page','page_home','before','after','[{"op":"replace","path":"/title"}]',1,100);
    INSERT INTO approval_governed_decisions VALUES('decision_a','org_account_a','project_a','recommendation_a',1,'account_a','approve','Reviewed evidence','policy_a',1,'approval:decision:0001',110);
  `);
}

function request(now: number): ApprovedExecutionInput {
  return {
    activeOrganizationId: "org_account_a",
    organizationId: "org_account_a",
    projectId: "project_a",
    recommendationId: "recommendation_a",
    requestedByAccountId: "account_a",
    role: "owner",
    permission: permissions.approvalsDecide,
    subject: {
      accountId: "account_a",
      organizationId: "org_account_a",
      organizationStatus: "trial",
      planKey: "trial",
      trialEndsAt: now + 14 * 86400,
      accountCreatedAt: now - 100,
    },
    locale: "zh-CN",
    idempotencyKey: "approval-exec-0001",
    correlationId: "approval:execution:0001",
    entitlements: [],
  };
}

test("approved execution atomically creates a new task, reservation, effect, verification, and rollback", async () => {
  const { database, commerceRepository, execution, service, now } = await fixture();
  const result = service.execute(request(now));
  assert.equal(result.duplicate, false);
  assert.equal(result.task.triggerType, "approval");
  assert.equal(result.task.input.recommendationId, "recommendation_a");
  assert.equal(result.reservationId !== null, true);
  assert.equal(database.prepare("SELECT COUNT(*) count FROM approval_executions").first<{ count: number }>()?.count, 1);
  assert.equal(database.prepare("SELECT COUNT(*) count FROM approval_verifications WHERE state='pending'").first<{ count: number }>()?.count, 1);
  assert.equal(database.prepare("SELECT COUNT(*) count FROM approval_rollbacks WHERE state='available'").first<{ count: number }>()?.count, 1);
  assert.equal(database.prepare("SELECT COUNT(*) count FROM execution_external_effects WHERE state='pending'").first<{ count: number }>()?.count, 1);
  assert.equal(database.prepare("SELECT state FROM approval_recommendations WHERE id='recommendation_a'").first<{ state: string }>()?.state, "executing");
  assert.equal(execution.job("org_account_a", database.prepare("SELECT id FROM execution_jobs").first<{ id: string }>()!.id)?.queue, "approval-execution");
  assert.equal(commerceRepository.creditBalance("org_account_a", now).reserved, 100);
});

test("approved execution retry returns one task and one Credits reservation", async () => {
  const { database, service, now } = await fixture();
  const first = service.execute(request(now));
  const retry = service.execute(request(now));
  assert.equal(retry.duplicate, true);
  assert.equal(retry.execution.id, first.execution.id);
  assert.equal(retry.task.id, first.task.id);
  for (const table of ["approval_executions", "approval_verifications", "approval_rollbacks", "execution_external_effects", "execution_tasks", "execution_jobs"])
    assert.equal(database.prepare(`SELECT COUNT(*) count FROM ${table}`).first<{ count: number }>()?.count, 1, table);
  assert.equal(database.prepare("SELECT COUNT(*) count FROM commerce_credit_ledger WHERE entry_type='reservation'").first<{ count: number }>()?.count, 1);
});

test("unapproved, stale-version, and empty change-set recommendations create no execution", async () => {
  const unapproved = await fixture();
  unapproved.database.prepare("UPDATE approval_recommendations SET state='pending' WHERE id='recommendation_a'").run();
  assert.throws(() => unapproved.service.execute(request(unapproved.now)), (error) => error instanceof ApprovalExecutionError);

  const stale = await fixture();
  stale.database.exec("INSERT INTO approval_recommendation_versions VALUES('recommendation_a',2,'New','New impact','{}','bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb','agent',120);UPDATE approval_recommendations SET current_version=2 WHERE id='recommendation_a'");
  assert.throws(() => stale.service.execute(request(stale.now)), (error) => error instanceof ApprovalExecutionError);

  const empty = await fixture();
  empty.database.exec(`
    INSERT INTO approval_recommendations(id,organization_id,project_id,task_id,agent_key,agent_version,capability,state,state_revision,current_version,risk,confidence,estimated_cost,expires_at,created_at,updated_at)
      VALUES('recommendation_empty','org_account_a','project_a','proposal_empty','seo.publisher','1.0.0','content.publish','approved',2,1,'high',0.9,100,2000000000,100,110);
    INSERT INTO approval_recommendation_versions VALUES('recommendation_empty',1,'Empty','No changes','{}','cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc','agent',100);
    INSERT INTO approval_governed_decisions VALUES('decision_empty','org_account_a','project_a','recommendation_empty',1,'account_a','approve','Reviewed evidence','policy_a',1,'approval:decision:empty',110);
  `);
  assert.throws(
    () => empty.service.execute({ ...request(empty.now), recommendationId: "recommendation_empty", idempotencyKey: "approval-exec-empty" }),
    (error) => error instanceof ApprovalExecutionError && error.code === "CHANGE_SET_REQUIRED",
  );
  for (const item of [unapproved, stale, empty]) {
    assert.equal(item.database.prepare("SELECT COUNT(*) count FROM execution_tasks").first<{ count: number }>()?.count, 0);
    assert.equal(item.database.prepare("SELECT COUNT(*) count FROM commerce_credit_ledger").first<{ count: number }>()?.count, 0);
  }
});

test("late approval persistence failure rolls back nested task and Credits writes", async () => {
  const { database, approvals, taskCreation, execution, now } = await fixture();
  const failing = new Proxy(approvals, {
    get(target, property, receiver) {
      if (property === "appendVerification") return () => { throw new Error("INJECTED_VERIFICATION_FAILURE"); };
      const value = Reflect.get(target, property, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as ApprovalExecutionRepository;
  const service = new ApprovedExecutionService(failing, taskCreation, execution, () => now);
  assert.throws(() => service.execute(request(now)), /INJECTED_VERIFICATION_FAILURE/);
  for (const table of ["approval_executions", "approval_verifications", "approval_rollbacks", "execution_external_effects", "execution_tasks", "execution_jobs", "execution_outbox", "execution_idempotency_keys", "commerce_credit_ledger"])
    assert.equal(database.prepare(`SELECT COUNT(*) count FROM ${table}`).first<{ count: number }>()?.count, 0, table);
  assert.equal(database.prepare("SELECT state FROM approval_recommendations WHERE id='recommendation_a'").first<{ state: string }>()?.state, "approved");
});
