import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { AppDatabase } from "../lib/database";
import { asId } from "../platform/core/ids";
import { SqliteFeatureFlagRepository } from "../platform/adapters/sqlite/feature-flag-repository";

test("feature flag changes are versioned and audited atomically", async () => {
  const database = new AppDatabase(new DatabaseSync(":memory:"));
  const repository = new SqliteFeatureFlagRepository(database);
  const actorId = asId("user-1","UserId");
  const created = await repository.upsert({key:"agents.enabled",enabled:false,scope:"global",scopeValue:"*",reason:"commercial foundation default",actorId,correlationId:"correlation-1"});
  assert.equal(created.version,1);
  assert.equal((await repository.activeRules("agents.enabled"))[0]?.enabled,false);
  const updated = await repository.upsert({key:"agents.enabled",enabled:true,scope:"global",scopeValue:"*",expectedVersion:1,reason:"internal canary",actorId,correlationId:"correlation-2"});
  assert.equal(updated.version,2);
  assert.equal(database.prepare("SELECT COUNT(*) AS total FROM platform_audit_events").first<{total:number}>()?.total,2);
  await assert.rejects(repository.upsert({key:"agents.enabled",enabled:false,scope:"global",scopeValue:"*",expectedVersion:1,reason:"stale write",actorId,correlationId:"correlation-3"}),/VERSION_CONFLICT/);
});

test("feature flag changes require an auditable reason", async () => {
  const repository = new SqliteFeatureFlagRepository(new AppDatabase(new DatabaseSync(":memory:")));
  await assert.rejects(repository.upsert({key:"billing.live",enabled:true,scope:"environment",scopeValue:"production",reason:"",actorId:asId("user-1","UserId"),correlationId:"correlation-1"}),/REASON_REQUIRED/);
});
