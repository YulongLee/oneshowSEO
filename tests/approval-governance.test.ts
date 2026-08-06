import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { AppDatabase } from "../lib/database";
import { SqliteApprovalGovernanceRepository } from "../platform/adapters/sqlite/approval-governance-repository";

function fixture() {
  const db = new AppDatabase(new DatabaseSync(":memory:"));
  db.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE identity_organizations(id TEXT PRIMARY KEY);
    CREATE TABLE projects(id TEXT,organization_id TEXT,UNIQUE(organization_id,id));
    INSERT INTO identity_organizations VALUES('org_a'),('org_b');
    INSERT INTO projects VALUES('project_a','org_a'),('project_b','org_b');
  `);
  new SqliteApprovalGovernanceRepository(db).ensureSchema();
  db.exec(`
    INSERT INTO approval_recommendations VALUES('recommendation_a','org_a','project_a','task_a','seo.audit','1.0.0','audit.run','pending',1,1,'high',0.9,1.5,200,100,100);
    INSERT INTO approval_recommendation_versions VALUES('recommendation_a',1,'Fix metadata','Improve discovery','{}','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','actor_a',100);
    INSERT INTO approval_evidence_refs VALUES('evidence_a','org_a','project_a','recommendation_a','artifact','artifact_a','bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',90,200,'{}',100);
    INSERT INTO approval_change_sets VALUES('change_a','recommendation_a',1,'page','/home','before','after','[]',1,100);
    INSERT INTO approval_policies VALUES('policy_a','org_a','project_a','audit.run','production','high','require_approval',1,1,100);
    INSERT INTO approval_governed_decisions VALUES('decision_a','org_a','project_a','recommendation_a',1,'actor_a','human','approve','Reviewed','policy_a',1,'correlation_a',110);
  `);
  return db;
}

test("approval governance schema stores the complete governed lifecycle", () => {
  const db = fixture();
  const names = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'approval_%'")
    .all<{ name: string }>()
    .results.map(({ name }) => name);
  assert.deepEqual(
    new Set(names),
    new Set([
      "approval_recommendations",
      "approval_recommendation_versions",
      "approval_evidence_refs",
      "approval_change_sets",
      "approval_policies",
      "approval_assignments",
      "approval_governed_decisions",
      "approval_executions",
      "approval_verifications",
      "approval_rollbacks",
    ]),
  );
});

test("versioned approval evidence, change sets, policies, and decisions are immutable", () => {
  const db = fixture();
  for (const [table, error] of [
    ["approval_recommendation_versions", "APPROVAL_VERSION_IMMUTABLE"],
    ["approval_evidence_refs", "APPROVAL_EVIDENCE_IMMUTABLE"],
    ["approval_change_sets", "APPROVAL_CHANGE_SET_IMMUTABLE"],
    ["approval_policies", "APPROVAL_POLICY_IMMUTABLE"],
    ["approval_governed_decisions", "APPROVAL_DECISION_IMMUTABLE"],
  ] as const) {
    assert.throws(() => db.prepare(`DELETE FROM ${table}`).run(), new RegExp(error));
  }
});

test("approval references cannot cross organization or project boundaries", () => {
  const db = fixture();
  assert.throws(
    () =>
      db
        .prepare("INSERT INTO approval_evidence_refs VALUES(?,?,?,?,?,?,?,?,?,?,?)")
        .bind(
          "evidence_cross_tenant",
          "org_b",
          "project_b",
          "recommendation_a",
          "public",
          "url_a",
          "c".repeat(64),
          90,
          200,
          "{}",
          100,
        )
        .run(),
    /FOREIGN KEY constraint failed/,
  );
  assert.throws(
    () => db.exec("INSERT INTO approval_executions VALUES('execution_cross','org_b','project_b','recommendation_a','decision_a','task_a','queued','key_cross',100,100)"),
    /FOREIGN KEY constraint failed/,
  );
});

test("PostgreSQL approval migration enforces immutable history and least privilege", async () => {
  const migration = await readFile(
    new URL("../platform/adapters/postgres/migrations/0014_expand_approval_governance.sql", import.meta.url),
    "utf8",
  );
  for (const table of [
    "recommendations",
    "recommendation_versions",
    "evidence_refs",
    "change_sets",
    "policies",
    "assignments",
    "decisions",
    "executions",
    "verifications",
    "rollbacks",
  ]) {
    assert.match(migration, new RegExp(`CREATE TABLE approvals\\.${table}\\(`));
  }
  assert.match(migration, /approval_policies_no_mutation/);
  assert.match(migration, /GRANT SELECT,INSERT ON approvals\.recommendation_versions/);
  assert.doesNotMatch(migration, /GRANT[^;]*UPDATE[^;]*approvals\.decisions/);
  assert.match(migration, /FOREIGN KEY\(organization_id,project_id,decision_id\)/);
});
