import { createHash } from "node:crypto";
import type { AgentImplementation } from "../../sdk/development-harness";
import { validateAgentManifest, type AgentManifest } from "./manifest";
import type { AgentEventEnvelope, AgentExecutionEnvelope } from "./contracts";

export const RESEARCH_AGENT_KEY="research.agent",RESEARCH_AGENT_VERSION="1.0.0",RESEARCH_CAPABILITY="research.discover";

export const researchAgentManifest:AgentManifest=validateAgentManifest({
  schemaVersion:"1",key:RESEARCH_AGENT_KEY,version:RESEARCH_AGENT_VERSION,
  metadata:{"zh-CN":{name:"Research Agent",description:"从获准的公开网页和已授权搜索数据中生成可追溯的关键词与内容机会。"},en:{name:"Research Agent",description:"Discover attributable keyword and content opportunities from allowed public pages and authorized search data."}},
  capabilities:[{key:RESEARCH_CAPABILITY,input:{type:"object",additionalProperties:false,properties:{siteUrl:{type:"string",format:"uri"},market:{type:"string",maxLength:32},language:{type:"string",maxLength:16},seed:{type:"string",maxLength:200},maximumPages:{type:"integer",minimum:1,maximum:1000}},required:["siteUrl","market","language","maximumPages"]},output:{type:"object",additionalProperties:false,properties:{opportunitiesFound:{type:"integer",minimum:0},evidenceCount:{type:"integer",minimum:0},sourceCount:{type:"integer",minimum:0},degradedSources:{type:"array",items:{type:"string"}}},required:["opportunitiesFound","evidenceCount","sourceCount","degradedSources"]},events:[
    {key:"research.progress",schema:{type:"object",properties:{percent:{type:"integer"}}}},
    {key:"research.evidence",schema:{type:"object",properties:{digest:{type:"string"},freshUntil:{type:"integer"}}}},
    {key:"research.recommendation",schema:{type:"object",properties:{evidenceRefs:{type:"array"}}}},
    {key:"research.artifact",schema:{type:"object",properties:{mimeType:{type:"string"}}}},
    {key:"research.usage",schema:{type:"object",properties:{quantity:{type:"number"}}}},
    {key:"research.error",schema:{type:"object",properties:{code:{type:"string"}}}},
  ],permissions:["research.read","research.run","reports.read"]}],
  dependencies:{providers:["public.crawl"],agents:[]},entitlements:[{key:"research-runs",minimumPlan:"trial",quantity:1},{key:"monthly-credits",minimumPlan:"trial",quantity:5}],
  risks:[{capability:RESEARCH_CAPABILITY,level:"low",approval:"none"}],schedules:[{key:"manual",cron:null,minimumIntervalSeconds:60,timezone:"project"},{key:"daily",cron:"0 3 * * *",minimumIntervalSeconds:3600,timezone:"project"}],
  compatibility:{platform:{minimum:"1.0.0",maximum:null},manifestVersions:["1"]},
});

export type ResearchSourcePage={url:string;title:string;description:string;statusCode:number};
export type SearchMetric={query:string;clicks:number;impressions:number;position:number|null};
export type ResearchAcquisition={capturedAt:number;freshUntil:number;sourceRef:string;pages:ResearchSourcePage[];searchMetrics?:SearchMetric[];degradedSources?:string[]};
export interface ResearchSourceAcquirer{acquire(input:{siteUrl:string;maximumPages:number;integrationRefs:AgentExecutionEnvelope["integrationRefs"]}):Promise<ResearchAcquisition>;}
export type ResearchOpportunity={id:string;title:string;keyword:string;intent:"informational"|"commercial"|"technical";source:string;url:string|null;priority:number;searchVolume:number|null;keywordDifficulty:number|null;potentialTraffic:number|null;evidenceRefs:string[];confidence:number};
export type ResearchAgentResult={events:AgentEventEnvelope[];opportunities:ResearchOpportunity[];evidence:Array<{id:string;capturedAt:number;freshUntil:number;sourceType:"public"|"integration";sourceRef:string;summary:string;digest:string;confidence:number}>;degradedSources:string[];sourceCount:number};

const sha=(value:string)=>createHash("sha256").update(value).digest("hex");
const clean=(value:string)=>value.replace(/\s+/g," ").replace(/[|–—]+/g," ").trim().slice(0,180);
const base=(input:AgentExecutionEnvelope,sequence:number,kind:AgentEventEnvelope["kind"])=>({schemaVersion:"1" as const,eventId:`${input.taskId}:${sequence}`,sequence,occurredAt:Math.floor(Date.now()/1000),organizationId:input.organizationId,projectId:input.projectId,taskId:input.taskId,jobId:input.jobId,attemptId:input.attemptId,correlationId:input.correlationId,agent:{key:RESEARCH_AGENT_KEY,version:RESEARCH_AGENT_VERSION},kind});
function opportunityTitle(keyword:string,locale:AgentExecutionEnvelope["locale"]){return locale==="zh-CN"?`围绕「${keyword}」建立搜索落地内容`:`Build search-focused content for “${keyword}”`;}
function intentFor(value:string):ResearchOpportunity["intent"]{return /价格|方案|购买|服务|pricing|buy|service|solution/i.test(value)?"commercial":/错误|修复|性能|技术|error|fix|technical|performance/i.test(value)?"technical":"informational";}

