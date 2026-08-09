import { NextResponse } from "next/server";
import { getCurrentUser, getDatabase, writeAudit } from "../../../../../lib/auth";
import { ensureProductSchema, ownedProject, pageLimit } from "../../../../../lib/product";
import { commerceService, commercialSubject, ensureBillingSchema } from "../../../../../lib/billing";
import { atomicTaskCreationService } from "../../../../../lib/execution";
import { permissions, type OrganizationRoleKey } from "../../../../../platform/modules/identity/authorization";
import { CommerceError } from "../../../../../platform/modules/commerce/service";
import { TaskCreationError } from "../../../../../platform/modules/execution/task-creation";

const RESEARCH_CREDIT_COST=5;
type ResearchOpportunity={id:string;title:string;keyword:string;intent:string;source:string;url:string|null;priority:number;searchVolume:number|null;keywordDifficulty:number|null;potentialTraffic:number|null;evidenceRefs:string;confidence:number;createdAt:number};
function parsed<T>(value:string|undefined,fallback:T):T{try{return value?JSON.parse(value) as T:fallback}catch{return fallback}}
function payload(projectId:string){
  const db=getDatabase(),latestRun=db.prepare(`SELECT id,status,execution_task_id AS taskId,opportunities_found AS opportunitiesFound,content_ideas AS contentIdeas,source_count AS sourceCount,evidence_count AS evidenceCount,degraded_sources AS degradedSourcesJson,agent_version AS agentVersion,started_at AS startedAt,completed_at AS completedAt,error FROM research_runs WHERE project_id=? ORDER BY started_at DESC LIMIT 1`).bind(projectId).first<Record<string,unknown>&{id:string;degradedSourcesJson:string}>();
  const opportunities=latestRun?db.prepare(`SELECT id,title,keyword,intent,source,url,priority,search_volume AS searchVolume,keyword_difficulty AS keywordDifficulty,potential_traffic AS potentialTraffic,evidence_refs AS evidenceRefs,confidence,created_at AS createdAt FROM research_opportunities WHERE run_id=? ORDER BY priority DESC,created_at DESC LIMIT 100`).bind(latestRun.id).all().results as ResearchOpportunity[]:[];
  const evidence=latestRun?db.prepare(`SELECT id,source_type AS sourceType,source_ref AS sourceRef,summary,digest,confidence,captured_at AS capturedAt,fresh_until AS freshUntil FROM research_evidence WHERE run_id=? ORDER BY captured_at DESC LIMIT 100`).bind(latestRun.id).all().results:[];
  const connections=db.prepare("SELECT provider,status FROM project_connections WHERE project_id=?").bind(projectId).all().results as Array<{provider:string;status:string}>,connected=Object.fromEntries(connections.map(item=>[item.provider,item.status==="connected"]));
  const degraded=parsed<string[]>(latestRun?.degradedSourcesJson,[]),normalizedRun=latestRun?Object.fromEntries(Object.entries(latestRun).filter(([key])=>key!=="degradedSourcesJson")):null;
  return{latestRun:normalizedRun?{...normalizedRun,degradedSources:degraded}:null,opportunities:opportunities.map(item=>({...item,evidenceRefs:parsed<string[]>(item.evidenceRefs,[])})),evidence,capabilities:{publicCrawl:true,keywordMetrics:connected.rank_provider===true&&!degraded.includes("rank_provider"),searchPerformance:connected.google_search_console===true&&!degraded.includes("google_search_console"),analytics:connected.google_analytics_4===true,competitorData:false,trendData:false,questionMining:false}};
}

export async function GET(_:Request,context:{params:Promise<{id:string}>}){const user=await getCurrentUser();if(!user)return NextResponse.json({error:"请先登录"},{status:401});await ensureProductSchema();const{id}=await context.params;if(!await ownedProject(user.organization.organizationId,id))return NextResponse.json({error:"项目不存在"},{status:404});return NextResponse.json(payload(id),{headers:{"cache-control":"private, no-store"}});}

export async function POST(request:Request,context:{params:Promise<{id:string}>}){
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:"请先登录"},{status:401});await ensureProductSchema();const{id}=await context.params,project=await ownedProject(user.organization.organizationId,id);if(!project)return NextResponse.json({error:"项目不存在"},{status:404});if(project.status!=="active")return NextResponse.json({error:"项目已归档或停用，不能运行研究"},{status:409});
  const body=await request.json().catch(()=>({})) as {seed?:unknown};const seed=typeof body.seed==="string"?body.seed.trim().slice(0,200):"";
  try{
    await ensureBillingSchema();commerceService().authorizeAccess(commercialSubject(user));const subject=commercialSubject(user),requested=request.headers.get("idempotency-key")?.trim(),idempotencyKey=requested&&/^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/.test(requested)?requested:`research:${id}:${crypto.randomUUID()}`,correlationId=request.headers.get("traceparent")||`research:${crypto.randomUUID()}`;
    const created=(await atomicTaskCreationService()).create({activeOrganizationId:user.organization.organizationId,organizationId:user.organization.organizationId,projectId:id,requestedByAccountId:user.id,role:user.organization.roleKey as OrganizationRoleKey,permission:permissions.researchRun,subject,triggerType:"manual",taskType:"research_agent",capability:"research.discover",input:{projectId:id,siteUrl:project.siteUrl,market:project.market,language:project.language,seed,maximumPages:Math.min(pageLimit(user),50),title:`${project.name} 机会研究`,description:`Research Agent 从 ${project.host} 的可验证来源发现关键词与内容机会`},locale:project.language.startsWith("en")?"en":"zh-CN",idempotencyKey,correlationId,entitlements:[],creditCost:RESEARCH_CREDIT_COST,queue:"agents",jobType:"research.run",priority:70,maxAttempts:3,timeoutSeconds:900});
    await writeAudit("research_run_queued",user.id,request,JSON.stringify({projectId:id,taskId:created.task.id,jobId:created.job.id,creditsReserved:RESEARCH_CREDIT_COST,agent:"research.agent@1.0.0"}));return NextResponse.json({taskId:created.task.id,jobId:created.job.id,state:created.task.state,creditsReserved:RESEARCH_CREDIT_COST,duplicate:created.duplicate,correlationId},{status:202});
  }catch(error){if(error instanceof CommerceError||error instanceof TaskCreationError)return NextResponse.json({error:error.message,code:error.code},{status:error.status});console.error("Failed to queue research",error);return NextResponse.json({error:"研究任务创建失败，请稍后重试"},{status:500});}
}
