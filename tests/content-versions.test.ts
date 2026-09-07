import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { AppDatabase } from "../lib/database";
import { ContentVersionError, ensureContentVersionSchema, saveContentVersion } from "../lib/content-versions";

function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE projects(id TEXT PRIMARY KEY,organization_id TEXT NOT NULL,status TEXT NOT NULL);
    CREATE TABLE content_runs(id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id),status TEXT NOT NULL);
    INSERT INTO projects VALUES ('project','org','active'),('other-project','other-org','active');
    INSERT INTO content_runs VALUES ('run','project','completed'),('other-run','other-project','completed');`);
  const db = new AppDatabase(sqlite);
  ensureContentVersionSchema(db);
  const input = { organizationId: "org", projectId: "project", runId: "run", accountId: "editor", body: "# 第一稿\n\n正文", expectedVersion: 0 };
  return { db, input, sqlite };
}

test("two editors cannot save against the same base version", () => {
  const { db, input, sqlite } = fixture();
  try {
    const first = saveContentVersion(db, input);
    assert.equal(first.versionNumber, 1);
    assert.throws(() => saveContentVersion(db, { ...input, body: "另一个编辑的正文" }),
      (error: unknown) => error instanceof ContentVersionError && error.code === "CONTENT_VERSION_CONFLICT" && error.status === 409);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM content_versions").first<{count:number}>()?.count, 1);
    const second = saveContentVersion(db, { ...input, expectedVersion: 1, body: "合并后的正文" });
    assert.equal(second.versionNumber, 2);
    assert.equal(db.prepare("SELECT body FROM content_versions WHERE id=?").bind(first.id).first<{body:string}>()?.body, input.body);
  } finally { sqlite.close(); }
});

test("restoring older text creates a new immutable version", () => {
  const { db, input, sqlite } = fixture();
  try {
    const first = saveContentVersion(db, input);
    const second = saveContentVersion(db, { ...input, body: "第二稿", expectedVersion: 1 });
    const restored = saveContentVersion(db, { ...input, body: first.body, expectedVersion: 2 });
    assert.equal(restored.versionNumber, 3);
    assert.notEqual(restored.id, first.id);
    assert.equal(db.prepare("SELECT body FROM content_versions WHERE id=?").bind(second.id).first<{body:string}>()?.body, "第二稿");
  } finally { sqlite.close(); }
});

test("versions cannot be saved across project or organization boundaries", () => {
  const { db, input, sqlite } = fixture();
  try {
    for (const changed of [{ organizationId: "other-org" }, { runId: "other-run" }, { projectId: "other-project" }]) {
      assert.throws(() => saveContentVersion(db, { ...input, ...changed }),
        (error: unknown) => error instanceof ContentVersionError && error.code === "CONTENT_VERSION_NOT_FOUND");
    }
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM content_versions").first<{count:number}>()?.count, 0);
  } finally { sqlite.close(); }
});

test("archived projects and unfinished generation reject edits", () => {
  const { db, input, sqlite } = fixture();
  try {
    db.prepare("UPDATE content_runs SET status='running' WHERE id='run'").run();
    assert.throws(() => saveContentVersion(db, input), ContentVersionError);
    db.prepare("UPDATE content_runs SET status='completed' WHERE id='run'").run();
    db.prepare("UPDATE projects SET status='archived' WHERE id='project'").run();
    assert.throws(() => saveContentVersion(db, input), ContentVersionError);
  } finally { sqlite.close(); }
});

test("invalid and oversized edits are rejected rather than silently truncated", () => {
  const { db, input, sqlite } = fixture();
  try {
    for (const changed of [{ body: " " }, { body: "x".repeat(200001) }, { expectedVersion: -1 }, { expectedVersion: 0.5 }, { expectedVersion: NaN }]) {
      assert.throws(() => saveContentVersion(db, { ...input, ...changed }),
        (error: unknown) => error instanceof ContentVersionError && error.status === 400);
    }
  } finally { sqlite.close(); }
});
