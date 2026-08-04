import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const schemaSql = await readFile(
  new URL("../platform/adapters/postgres/migrations/0001_expand_commercial_foundation.sql", import.meta.url),
  "utf8",
);

test("commercial foundation migration owns every required bounded schema", () => {
  for (const schema of ["identity", "project_governance", "commerce", "operations"]) {
    assert.match(schemaSql, new RegExp(`CREATE SCHEMA IF NOT EXISTS ${schema}`));
  }
});

test("commercial foundation creates tenant-scoped tables and indexes", () => {
  for (const table of [
    "identity.organizations",
    "identity.memberships",
    "identity.roles",
    "identity.invitations",
    "identity.sessions",
    "project_governance.projects",
    "project_governance.project_access",
    "commerce.entitlements",
    "commerce.ledger_entries",
    "operations.audit_events",
    "operations.feature_flags",
  ]) {
    assert.match(schemaSql, new RegExp(`CREATE TABLE ${table.replace(".", "\\.")}`));
  }
  assert.match(schemaSql, /CREATE INDEX memberships_organization_status_idx/);
  assert.match(schemaSql, /CREATE INDEX projects_organization_status_idx/);
  assert.match(schemaSql, /CREATE INDEX ledger_entries_organization_unit_time_idx/);
  assert.match(schemaSql, /CREATE INDEX audit_events_organization_time_idx/);
});

test("commercial foundation grants no schema creation to runtime roles", () => {
  assert.doesNotMatch(schemaSql, /GRANT\s+CREATE\s+ON\s+SCHEMA[\s\S]+oneshowseo_(app|worker)/i);
  assert.match(schemaSql, /GRANT USAGE ON SCHEMA identity, project_governance, commerce, operations TO oneshowseo_app/);
});
