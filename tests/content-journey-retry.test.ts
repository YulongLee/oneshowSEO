import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { AppDatabase } from '../lib/database';
import { ensureAuthSchema } from '../lib/auth';
import { ensureProductSchema } from '../lib/product';
import { ensureBillingSchema, commerceRepository } from '../lib/billing';
import { atomicTaskCreationService, executionRepository, executionWorkerSupervisor } from '../lib/execution';
import { contentWorkerHandler } from '../lib/production-worker';
import { contentStudioData } from '../lib/content-studio';
import { permissions } from '../platform/modules/identity/authorization';

test('content retry survives finalized metering and the UI follows the actual task state', async()=>{
 const db=new AppDatabase(new DatabaseSync(':memory:'));globalThis.__oneShowSeoDatabase=db;const now=Math.floor(Date.now()/1000);let clock=now;
 await ensureAuthSchema(db);
 db.prepare("INSERT INTO users(id,email,name,password_hash,role,status,plan,trial_ends_at,email_verified_at,created_at,updated_at) VALUES ('retry-owner','retry@example.com','Retry Owner','hash','user','active','trial',?,?,?,?)").bind(now+86400,now,now,now).run();
 await ensureAuthSchema(db);await ensureProductSchema();
 db.prepare("INSERT INTO projects(id,user_id,name,site_url,host,market,language,timezone,business_goal,approval_mode,schedule_enabled,created_at,updated_at,organization_id,slug,status,business_type,search_engines,version) VALUES ('retry-project','retry-owner','Retry Project','https://example.com/','example.com','CN','zh-CN','Asia/Shanghai','organic_growth','required',0,?,?,'org_retry-owner','retry-project','active','website','[\"google\"]',1)").bind(now,now).run();
 await ensureBillingSchema();
 const subject={accountId:'retry-owner',organizationId:'org_retry-owner',organizationStatus:'trial' as const,planKey:'trial' as const,trialEndsAt:now+86400,accountCreatedAt:now};
 const created=(await atomicTaskCreationService()).create({activeOrganizationId:subject.organizationId,organizationId:subject.organizationId,projectId:'retry-project',requestedByAccountId:subject.accountId,role:'owner',permission:permissions.contentCreate,subject,triggerType:'manual',taskType:'content_agent',capability:'content.generate',input:{projectId:'retry-project',title:'技术面试准备指南',keyword:'技术面试',contentType:'guide',audience:'应届生',intent:'信息型',tone:'专业',goal:'内容增长',sourceRef:'https://example.com/',brief:'提供可审核的结构化草稿'},locale:'zh-CN',idempotencyKey:'journey:retry:case',correlationId:'journey:retry:case',entitlements:[],creditCost:20,queue:'agents',jobType:'content.generate',priority:65,maxAttempts:2,timeoutSeconds:60});
 const originalRoot=process.env.OBJECT_STORAGE_ROOT, originalSecret=process.env.OBJECT_STORAGE_SIGNING_SECRET;
 try{
  delete process.env.OBJECT_STORAGE_ROOT;delete process.env.OBJECT_STORAGE_SIGNING_SECRET;
  const supervisor=await executionWorkerSupervisor({'content.generate':contentWorkerHandler()},{workerId:'journey-test',queue:'agents',concurrency:1,pollIntervalMs:10,leaseSeconds:10,heartbeatIntervalMs:100,shutdownGraceMs:100,maintenanceLimit:10,baseBackoffSeconds:1,maxBackoffSeconds:10},{now:()=>clock});
  assert.equal(await supervisor.runOne(),true);
  assert.equal(executionRepository().task(subject.organizationId,created.task.id)?.state,'retrying');
  assert.equal((await contentStudioData(subject.organizationId,'retry-project')).runs[0].status,'retrying');
  assert.equal(commerceRepository().usageByIdempotency(subject.organizationId,`content:${created.task.id}:generated`)?.state,'final');
  process.env.OBJECT_STORAGE_ROOT=await mkdtemp(path.join(os.tmpdir(),'journey-retry-'));process.env.OBJECT_STORAGE_SIGNING_SECRET='journey-retry-signing-key-long-enough';clock+=5;
  assert.equal(await supervisor.runOne(),true);
  assert.equal(executionRepository().task(subject.organizationId,created.task.id)?.state,'completed');
  const studio=await contentStudioData(subject.organizationId,'retry-project');assert.equal(studio.versions.length,1);assert.equal(studio.runs[0].status,'completed');
  assert.equal(db.prepare("SELECT COUNT(*) n FROM commerce_usage_events WHERE task_id=?").bind(created.task.id).first<{n:number}>()?.n,1);
  assert.equal(commerceRepository().terminalForReservation(subject.organizationId,created.reservationId!)?.entryType,'commit');
 }finally{if(originalRoot===undefined)delete process.env.OBJECT_STORAGE_ROOT;else process.env.OBJECT_STORAGE_ROOT=originalRoot;if(originalSecret===undefined)delete process.env.OBJECT_STORAGE_SIGNING_SECRET;else process.env.OBJECT_STORAGE_SIGNING_SECRET=originalSecret;}
});
