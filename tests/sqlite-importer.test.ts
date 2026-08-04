import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

function fixture(orphanProject = false): string {
  const directory = mkdtempSync(path.join(os.tmpdir(), "oneshowseo-import-"));
  const filename = path.join(directory, "source.sqlite");
  const database = new DatabaseSync(filename);
  database.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY,email TEXT,name TEXT,password_hash TEXT,status TEXT,plan TEXT,trial_ends_at INTEGER,email_verified_at INTEGER,last_login_at INTEGER,created_at INTEGER,updated_at INTEGER);
    CREATE TABLE sessions (id TEXT PRIMARY KEY,user_id TEXT,expires_at INTEGER,created_at INTEGER);
    CREATE TABLE projects (id TEXT PRIMARY KEY,user_id TEXT,name TEXT,site_url TEXT,host TEXT,market TEXT,language TEXT,timezone TEXT,business_goal TEXT,approval_mode TEXT,created_at INTEGER,updated_at INTEGER);
    CREATE TABLE project_members (project_id TEXT,user_id TEXT,role TEXT,status TEXT,created_at INTEGER,updated_at INTEGER);
    CREATE TABLE project_invites (id TEXT PRIMARY KEY,project_id TEXT,email TEXT,role TEXT,status TEXT,invited_by TEXT,expires_at INTEGER,created_at INTEGER,updated_at INTEGER);
    CREATE TABLE audit_logs (id TEXT PRIMARY KEY,user_id TEXT,action TEXT,detail TEXT,ip TEXT,created_at INTEGER);
    CREATE TABLE platform_feature_flags (id TEXT PRIMARY KEY,flag_key TEXT,enabled INTEGER,scope TEXT,scope_value TEXT,version INTEGER,active INTEGER,created_at INTEGER,updated_at INTEGER);
    CREATE TABLE platform_audit_events (id TEXT PRIMARY KEY,actor_id TEXT,organization_id TEXT,action TEXT,target_type TEXT,target_id TEXT,reason TEXT,outcome TEXT,detail TEXT,correlation_id TEXT,created_at INTEGER);
  `);
  database.prepare("INSERT INTO users VALUES (?,?,?,?,?,?,?,?,?,?,?)").run("user-1", "user@example.com", "User", "hash", "active", "trial", null, 1, null, 1, 1);
  database.prepare("INSERT INTO projects VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").run("project-1", orphanProject ? "missing" : "user-1", "Project", "https://example.com/", "example.com", "US", "en", "UTC", "growth", "required", 1, 1);
  database.close();
  return filename;
}

function dryRun(filename: string) {
  return spawnSync(
    process.execPath,
    ["--import", "tsx", "platform/adapters/postgres/import-sqlite.ts", "dry-run"],
    { cwd: process.cwd(), env: { ...process.env, SQLITE_SOURCE_PATH: filename }, encoding: "utf8" },
  );
}

test("SQLite importer dry-run produces stable counts and hashes without writes", () => {
  const filename = fixture();
  try {
    const result = dryRun(filename);
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout.trim().split("\n").at(-1)!);
    assert.equal(report.command, "dry-run");
    assert.equal(report.tables.users.rows, 1);
    assert.equal(report.tables.projects.rows, 1);
    assert.deepEqual(report.ownershipIssues, []);
    assert.match(report.sourceSnapshotHash, /^[a-f0-9]{64}$/);
  } finally {
    rmSync(path.dirname(filename), { recursive: true, force: true });
  }
});

test("SQLite importer refuses an orphaned project before PostgreSQL writes", () => {
  const filename = fixture(true);
  try {
    const result = dryRun(filename);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /IMPORT_OWNERSHIP_VALIDATION_FAILED/);
  } finally {
    rmSync(path.dirname(filename), { recursive: true, force: true });
  }
});
