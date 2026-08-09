import { getDatabase } from "./auth";
import { publicRobotsPolicy, runSiteAudit } from "./site-audit";
import { ResearchAgent, type ResearchAcquisition, type ResearchAgentResult, type ResearchSourceAcquirer } from "../platform/modules/agents/research-agent";
import type { AgentExecutionEnvelope } from "../platform/modules/agents/contracts";
import { validateAgentExecutionEnvelope } from "../platform/modules/agents/contracts";
import { WorkerJobError } from "../platform/modules/execution/worker";

export type ResearchExecutionInput={projectId:string;siteUrl:string;market:string;language:string;seed?:string;maximumPages:number};
export type ResearchExecutionResult={runId:string;opportunitiesFound:number;contentIdeas:number;evidenceCount:number;sourceCount:number;degradedSources:string[];report:Uint8Array;reportTitle:string};

export class PublicCrawlResearchAcquirer implements ResearchSourceAcquirer{
  async acquire(input:{siteUrl:string;maximumPages:number}):Promise<ResearchAcquisition>{
    const robots=await publicRobotsPolicy(input.siteUrl);if(!robots.allowed(input.siteUrl))throw new Error("ROBOTS_POLICY_DENIED");const result=await runSiteAudit(input.siteUrl,Math.min(input.maximumPages,50)),capturedAt=Math.floor(Date.now()/1000);
    return{capturedAt,freshUntil:capturedAt+86_400,sourceRef:input.siteUrl,pages:result.pages.filter(page=>robots.allowed(page.url)).map(page=>({url:page.url,title:page.title,description:page.description,statusCode:page.statusCode})),degradedSources:["google_search_console","rank_provider","competitor_data","trend_data"]};
  }
}

function markdown(project:{name:string;siteUrl:string;market:string;language:string},result:ResearchAgentResult,completedAt:number){
  const sourceStatus=result.degradedSources.length?result.degradedSources.join("、"):"无";
  return `# ${project.name} Research Agent 研究报告\n\n- 网站：${project.siteUrl}\n- 市场 / 语言：${project.market} / ${project.language}\n- 完成时间：${new Date(completedAt*1000).toISOString()}\n- Agent：research.agent@1.0.0\n- 已验证证据：${result.evidence.length}\n- 已生成机会：${result.opportunities.length}\n- 未接入数据源：${sourceStatus}\n\n> 本报告只使用已获准且可追溯的来源。搜索量与关键词难度在没有授权数据源时保持为空，不进行估算。\n\n## 优先机会\n\n${result.opportunities.length?result.opportunities.map((item,index)=>`${index+1}. **${item.keyword}** — ${item.title}\n   - 意图：${item.intent}；优先级：${item.priority}；可信度：${Math.round(item.confidence*100)}%\n   - 来源：${item.url||item.source}；证据：${item.evidenceRefs.join(", ")}`).join("\n"):"未发现可验证机会。"}\n\n## 证据清单\n\n${result.evidence.map(item=>`- **${item.id}** ${item.summary}\n  - ${item.sourceRef}\n  - capturedAt=${item.capturedAt}; freshUntil=${item.freshUntil}; sha256=${item.digest}`).join("\n")}\n`;
}

