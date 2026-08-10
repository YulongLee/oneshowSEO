import { createHash } from "node:crypto";
import type { AgentImplementation } from "../../sdk/development-harness";
import type { AuditCheck, SiteAuditResult } from "../../../lib/site-audit";
import type { AgentEventEnvelope, AgentExecutionEnvelope } from "./contracts";
import { validateAgentManifest, type AgentManifest } from "./manifest";

export const AUDIT_AGENT_KEY="seo.audit",AUDIT_AGENT_VERSION="1.0.0",AUDIT_CAPABILITY="audit.run";

export const auditAgentManifest:AgentManifest=validateAgentManifest({
  schemaVersion:"1",key:AUDIT_AGENT_KEY,version:AUDIT_AGENT_VERSION,
  metadata:{"zh-CN":{name:"SEO Audit Agent",description:"在获准的抓取边界内检查技术、内容、索引与 AI 搜索可见性，并输出证据化修复建议。"},en:{name:"SEO Audit Agent",description:"Inspect technical, content, indexability, and AI-search visibility within authorized crawl boundaries and produce evidence-backed remediation recommendations."}},
  capabilities:[{key:AUDIT_CAPABILITY,input:{type:"object",additionalProperties:false,properties:{siteUrl:{type:"string",format:"uri"},maximumPages:{type:"integer",minimum:1,maximum:1000}},required:["siteUrl","maximumPages"]},output:{type:"object",additionalProperties:false,properties:{score:{type:"integer",minimum:0,maximum:100},pagesScanned:{type:"integer",minimum:0},findingCount:{type:"integer",minimum:0},evidenceCount:{type:"integer",minimum:0},partial:{type:"boolean"},partialReasons:{type:"array",items:{type:"string"}},degradedSources:{type:"array",items:{type:"string"}}},required:["score","pagesScanned","findingCount","evidenceCount","partial","partialReasons","degradedSources"]},events:[
    {key:"audit.progress",schema:{type:"object",properties:{percent:{type:"integer"}}}},
    {key:"audit.evidence",schema:{type:"object",properties:{digest:{type:"string"},freshUntil:{type:"integer"}}}},
    {key:"audit.recommendation",schema:{type:"object",properties:{evidenceRefs:{type:"array"}}}},
    {key:"audit.artifact",schema:{type:"object",properties:{mimeType:{type:"string"}}}},
    {key:"audit.usage",schema:{type:"object",properties:{quantity:{type:"number"}}}},
    {key:"audit.error",schema:{type:"object",properties:{code:{type:"string"}}}},
  ],permissions:["audits.run","reports.read"]}],
  dependencies:{providers:["public.crawl"],agents:[]},
  entitlements:[{key:"pages-per-audit",minimumPlan:"trial",quantity:10},{key:"monthly-credits",minimumPlan:"trial",quantity:10}],
  risks:[{capability:AUDIT_CAPABILITY,level:"medium",approval:"policy"}],
  schedules:[{key:"manual",cron:null,minimumIntervalSeconds:60,timezone:"project"},{key:"weekly",cron:"0 2 * * 1",minimumIntervalSeconds:3600,timezone:"project"}],
  compatibility:{platform:{minimum:"1.0.0",maximum:null},manifestVersions:["1"]},
});

export type AuditAcquisition={capturedAt:number;freshUntil:number;result:SiteAuditResult;degradedSources:string[]};
export interface AuditSourceAcquirer{acquire(input:{siteUrl:string;maximumPages:number;integrationRefs:AgentExecutionEnvelope["integrationRefs"];signal?:AbortSignal}):Promise<AuditAcquisition>;}
export type AuditEvidence={id:string;capturedAt:number;freshUntil:number;sourceType:"public"|"integration"|"artifact";sourceRef:string;summary:string;digest:string;confidence:number};
export type AuditRecommendation={id:string;checkIndex:number;title:string;evidenceRefs:string[];confidence:number;risk:"low"|"medium"|"high"|"critical";impactHypothesis:string;expiresAt:number};
export type AuditAgentResult={events:AgentEventEnvelope[];audit:SiteAuditResult|null;evidence:AuditEvidence[];recommendations:AuditRecommendation[];degradedSources:string[]};

const sha=(value:string)=>createHash("sha256").update(value).digest("hex");
const clean=(value:string,max=2_000)=>value.replace(/\s+/g," ").trim().slice(0,max);
const confidence=(value:AuditCheck["confidence"])=>value==="confirmed" ? .98 : value==="likely" ? .82 : .55;
const risk=(severity:AuditCheck["severity"]):AuditRecommendation["risk"]=>severity==="critical"?"critical":severity==="high"?"high":severity==="medium"?"medium":"low";
const base=(input:AgentExecutionEnvelope,sequence:number,kind:AgentEventEnvelope["kind"])=>({schemaVersion:"1" as const,eventId:`${input.taskId}:${sequence}`,sequence,occurredAt:Math.floor(Date.now()/1000),organizationId:input.organizationId,projectId:input.projectId,taskId:input.taskId,jobId:input.jobId,attemptId:input.attemptId,correlationId:input.correlationId,agent:{key:AUDIT_AGENT_KEY,version:AUDIT_AGENT_VERSION},kind});

