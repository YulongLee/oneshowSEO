import { accessibleContentProject } from "../../../../../lib/content-access";
import { contentStudioData } from "../../../../../lib/content-studio";
import { ensureContentWorkflow,saveWorkflowVersion,submitVersion,syncContentPlan,workflowVersion } from "../../../../../lib/content-workflow";
import { ensureContentPlanningSchema } from "../../../../../lib/content-planning";
import { NextResponse } from "next/server";
import { getCurrentUser, getDatabase, writeAudit } from "../../../../../lib/auth";
import { ensureProductSchema } from "../../../../../lib/product";
import { commerceService, commercialSubject, ensureBillingSchema } from "../../../../../lib/billing";
import { atomicTaskCreationService, ensureExecutionSchema } from "../../../../../lib/execution";
import { can, permissions, type OrganizationRoleKey } from "../../../../../platform/modules/identity/authorization";
import { CommerceError } from "../../../../../platform/modules/commerce/service";
import { TaskCreationError } from "../../../../../platform/modules/execution/task-creation";
import { ContentVersionError, ensureContentVersionSchema } from "../../../../../lib/content-versions";

const CONTENT_CREDIT_COST=20,types=new Set(["blog_post","guide","landing_page","content_refresh"]);
const text=(value:unknown,max:number)=>typeof value==="string"?value.trim().slice(0,max):"";
function ensureContentStudioSchema(){ensureContentVersionSchema(getDatabase());}

export async function GET(request:Request,context:{params:Promise<{id:string}>}){const user=await getCurrentUser();if(!user)return NextResponse.json({error:"请先登录"},{status:401});await ensureExecutionSchema();await ensureProductSchema();const{id}=await context.params;if(!await accessibleContentProject(user,id))return NextResponse.json({error:"项目不存在"},{status:404});const versionId=new URL(request.url).searchParams.get("versionId");if(versionId){ensureContentWorkflow(getDatabase());const version=workflowVersion(getDatabase(),user.organization.organizationId,id,versionId);return version?NextResponse.json({version},{headers:{"cache-control":"private, no-store"}}):NextResponse.json({error:"版本不存在"},{status:404});}const studio=await contentStudioData(user.organization.organizationId,id);let generation:{allowed:boolean;code:string|null;reason:string|null;creditCost:number}={allowed:true,code:null,reason:null,creditCost:CONTENT_CREDIT_COST};try{await ensureBillingSchema();commerceService().authorizeAccess(commercialSubject(user));}catch(error){if(error instanceof CommerceError)generation={allowed:false,code:error.code,reason:error.message,creditCost:CONTENT_CREDIT_COST};else throw error;}return NextResponse.json({...studio,generation},{headers:{"cache-control":"private, no-store"}});}

