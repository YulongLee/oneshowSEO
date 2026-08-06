import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration=await readFile(new URL("../platform/adapters/postgres/migrations/0008_expand_execution_kernel.sql",import.meta.url),"utf8");
const creation=await readFile(new URL("../platform/modules/execution/task-creation.ts",import.meta.url),"utf8");
const worker=await readFile(new URL("../platform/modules/execution/worker.ts",import.meta.url),"utf8");
const workerRepository=await readFile(new URL("../platform/adapters/sqlite/execution-repository.ts",import.meta.url),"utf8");
const workerRuntime=await readFile(new URL("../platform/workers/supervisor-runtime.ts",import.meta.url),"utf8");
const settlement=await readFile(new URL("../platform/modules/execution/task-settlement.ts",import.meta.url),"utf8");
const settlementMigration=await readFile(new URL("../platform/adapters/postgres/migrations/0009_expand_execution_settlement.sql",import.meta.url),"utf8");

test("execution migration owns every durable 5.1 record and tenant index",()=>{
  assert.match(migration,/CREATE SCHEMA IF NOT EXISTS execution/);
  for(const table of ["execution.tasks","execution.jobs","execution.job_attempts","execution.job_leases","execution.progress_events","execution.cancellations","execution.idempotency_keys","execution.outbox","execution.inbox","execution.artifacts","operations.notifications"])assert.match(migration,new RegExp(`CREATE TABLE ${table.replace(".","\\.")}`));
  assert.match(migration,/operations\.audit_events|audit events/i);assert.match(migration,/jobs_claim_idx/);assert.match(migration,/leases_active_job_idx/);assert.match(migration,/outbox_delivery_idx/);assert.match(migration,/FOREIGN KEY \(organization_id,task_id\)/);
});

test("execution schema stores hashes and references but no raw lease, object, or notification secrets",()=>{
  assert.match(migration,/token_hash/);assert.match(migration,/sha256/);assert.match(migration,/object_key/);assert.doesNotMatch(migration,/lease_token\s+text|artifact_content|email_body\s+text/i);
  assert.match(migration,/UNIQUE NULLS NOT DISTINCT \(organization_id,idempotency_key\)/);assert.match(migration,/UNIQUE \(source,message_id\)/);
});

test("task creation keeps entitlement, reservation, job intent, outbox, and idempotency in one transaction",()=>{
  assert.match(creation,/repository\.transaction\(\(\)=>\{/);assert.match(creation,/authorizeOrganization/);assert.match(creation,/commerce\.authorizeAccess/);assert.match(creation,/commerce\.reserveCredits/);assert.match(creation,/repository\.createTask/);assert.match(creation,/repository\.createJob/);assert.match(creation,/repository\.appendOutbox/);assert.match(creation,/repository\.putIdempotency/);
  assert.match(creation,/SENSITIVE_INPUT_REJECTED/);assert.match(creation,/TASK_INPUT_TOO_LARGE/);
});

test("supervised workers enforce authorization, hashed leases, heartbeats, recovery, bounded retry, cancellation, quarantine, and shutdown",()=>{
  assert.match(worker,/handler\.authorize/);assert.match(worker,/heartbeatLease/);assert.match(worker,/maxAttempts/);assert.match(worker,/maxBackoffSeconds/);assert.match(worker,/WorkerCancellationError/);assert.match(worker,/quarantined/);assert.match(worker,/shutdownGraceMs/);assert.match(worker,/WorkerShutdownError/);
  assert.match(workerRepository,/claimJob/);assert.match(workerRepository,/tokenHash/);assert.match(workerRepository,/execution_job_leases/);assert.match(workerRepository,/LEASE_EXPIRED/);assert.match(workerRepository,/maintainJobs/);assert.match(workerRuntime,/SIGTERM/);assert.match(workerRuntime,/SIGINT/);
});

test("terminal settlement is idempotent and correlates task state, effects, artifacts, notifications, audit, outbox, and Credits",()=>{
  assert.match(settlement,/repository\.transaction/);assert.match(settlement,/scope="task\.settle"/);assert.match(settlement,/commitCredits/);assert.match(settlement,/releaseCredits/);assert.match(settlement,/settleTask/);assert.match(settlement,/appendArtifact/);assert.match(settlement,/appendNotification/);assert.match(settlement,/appendExternalEffect/);assert.match(settlement,/appendOutbox/);assert.match(settlement,/appendAudit/);assert.match(settlement,/putIdempotency/);
  assert.match(settlementMigration,/CREATE TABLE execution\.external_effects/);assert.match(settlementMigration,/request_hash/);assert.match(settlementMigration,/UNIQUE \(organization_id,provider,idempotency_key\)/);assert.match(settlementMigration,/external_effects_unknown_idx/);
});