export class SeoAuditAgent implements AgentImplementation{
  readonly manifest=auditAgentManifest;
  constructor(private readonly sources:AuditSourceAcquirer){}
  async run(input:AgentExecutionEnvelope){return(await this.runDetailed(input)).events;}
  async runDetailed(input:AgentExecutionEnvelope):Promise<AuditAgentResult>{
    let sequence=0;const events:AgentEventEnvelope[]=[];const progress=(step:string,percent:number,messageKey:string)=>events.push({...base(input,++sequence,"progress"),kind:"progress",progress:{step,percent,messageKey,messageArgs:{}}});
    progress("crawl_policy",5,"audit.crawl_policy.started");let acquired:AuditAcquisition;
    try{acquired=await this.sources.acquire({siteUrl:String(input.input.siteUrl||""),maximumPages:Number(input.input.maximumPages||0),integrationRefs:input.integrationRefs});}
    catch(error){const cancelled=error instanceof Error&&/cancel/i.test(error.message);events.push({...base(input,++sequence,"error"),kind:"error",error:{code:cancelled?"audit.cancelled":"audit.source.unavailable",category:cancelled?"cancelled":"dependency",retryable:!cancelled,messageKey:cancelled?"audit.cancelled":"audit.source.unavailable",redactedDetail:error instanceof Error?error.message.slice(0,300):null,recoveryAction:cancelled?"none":"retry"}});return{events,audit:null,evidence:[],recommendations:[],degradedSources:["public.crawl"]};}
    const result=acquired.result;if(!result.pages.length||result.pages.every(page=>page.statusCode===0)){events.push({...base(input,++sequence,"error"),kind:"error",error:{code:"audit.evidence.unavailable",category:"dependency",retryable:true,messageKey:input.locale==="zh-CN"?"audit.evidence.unavailable.zh":"audit.evidence.unavailable.en",redactedDetail:null,recoveryAction:"reconfigure"}});return{events,audit:null,evidence:[],recommendations:[],degradedSources:acquired.degradedSources};}
    progress("deterministic_checks",45,"audit.deterministic_checks.completed");
    const evidence=result.checks.map((item,index)=>{const summary=clean(`${item.title}：${item.evidence||item.description}`);return{id:`evidence-${index+1}`,capturedAt:acquired.capturedAt,freshUntil:acquired.freshUntil,sourceType:"public" as const,sourceRef:clean(item.url||String(input.input.siteUrl),256),summary,digest:sha(`${item.key}\n${item.url||input.input.siteUrl}\n${summary}\n${acquired.capturedAt}`),confidence:confidence(item.confidence)};});
    for(const item of evidence)events.push({...base(input,++sequence,"evidence"),kind:"evidence",evidence:{id:item.id,capturedAt:item.capturedAt,source:{type:item.sourceType,ref:item.sourceRef},summary:item.summary,digest:item.digest,confidence:item.confidence}});
    const recommendations:AuditRecommendation[]=[];for(const [checkIndex,item] of result.checks.entries()){if(!["warning","fail"].includes(item.status)||item.severity==="info")continue;const recommendation={id:`recommendation-${recommendations.length+1}`,checkIndex,title:clean(item.recommendation||item.title,300),evidenceRefs:[evidence[checkIndex].id],confidence:confidence(item.confidence),risk:risk(item.severity),impactHypothesis:clean(item.impact||item.description),expiresAt:acquired.freshUntil};recommendations.push(recommendation);events.push({...base(input,++sequence,"recommendation"),kind:"recommendation",recommendation:{id:recommendation.id,title:recommendation.title,evidenceRefs:recommendation.evidenceRefs,confidence:recommendation.confidence,impactHypothesis:recommendation.impactHypothesis,risk:recommendation.risk,changeSetRef:null,estimatedCost:0,expiresAt:recommendation.expiresAt,rollbackRequired:true}});}
    progress("report_generation",85,"audit.report_generation.started");const preview=JSON.stringify({agent:`${AUDIT_AGENT_KEY}@${AUDIT_AGENT_VERSION}`,score:result.score,pages:result.pages.length,evidence:evidence.map(item=>item.digest),partial:result.partial,partialReasons:result.partialReasons});
    events.push({...base(input,++sequence,"artifact"),kind:"artifact",artifact:{uploadRef:`audit-report:${input.taskId}`,filename:`seo-audit-report-${input.taskId}.md`,mimeType:"text/markdown",size:Buffer.byteLength(preview),digest:sha(preview),retentionClass:"standard"}});
    events.push({...base(input,++sequence,"usage"),kind:"usage",usage:{eventId:`audit:${input.taskId}:pages`,meter:"audit.pages",quantity:result.pages.length,unit:"page",measuredAt:Math.floor(Date.now()/1000),final:true}});progress("completed",100,"audit.completed");
    return{events,audit:result,evidence,recommendations,degradedSources:[...acquired.degradedSources]};
  }
}
