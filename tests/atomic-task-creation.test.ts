import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { ensureAuthSchema } from "../lib/auth";
import { AppDatabase } from "../lib/database";
import { SqliteCommerceRepository } from "../platform/adapters/sqlite/commerce-repository";
import { SqliteExecutionProjectGate } from "../platform/adapters/sqlite/execution-project-gate";
import { SqliteExecutionRepository } from "../platform/adapters/sqlite/execution-repository";
import type { ExecutionRepository } from "../platform/modules/execution";
import { AtomicTaskCreationService, TaskCreationError, type AtomicTaskCreationInput } from "../platform/modules/execution/task-creation";
import { AuthorizationError, permissions } from "../platform/modules/identity/authorization";
import { CommerceError, CommercialEntitlementService } from "../platform/modules/commerce/service";

async function fixture(){const sqlite=new DatabaseSync(":memory:");sqlite.exec("PRAGMA foreign_keys=ON");const database=new AppDatabase(sqlite);await ensureAuthSchema(database);const now=1_786_300_000;
  database.prepare("INSERT INTO users(id,email,name,password_hash,role,status,plan,trial_ends_at,email_verified_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)").bind("account_a","owner@example.com","Owner","hash","user","active","trial",now+14*86400,now,now-100,now-100).run();await ensureAuthSchema(database);
  database.exec("CREATE TABLE projects(id TEXT PRIMARY KEY,organization_id TEXT NOT NULL REFERENCES identity_organizations(id),status TEXT NOT NULL);INSERT INTO projects VALUES ('project_a','org_account_a','active')");
  const commerceRepository=new SqliteCommerceRepository(database),commerce=new CommercialEntitlementService(commerceRepository,()=>now),execution=new SqliteExecutionRepository(database),projects=new SqliteExecutionProjectGate(database),service=new AtomicTaskCreationService(execution,commerce,projects,()=>now);
  return{sqlite,database,commerceRepository,commerce,execution,projects,service,now};}

function request(now:number,overrides:Partial<AtomicTaskCreationInput>={}):AtomicTaskCreationInput{return{activeOrganizationId:"org_account_a",organizationId:"org_account_a",projectId:"project_a",requestedByAccountId:"account_a",role:"owner",permission:permissions.auditsRun,subject:{accountId:"account_a",organizationId:"org_account_a",organizationStatus:"trial",planKey:"trial",trialEndsAt:now+14*86400,accountCreatedAt:now-100},triggerType:"manual",taskType:"seo_audit",capability:"audit.run",input:{depth:2,includeSitemaps:true},locale:"zh-CN",idempotencyKey:"audit-request-1",correlationId:"correlation-1",entitlements:[{key:"pagesPerMonth",quantity:10,currentUsage:0},{key:"pagesPerAudit",quantity:10,currentUsage:0}],creditCost:100,queue:"seo",jobType:"audit",priority:70,maxAttempts:3,timeoutSeconds:900,...overrides};}

test("atomic creation writes authorization-backed task, reservation, job, outbox, idempotency, and audit",async()=>{const{database,commerceRepository,execution,service,now}=await fixture();const result=service.create(request(now));
  assert.equal(result.duplicate,false);assert.equal(result.task.state,"queued");assert.equal(result.job.taskId,result.task.id);assert.equal(result.outbox.payload.taskId,result.task.id);assert.equal(result.reservationId!==null,true);
  assert.equal(execution.task("org_account_a",result.task.id)?.capability,"audit.run");assert.equal(execution.job("org_account_a",result.job.id)?.state,"queued");assert.equal(execution.pendingOutbox(10,now).length,1);assert.equal(execution.auditEvents("org_account_a",10)[0].targetId,result.task.id);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM execution_idempotency_keys").first<{count:number}>()?.count,1);assert.equal(database.prepare("SELECT COUNT(*) AS count FROM commerce_credit_ledger WHERE entry_type='reservation'").first<{count:number}>()?.count,1);assert.equal(commerceRepository.creditBalance("org_account_a",now).available,900);
});

test("equivalent retries return the existing task while payload drift is rejected",async()=>{const{database,service,now}=await fixture();const first=service.create(request(now)),retry=service.create(request(now));assert.equal(retry.duplicate,true);assert.equal(retry.task.id,first.task.id);assert.equal(retry.job.id,first.job.id);assert.equal(retry.reservationId,first.reservationId);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM execution_tasks").first<{count:number}>()?.count,1);assert.equal(database.prepare("SELECT COUNT(*) AS count FROM execution_jobs").first<{count:number}>()?.count,1);assert.equal(database.prepare("SELECT COUNT(*) AS count FROM commerce_credit_ledger WHERE entry_type='reservation'").first<{count:number}>()?.count,1);
  assert.throws(()=>service.create(request(now,{input:{depth:3,includeSitemaps:true}})),(error:unknown)=>error instanceof TaskCreationError&&error.code==="IDEMPOTENCY_CONFLICT");
});

test("permission, tenant, project, entitlement, and sensitive-input failures create no intent",async()=>{for(const mutate of [
  (value:AtomicTaskCreationInput)=>({...value,role:"viewer" as const}),
  (value:AtomicTaskCreationInput)=>({...value,activeOrganizationId:"org_other"}),
  (value:AtomicTaskCreationInput)=>({...value,entitlements:[{key:"pagesPerAudit" as const,quantity:1,currentUsage:10}]}),
  (value:AtomicTaskCreationInput)=>({...value,input:{apiToken:"must-not-persist"}}),
]){const{database,service,now}=await fixture();assert.throws(()=>service.create(mutate(request(now))),(error:unknown)=>error instanceof AuthorizationError||error instanceof CommerceError||error instanceof TaskCreationError);assert.equal(database.prepare("SELECT COUNT(*) AS count FROM execution_tasks").first<{count:number}>()?.count,0);assert.equal(database.prepare("SELECT COUNT(*) AS count FROM commerce_credit_ledger").first<{count:number}>()?.count,0);}
  const{database,service,now}=await fixture();database.prepare("UPDATE projects SET status='archived' WHERE id='project_a'").run();assert.throws(()=>service.create(request(now)),/PROJECT_NOT_ACTIVE/);assert.equal(database.prepare("SELECT COUNT(*) AS count FROM execution_tasks").first<{count:number}>()?.count,0);
});

test("a dependent persistence failure rolls back nested commerce grants and reservations",async()=>{const{database,commerce,execution,projects,now}=await fixture();const failing=new Proxy(execution,{get(target,property,receiver){if(property==="createTask")return()=>{throw new Error("INJECTED_TASK_WRITE_FAILURE")};const value=Reflect.get(target,property,receiver);return typeof value==="function"?value.bind(target):value;}}) as ExecutionRepository;const service=new AtomicTaskCreationService(failing,commerce,projects,()=>now);
  assert.throws(()=>service.create(request(now)),/INJECTED_TASK_WRITE_FAILURE/);for(const table of ["commerce_subscriptions","commerce_credit_ledger","execution_tasks","execution_jobs","execution_outbox","execution_idempotency_keys","operations_audit_events"])assert.equal(database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first<{count:number}>()?.count,0,table);
});
