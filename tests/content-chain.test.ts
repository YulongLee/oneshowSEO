import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AppDatabase } from "../lib/database";
import { contentProjectAllowed } from "../lib/content-access";
import { SafeHttpError } from "../platform/modules/integrations/safe-http";
import { ensureAuthSchema } from "../lib/auth";
import { ensureProductSchema } from "../lib/product";
import { ensureBillingSchema,commerceRepository } from "../lib/billing";
import { atomicTaskCreationService,executionRepository,executionWorkerSupervisor } from "../lib/execution";
import { contentWorkerHandler,publishWorkerHandler } from "../lib/production-worker";
import { createContentBrief } from "../lib/content-planning";
import { blockingContentChecks,ensureContentWorkflow,saveWorkflowVersion,submitVersion,decideContentVersion,workflowVersion } from "../lib/content-workflow";
import { ensurePublishSchema,publishDashboard,queueApprovedPublish,executePublishAgent,markdownToHtml } from "../lib/publish-execution";
import { integrationRepository,publishWordpressPost } from "../lib/integrations";
import { verifiedWordpressPublication } from "../lib/wordpress-publication";
import { permissions } from "../platform/modules/identity/authorization";

const opts={workerId:"chain-worker",queue:"agents",concurrency:1,pollIntervalMs:10,leaseSeconds:10,heartbeatIntervalMs:100,shutdownGraceMs:100,maintenanceLimit:10,baseBackoffSeconds:1,maxBackoffSeconds:10};
test("review blocks structural and safety failures but allows human-confirmed optimization warnings",()=>{
 assert.equal(blockingContentChecks(JSON.stringify([{key:"keyword",status:"warning"},{key:"source",status:"warning"}])).length,0);
 assert.equal(blockingContentChecks(JSON.stringify([{key:"structure",status:"warning"},{key:"safe_markup",status:"pass"}])).length,1);
 assert.equal(blockingContentChecks("invalid").length,1);
});
test("plan -> generate A -> edit B -> approve B -> publish frozen B after C, settle exactly once",async()=>{
 const sqlite=new DatabaseSync(":memory:");sqlite.exec("PRAGMA foreign_keys=ON");const db=new AppDatabase(sqlite);globalThis.__oneShowSeoDatabase=db;
 const now=Math.floor(Date.now()/1000);await ensureAuthSchema(db);
 db.prepare("INSERT INTO users(id,email,name,password_hash,role,status,plan,trial_ends_at,email_verified_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)").bind("chain-account","chain@example.com","Chain Owner","hash","user","active","trial",now+86400,now,now-100,now).run();
 await ensureAuthSchema(db);await ensureProductSchema();
 db.prepare("INSERT INTO projects(id,user_id,name,site_url,host,market,language,timezone,business_goal,approval_mode,schedule_enabled,created_at,updated_at,organization_id,slug,status,business_type,search_engines,version) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind("chain-project","chain-account","Chain","https://example.com/","example.com","CN","zh-CN","Asia/Shanghai","自然增长","required",0,now,now,"org_chain-account","chain","active","website",'["google"]',1).run();
 await ensureBillingSchema();ensureContentWorkflow(db);const plan=createContentBrief({organizationId:"org_chain-account",accountId:"chain-account",projectId:"chain-project",opportunityId:null,topic:"SEO 内容指南",primaryKeyword:"SEO",secondaryKeywords:[],audience:"网站负责人",searchIntent:"信息型",contentGoal:"自然增长",contentType:"guide",suggestedWordCount:800,outline:["简介","步骤"],targetPlatforms:["官网"],priority:65,scheduledAt:null});
 const root=await mkdtemp(path.join(os.tmpdir(),"oneshowseo-chain-"));process.env.OBJECT_STORAGE_ROOT=root;process.env.OBJECT_STORAGE_SIGNING_SECRET="chain-test-object-signing-secret-long-enough";
 const subject={accountId:"chain-account",organizationId:"org_chain-account",organizationStatus:"trial" as const,planKey:"trial" as const,trialEndsAt:now+86400,accountCreatedAt:now-100};
 const creator=await atomicTaskCreationService(),input={projectId:"chain-project",title:"SEO 内容指南",keyword:"SEO",contentType:"guide",audience:"网站负责人",intent:"信息型",tone:"专业",goal:"自然增长",sourceRef:"https://example.com/research",brief:"请覆盖可验证的步骤",planId:plan.planId,briefId:plan.briefId};
 const command={activeOrganizationId:subject.organizationId,organizationId:subject.organizationId,projectId:"chain-project",requestedByAccountId:subject.accountId,role:"owner" as const,permission:permissions.contentCreate,subject,triggerType:"manual" as const,taskType:"content_agent",capability:"content.generate",input,locale:"zh-CN" as const,idempotencyKey:"chain:content:stable-task",correlationId:"chain:content",entitlements:[],creditCost:20,queue:"agents",jobType:"content.generate",priority:65,maxAttempts:1,timeoutSeconds:60};
 const task=creator.create(command);assert.equal(creator.create(command).task.id,task.task.id);
 db.prepare("INSERT INTO content_plan_runs VALUES(?,?,?,?,?,?)").bind(task.task.id,subject.organizationId,"chain-project",plan.briefId,plan.planId,now).run();
 await(await executionWorkerSupervisor({"content.generate":contentWorkerHandler()},opts)).runOne();
 assert.equal(executionRepository().task(subject.organizationId,task.task.id)?.state,"completed");
 const a=db.prepare("SELECT id,body FROM content_versions WHERE run_id=?").bind(task.task.id).first<{id:string;body:string}>()!;
 assert.equal(workflowVersion(db,subject.organizationId,"chain-project",a.id)?.reviewStatus,"draft");
 assert.equal(db.prepare("SELECT status FROM content_briefs WHERE id=?").bind(plan.briefId).first<{status:string}>()?.status,"REVIEW");
 const b=saveWorkflowVersion(db,{organizationId:subject.organizationId,projectId:"chain-project",runId:task.task.id,accountId:subject.accountId,body:a.body+"\n\n## 编辑后的 B 版本\n\n这里是编辑者确认的新正文。",expectedVersion:1});
 assert.throws(()=>submitVersion(db,{organizationId:subject.organizationId,projectId:"chain-project",versionId:b.id,accountId:subject.accountId,factsConfirmed:false}),/核验/);
 assert.throws(()=>submitVersion(db,{organizationId:"other-org",projectId:"chain-project",versionId:b.id,accountId:subject.accountId,factsConfirmed:true}),/不存在/);
 const submitted=submitVersion(db,{organizationId:subject.organizationId,projectId:"chain-project",versionId:b.id,accountId:subject.accountId,factsConfirmed:true});
 decideContentVersion(db,{organizationId:subject.organizationId,projectId:"chain-project",taskId:submitted.reviewTaskId!,accountId:subject.accountId,action:"approve",note:"事实核验完成"});
 const integrations=await integrationRepository();integrations.appendConnection({id:"chain-cms",organizationId:subject.organizationId,projectId:"chain-project",providerId:"wordpress",authMethod:"api_key",environment:"staging",state:"connected",grantedScopes:["content.write"],ownerAccountId:subject.accountId,maskedHint:"test",metadata:{baseUrl:"https://example.com"},health:null,lastSyncedAt:null,revision:1,createdAt:now,updatedAt:now,disconnectedAt:null,deletedAt:null});
 await ensurePublishSchema();
 const candidate=publishDashboard(subject.organizationId,"chain-project").candidates[0] as {artifactId:string;ready:number;versionId:string};assert.equal(candidate.ready,1);assert.equal(candidate.versionId,b.id);
 db.prepare("INSERT INTO publish_requests(id,organization_id,project_id,content_task_id,artifact_id,connection_id,provider,title,slug,excerpt,status,verification_status,created_at,updated_at,version_id,body_hash) VALUES(?,?,?,?,?,?,'wordpress',?,?,?,'awaiting_approval','pending',?,?,?,?)").bind("chain-publication",subject.organizationId,"chain-project",task.task.id,candidate.artifactId,"chain-cms",input.title,"chain-article","",now,now,b.id,b.bodyHash).run();
 const approved={organizationId:subject.organizationId,projectId:"chain-project",requestId:"chain-publication",accountId:subject.accountId,role:"owner" as const,subject,locale:"zh-CN" as const};
 const publication=await queueApprovedPublish(approved);assert.equal((await queueApprovedPublish(approved)).taskId,publication.taskId);
 const c=saveWorkflowVersion(db,{organizationId:subject.organizationId,projectId:"chain-project",runId:task.task.id,accountId:subject.accountId,body:b.body+"\n\n## 尚未批准的 C 版本",expectedVersion:2});
 assert.equal(c.reviewStatus,"draft");assert.equal((publishDashboard(subject.organizationId,"chain-project").candidates[0] as {ready:number}).ready,0);
 let received="",calls=0;
 const fakePublish:typeof publishWordpressPost=async data=>{received=data.html;calls++;return{externalId:"42",url:"https://example.com/chain-article",status:"publish",verified:true,attempts:1};};
 const runner=await executionWorkerSupervisor({"content.publish":publishWorkerHandler({executePublish:(data,ctx,signal)=>executePublishAgent(data,ctx,signal,{publish:fakePublish})})},opts);
 assert.equal(await runner.runOne(),true);assert.equal(await runner.runOne(),false);
 assert.equal(received,markdownToHtml(b.body));assert.ok(!received.includes("尚未批准的 C"));assert.equal(calls,1);
 assert.equal(executionRepository().task(subject.organizationId,publication.taskId)?.state,"completed");
 assert.equal(db.prepare("SELECT status FROM content_plans WHERE id=?").bind(plan.planId).first<{status:string}>()?.status,"PUBLISHED");
 assert.equal(commerceRepository().terminalForReservation(subject.organizationId,task.reservationId!)?.entryType,"commit");
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM execution_external_effects WHERE task_id=?").bind(publication.taskId).first<{n:number}>()?.n,1);
});

const response=(value:unknown)=>({body:new TextEncoder().encode(JSON.stringify(value)),status:200,headers:{},attempts:1,url:"https://example.com"});
test("CMS success then lost response reconciles without a second POST",async()=>{
 const db=new AppDatabase(new DatabaseSync(":memory:"));let postCount=0,saved:Record<string,unknown>|null=null;
 const input={key:"recovery",base:"https://example.com",title:"Title",slug:"stable-slug",excerpt:"",html:"<h1>Verified body</h1>",correlationId:"recovery"};
 const request=async(req:{method?:string;url:string;body?:unknown})=>{
   if(req.method==='POST'){postCount++;saved={id:5,status:"publish",title:{raw:input.title},content:{raw:input.html},link:"https://example.com/stable-slug"};throw new Error("connection lost after CMS commit");}
   return response(saved?[saved]:[]);
 };
 await assert.rejects(verifiedWordpressPublication(db,input,request as never),/connection lost/);
 const result=await verifiedWordpressPublication(db,input,request as never);assert.equal(result.verified,true);assert.equal(postCount,1);
});
test("unconfirmed write does not blindly retry and wrong existing content is rejected",async()=>{
 const db=new AppDatabase(new DatabaseSync(":memory:")),input={key:"uncertain",base:"https://example.com",title:"Title",slug:"stable",excerpt:"",html:"body",correlationId:"uncertain"};let count=0;
 const request=async(req:{method?:string})=>{if(req.method==='POST'){count++;throw new Error("timeout");}return response([]);};
 await assert.rejects(verifiedWordpressPublication(db,input,request as never),/timeout/);
 await assert.rejects(verifiedWordpressPublication(db,input,request as never),/PUBLISH_CONFIRMATION_PENDING/);assert.equal(count,1);
 await assert.rejects(verifiedWordpressPublication(db,{...input,key:"other"},async()=>response([{id:6,status:"draft",title:{raw:"Title"},content:{raw:"body"}}]) as never),/MISMATCH/);
});
test("markdown output escapes link attributes and HTML",()=>{
 const html=markdownToHtml('# Heading\n\n[link](https://example.com/"onmouseover="alert)\n<script>alert(1)</script>');
 assert.ok(!html.includes('<script>'));assert.ok(!html.includes('"onmouseover="'));
});

test("definite CMS authorization rejection permits a corrected retry",async()=>{
 const db=new AppDatabase(new DatabaseSync(":memory:"));const input={key:"rejected",base:"https://example.com",title:"Title",slug:"stable",excerpt:"",html:"body",correlationId:"rejected"};let count=0;
 const request=async(req:{method?:string})=>{if(req.method==='POST'){count++;throw new SafeHttpError({code:"PROVIDER_REJECTED",category:"provider",retryable:false,retryAfterSeconds:null,messageKey:"unauthorized",remediation:"reauthorize",correlationId:"rejected"});}return response([]);};
 await assert.rejects(verifiedWordpressPublication(db,input,request as never),/unauthorized/);
 await assert.rejects(verifiedWordpressPublication(db,input,request as never),/unauthorized/);assert.equal(count,2);
});
test("content access enforces active membership, organization and selected project scope",async()=>{
 const db=globalThis.__oneShowSeoDatabase!;
 const member=db.prepare("SELECT id FROM identity_memberships WHERE user_id='chain-account'").first<{id:string}>()!;
 const user={organization:{membershipId:member.id,organizationId:"org_chain-account"}} as Parameters<typeof contentProjectAllowed>[0];
 assert.equal(contentProjectAllowed(user,"chain-project"),true);
 db.prepare("UPDATE identity_memberships SET project_scope=? WHERE id=?").bind('["chain-project"]',member.id).run();
 assert.equal(contentProjectAllowed(user,"chain-project"),true);assert.equal(contentProjectAllowed(user,"other-project"),false);
 assert.equal(contentProjectAllowed({...user,organization:{...user.organization,organizationId:"other-org"}},"chain-project"),false);
 db.prepare("UPDATE identity_memberships SET status='suspended' WHERE id=?").bind(member.id).run();assert.equal(contentProjectAllowed(user,"chain-project"),false);
});