export async function executeResearchAgent(input:ResearchExecutionInput,context:{organizationId:string;taskId:string;jobId:string;attemptId:string;accountId:string;correlationId:string;locale:"zh-CN"|"en"},signal?:AbortSignal,dependencies:{acquirer?:ResearchSourceAcquirer}={}):Promise<ResearchExecutionResult>{
  if(signal?.aborted)throw signal.reason;const db=getDatabase(),project=db.prepare("SELECT id,name,site_url AS siteUrl,market,language,status FROM projects WHERE id=?").bind(input.projectId).first<{id:string;name:string;siteUrl:string;market:string;language:string;status:string}>();
  if(!project||project.status!=="active"||project.siteUrl!==input.siteUrl)throw new WorkerJobError("RESEARCH_PROJECT_NOT_ACTIVE","Research project is not active",false);
  const started=Math.floor(Date.now()/1000),runId=context.taskId;
  db.prepare(`INSERT INTO research_runs(id,project_id,status,started_at,execution_task_id,agent_version) VALUES (?,?,'running',?,?, '1.0.0') ON CONFLICT(id) DO UPDATE SET status='running',started_at=excluded.started_at,completed_at=NULL,error=NULL`).bind(runId,input.projectId,started,context.taskId).run();
  try{
    const envelope:AgentExecutionEnvelope=validateAgentExecutionEnvelope({schemaVersion:"1",kind:"execution",organizationId:context.organizationId,projectId:input.projectId,taskId:context.taskId,jobId:context.jobId,attemptId:context.attemptId,correlationId:context.correlationId,idempotencyKey:`research:${context.taskId}`,agent:{key:"research.agent",version:"1.0.0",capability:"research.discover"},actor:{type:"user",id:context.accountId},locale:context.locale,input:{siteUrl:input.siteUrl,market:input.market,language:input.language,seed:input.seed||"",maximumPages:input.maximumPages},artifactRefs:[],integrationRefs:[],memoryRefs:[],deadlineAt:Math.floor(Date.now()/1000)+900,cancellation:{tokenRef:`cancel:${context.taskId}`,pollAfterSeconds:2},limits:{maxRuntimeSeconds:900,maxOutputBytes:2_000_000,maxArtifacts:1,maxUsageUnits:Math.min(input.maximumPages,100)}});
    const result=await new ResearchAgent(dependencies.acquirer??new PublicCrawlResearchAcquirer()).runDetailed(envelope);if(signal?.aborted)throw signal.reason;
    const failure=result.events.find(event=>event.kind==="error");if(failure?.kind==="error")throw new WorkerJobError(failure.error.code,failure.error.messageKey,failure.error.retryable);
    const now=Math.floor(Date.now()/1000),contentIdeas=result.opportunities.filter(item=>item.intent!=="technical").length,statements=[db.prepare("DELETE FROM research_opportunities WHERE run_id=?").bind(runId),db.prepare("DELETE FROM research_evidence WHERE run_id=?").bind(runId)];
    for(const item of result.evidence)statements.push(db.prepare(`INSERT INTO research_evidence(id,run_id,project_id,source_type,source_ref,summary,digest,confidence,captured_at,fresh_until,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).bind(`${runId}:${item.id}`,runId,input.projectId,item.sourceType,item.sourceRef,item.summary,item.digest,item.confidence,item.capturedAt,item.freshUntil,now));
    for(const item of result.opportunities)statements.push(db.prepare(`INSERT INTO research_opportunities(id,run_id,project_id,title,keyword,intent,source,url,priority,search_volume,keyword_difficulty,potential_traffic,evidence_refs,confidence,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(`${runId}:${item.id}`,runId,input.projectId,item.title,item.keyword,item.intent,item.source,item.url,item.priority,item.searchVolume,item.keywordDifficulty,item.potentialTraffic,JSON.stringify(item.evidenceRefs.map(ref=>`${runId}:${ref}`)),item.confidence,now));
    statements.push(db.prepare(`UPDATE research_runs SET status='completed',opportunities_found=?,content_ideas=?,source_count=?,evidence_count=?,degraded_sources=?,completed_at=?,error=NULL WHERE id=?`).bind(result.opportunities.length,contentIdeas,result.sourceCount,result.evidence.length,JSON.stringify(result.degradedSources),now,runId));db.batch(statements);
    return{runId,opportunitiesFound:result.opportunities.length,contentIdeas,evidenceCount:result.evidence.length,sourceCount:result.sourceCount,degradedSources:result.degradedSources,report:new TextEncoder().encode(markdown(project,result,now)),reportTitle:`${project.name} Research Agent 研究报告`};
  }catch(error){db.prepare("UPDATE research_runs SET status='failed',error=?,completed_at=? WHERE id=?").bind(error instanceof Error?error.message:"RESEARCH_FAILED",Math.floor(Date.now()/1000),runId).run();throw error;}
}