export class ResearchAgent implements AgentImplementation{
  readonly manifest=researchAgentManifest;
  constructor(private readonly sources:ResearchSourceAcquirer){}
  async run(input:AgentExecutionEnvelope){return(await this.runDetailed(input)).events;}
  async runDetailed(input:AgentExecutionEnvelope):Promise<ResearchAgentResult>{
    let sequence=0;const events:AgentEventEnvelope[]=[];const progress=(step:string,percent:number,messageKey:string)=>events.push({...base(input,++sequence,"progress"),kind:"progress",progress:{step,percent,messageKey,messageArgs:{}}});
    progress("source_acquisition",5,"research.source_acquisition.started");
    let acquired:ResearchAcquisition;
    try{acquired=await this.sources.acquire({siteUrl:String(input.input.siteUrl||""),maximumPages:Number(input.input.maximumPages||0),integrationRefs:input.integrationRefs});}
    catch(error){events.push({...base(input,++sequence,"error"),kind:"error",error:{code:"research.source.unavailable",category:"dependency",retryable:true,messageKey:input.locale==="zh-CN"?"research.source.unavailable.zh":"research.source.unavailable.en",redactedDetail:error instanceof Error?error.message.slice(0,300):null,recoveryAction:"retry"}});return{events,opportunities:[],evidence:[],degradedSources:["public.crawl"],sourceCount:0};}
    const validPages=acquired.pages.filter(page=>page.statusCode>=200&&page.statusCode<400&&(clean(page.title)||clean(page.description)));
    if(!validPages.length){events.push({...base(input,++sequence,"error"),kind:"error",error:{code:"research.evidence.unavailable",category:"dependency",retryable:true,messageKey:input.locale==="zh-CN"?"research.evidence.unavailable.zh":"research.evidence.unavailable.en",redactedDetail:null,recoveryAction:"reconfigure"}});return{events,opportunities:[],evidence:[],degradedSources:["public.crawl"],sourceCount:0};}
    progress("evidence_normalization",30,"research.evidence_normalization.started");
    const evidence=validPages.slice(0,Math.min(100,input.limits.maxUsageUnits||100)).map((page,index)=>{const summary=clean([page.title,page.description].filter(Boolean).join(" — "));return{id:`evidence-${index+1}`,capturedAt:acquired.capturedAt,freshUntil:acquired.freshUntil,sourceType:"public" as const,sourceRef:page.url,summary,digest:sha(`${page.url}\n${summary}\n${acquired.capturedAt}`),confidence:.9};});
    for(const item of evidence)events.push({...base(input,++sequence,"evidence"),kind:"evidence",evidence:{id:item.id,capturedAt:item.capturedAt,source:{type:item.sourceType,ref:item.sourceRef},summary:item.summary,digest:item.digest,confidence:item.confidence}});
    const seed=clean(String(input.input.seed||""));const metrics=new Map((acquired.searchMetrics||[]).map(item=>[item.query.toLowerCase(),item]));const opportunities:ResearchOpportunity[]=[];const seen=new Set<string>();
    for(const [index,page] of validPages.entries()){
      const keyword=clean(index===0&&seed?seed:page.title||page.description.split(/[。.!?]/)[0]||new URL(page.url).pathname.replace(/[\/_-]+/g," "));if(keyword.length<2||seen.has(keyword.toLowerCase()))continue;seen.add(keyword.toLowerCase());const evidenceRef=evidence[index]?.id||evidence[0].id,metric=metrics.get(keyword.toLowerCase());
      opportunities.push({id:`opportunity-${opportunities.length+1}`,title:opportunityTitle(keyword,input.locale),keyword,intent:intentFor(keyword),source:metric?"google_search_console+public_crawl":"public_crawl",url:page.url,priority:Math.max(25,Math.min(100,65+(page.description?10:0)+(seed&&index===0?15:0)+(metric?Math.min(10,Math.round(metric.impressions/100)):0))),searchVolume:null,keywordDifficulty:null,potentialTraffic:metric?Math.max(0,Math.round(metric.impressions*.1)):null,evidenceRefs:[evidenceRef],confidence:metric?.impressions?0.95:0.82});
    }
    for(const item of opportunities)events.push({...base(input,++sequence,"recommendation"),kind:"recommendation",recommendation:{id:item.id,title:item.title,evidenceRefs:item.evidenceRefs,confidence:item.confidence,impactHypothesis:input.locale==="zh-CN"?"覆盖已验证的站内主题，并在接入搜索指标后继续校准优先级。":"Cover a verified site topic and recalibrate priority when search metrics are connected.",risk:"low",changeSetRef:null,estimatedCost:0,expiresAt:acquired.freshUntil,rollbackRequired:false}});
    progress("report_generation",85,"research.report_generation.started");
    const artifactPreview=JSON.stringify({agent:`${RESEARCH_AGENT_KEY}@${RESEARCH_AGENT_VERSION}`,opportunities:opportunities.length,evidence:evidence.map(item=>item.digest),degradedSources:acquired.degradedSources||[]});
    events.push({...base(input,++sequence,"artifact"),kind:"artifact",artifact:{uploadRef:`research-report:${input.taskId}`,filename:`research-report-${input.taskId}.md`,mimeType:"text/markdown",size:Buffer.byteLength(artifactPreview),digest:sha(artifactPreview),retentionClass:"standard"}});
    events.push({...base(input,++sequence,"usage"),kind:"usage",usage:{eventId:`research:${input.taskId}:sources`,meter:"research.sources",quantity:evidence.length,unit:"source",measuredAt:Math.floor(Date.now()/1000),final:true}});
    progress("completed",100,"research.completed");
    return{events,opportunities,evidence,degradedSources:[...(acquired.degradedSources||[])],sourceCount:1+(acquired.searchMetrics?.length?1:0)};
  }
}