export async function POST(request:Request,context:{params:Promise<{id:string}>}){
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:"请先登录"},{status:401});await ensureProductSchema();const{id}=await context.params,project=await accessibleContentProject(user,id);if(!project)return NextResponse.json({error:"项目不存在"},{status:404});if(project.status!=="active")return NextResponse.json({error:"项目已归档或停用，不能生成内容"},{status:409});
  if(!can(user.organization.roleKey as OrganizationRoleKey,permissions.contentCreate))return NextResponse.json({error:"没有创建内容的权限"},{status:403});
  const raw=await request.json().catch(()=>({})) as Record<string,unknown>;
  ensureContentPlanningSchema();ensureContentWorkflow(getDatabase());
  const planId=text(raw.planId,128);
  const planned=planId?getDatabase().prepare(`SELECT cp.id,cp.brief_id AS briefId,cp.scheduled_at AS scheduledAt,cb.topic,cb.primary_keyword AS keyword,cb.audience,cb.search_intent AS intent,cb.content_goal AS goal,cb.content_type AS contentType,cb.outline,cb.suggested_word_count AS wordCount FROM content_plans cp JOIN content_briefs cb ON cb.id=cp.brief_id WHERE cp.id=? AND cp.organization_id=? AND cp.project_id=?`).bind(planId,user.organization.organizationId,id).first<{id:string;briefId:string;scheduledAt:number|null;topic:string;keyword:string;audience:string;intent:string;goal:string;contentType:string;outline:string;wordCount:number}>():null;
  if(planId&&!planned)return NextResponse.json({error:"内容计划不存在"},{status:404});
  if(planned)Object.assign(raw,{title:planned.topic,keyword:planned.keyword,audience:planned.audience,intent:planned.intent,goal:planned.goal,contentType:types.has(planned.contentType)?planned.contentType:"blog_post",tone:"专业、清晰、可信",sourceRef:project.siteUrl,brief:`建议字数：${planned.wordCount}；大纲：${planned.outline}`,briefId:planned.briefId});
  const input={projectId:id,title:text(raw.title,160),keyword:text(raw.keyword,160),contentType:text(raw.contentType,40),audience:text(raw.audience,300),intent:text(raw.intent,100),tone:text(raw.tone,200),goal:text(raw.goal,300),sourceRef:text(raw.sourceRef,1000),brief:text(raw.brief,5000),planId:planned?.id||null,briefId:planned?.briefId||null};
  if(!input.title||!input.keyword||!types.has(input.contentType)||!input.audience||!input.intent||!input.tone||!input.goal||!input.sourceRef)return NextResponse.json({error:"请完整填写标题、关键词、类型、受众、意图、语气、目标和证据来源",code:"CONTENT_BRIEF_INVALID"},{status:400});
  const db=getDatabase(),existing=planned?db.prepare(`SELECT cpr.task_id AS taskId,et.state FROM content_plan_runs cpr JOIN execution_tasks et ON et.id=cpr.task_id WHERE cpr.organization_id=? AND cpr.project_id=? AND cpr.plan_id=?`).bind(user.organization.organizationId,id,planned.id).first<{taskId:string;state:string}>():null;
  if(existing&&!['failed','cancelled','quarantined'].includes(existing.state))return NextResponse.json({taskId:existing.taskId,state:existing.state,duplicate:true,creditsReserved:0},{status:202});
  try{
    await ensureBillingSchema();const service=commerceService(),subject=commercialSubject(user);service.authorizeAccess(subject);const current=service.usageTotals(subject).find(item=>item.metric==="content_generated"),currentUsage=Number(current?.final??0)+Number(current?.pending??0),requested=request.headers.get("idempotency-key")?.trim(),idempotencyKey=requested&&/^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/.test(requested)?requested:`content:${id}:${crypto.randomUUID()}`,correlationId=request.headers.get("traceparent")||`content:${crypto.randomUUID()}`;
    const creator=await atomicTaskCreationService();
    const created=db.transaction(()=>{const result=creator.create({activeOrganizationId:user.organization.organizationId,organizationId:user.organization.organizationId,projectId:id,requestedByAccountId:user.id,role:user.organization.roleKey as OrganizationRoleKey,permission:permissions.contentCreate,subject,triggerType:"manual",taskType:"content_agent",capability:"content.generate",input:{...input,description:`目标关键词：${input.keyword}；目标受众：${input.audience}；搜索意图：${input.intent}；品牌语气：${input.tone}；内容目标：${input.goal}；证据来源：${input.sourceRef}；补充要求：${input.brief||"无"}`},locale:project.language.startsWith("en")?"en":"zh-CN",idempotencyKey:planned?`content-plan:${planned.id}:${existing?.taskId||"initial"}`:idempotencyKey,correlationId,entitlements:[{key:"contentItems",quantity:1,currentUsage}],creditCost:CONTENT_CREDIT_COST,queue:"agents",jobType:"content.generate",priority:65,availableAt:planned&&raw.useSchedule===true&&planned.scheduledAt?planned.scheduledAt:undefined,maxAttempts:2,timeoutSeconds:900});
      if(planned){db.prepare(`INSERT INTO content_plan_runs(task_id,organization_id,project_id,brief_id,plan_id,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT(organization_id,project_id,plan_id) DO UPDATE SET task_id=excluded.task_id,created_at=excluded.created_at`).bind(result.task.id,user.organization.organizationId,id,planned.briefId,planned.id,Math.floor(Date.now()/1000)).run();syncContentPlan(db,result.task.id,"generating");}
      return result;});
    await writeAudit("content_generation_queued",user.id,request,JSON.stringify({projectId:id,taskId:created.task.id,jobId:created.job.id,creditsReserved:CONTENT_CREDIT_COST,agent:"content.agent@1.0.0",title:input.title}));return NextResponse.json({taskId:created.task.id,jobId:created.job.id,state:created.task.state,creditsReserved:CONTENT_CREDIT_COST,duplicate:created.duplicate,correlationId},{status:202});
  }catch(error){if(error instanceof CommerceError||error instanceof TaskCreationError)return NextResponse.json({error:error.message,code:error.code},{status:error.status});console.error("Failed to queue content generation",error);return NextResponse.json({error:"内容生成任务创建失败，请稍后重试"},{status:500});}
}

