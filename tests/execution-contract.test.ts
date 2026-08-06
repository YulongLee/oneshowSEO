import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration=await readFile(new URL("../platform/adapters/postgres/migrations/0008_expand_execution_kernel.sql",import.meta.url),"utf8");
const creation=await readFile(new URL("../platform/modules/execution/task-creation.ts",import.meta.url),"utf8");

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