export async function PATCH(request:Request,context:{params:Promise<{id:string}>}){
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:"请先登录"},{status:401});await ensureProductSchema();ensureContentStudioSchema();const{id}=await context.params,project=await accessibleContentProject(user,id);if(!project)return NextResponse.json({error:"项目不存在"},{status:404});if(project.status!=="active")return NextResponse.json({error:"项目已停用"},{status:409});if(!can(user.organization.roleKey as OrganizationRoleKey,permissions.contentCreate))return NextResponse.json({error:"没有编辑内容的权限"},{status:403});
  const raw=await request.json().catch(()=>({})) as Record<string,unknown>,runId=text(raw.runId,128);
  if(raw.action==="submit_review"){
    try{const version=submitVersion(getDatabase(),{organizationId:user.organization.organizationId,projectId:id,versionId:text(raw.versionId,128),accountId:user.id,factsConfirmed:raw.factsConfirmed===true});return NextResponse.json({version});}
    catch(error){if(error instanceof ContentVersionError)return NextResponse.json({error:error.message,code:error.code},{status:error.status});throw error;}
  }
  if(raw.action==="archive"||raw.action==="restore"){
    ensureContentWorkflow(getDatabase());const run=getDatabase().prepare("SELECT id FROM content_runs WHERE id=? AND project_id=?").bind(runId,id).first();if(!run)return NextResponse.json({error:"内容不存在"},{status:404});
    getDatabase().prepare("INSERT INTO content_library_state(run_id,archived_at,updated_by) VALUES(?,?,?) ON CONFLICT(run_id) DO UPDATE SET archived_at=excluded.archived_at,updated_by=excluded.updated_by").bind(runId,raw.action==="archive"?Math.floor(Date.now()/1000):null,user.id).run();
    await writeAudit(`content_${raw.action}`,user.id,request,JSON.stringify({projectId:id,runId}));return NextResponse.json({ok:true});
  }
  if(!runId||typeof raw.body!=="string"||typeof raw.expectedVersion!=="number")return NextResponse.json({error:"请提供正文和当前版本，旧页面请先刷新",code:"CONTENT_VERSION_INVALID"},{status:400});
  try {
    const version=saveWorkflowVersion(getDatabase(),{organizationId:user.organization.organizationId,projectId:id,runId,accountId:user.id,body:raw.body,expectedVersion:raw.expectedVersion});
    await writeAudit("content_version_saved",user.id,request,JSON.stringify({projectId:id,runId,versionId:version.id,versionNumber:version.versionNumber,wordCount:version.wordCount}));
    return NextResponse.json({version},{status:201});
  } catch(error) {
    if(error instanceof ContentVersionError)return NextResponse.json({error:error.message,code:error.code},{status:error.status});
    throw error;
  }
}
