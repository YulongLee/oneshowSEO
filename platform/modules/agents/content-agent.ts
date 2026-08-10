import { createHash } from "node:crypto";
import type { AgentImplementation } from "../../sdk/development-harness";
import { validateAgentManifest, type AgentManifest } from "./manifest";
import type { AgentEventEnvelope, AgentExecutionEnvelope } from "./contracts";

export const CONTENT_AGENT_KEY="content.agent",CONTENT_AGENT_VERSION="1.0.0",CONTENT_CAPABILITY="content.generate";

export const contentAgentManifest:AgentManifest=validateAgentManifest({
  schemaVersion:"1",key:CONTENT_AGENT_KEY,version:CONTENT_AGENT_VERSION,
  metadata:{"zh-CN":{name:"Content Agent",description:"将获准的 Brief 与可追溯证据转化为可审核的内容草稿。"},en:{name:"Content Agent",description:"Turn an approved brief and attributable evidence into a reviewable content draft."}},
  capabilities:[{key:CONTENT_CAPABILITY,input:{type:"object",additionalProperties:false,properties:{title:{type:"string",maxLength:160},keyword:{type:"string",maxLength:160},contentType:{type:"string",enum:["blog_post","guide","landing_page","content_refresh"]},audience:{type:"string",maxLength:300},intent:{type:"string",maxLength:100},tone:{type:"string",maxLength:200},goal:{type:"string",maxLength:300},sourceRef:{type:"string",maxLength:1000},brief:{type:"string",maxLength:5000}},required:["title","keyword","contentType","audience","intent","tone","goal","sourceRef"]},output:{type:"object",additionalProperties:false,properties:{wordCount:{type:"integer",minimum:0},qualityScore:{type:"integer",minimum:0,maximum:100},checksPassed:{type:"integer",minimum:0},checksTotal:{type:"integer",minimum:1},evidenceCount:{type:"integer",minimum:0},reviewRequired:{type:"boolean"}},required:["wordCount","qualityScore","checksPassed","checksTotal","evidenceCount","reviewRequired"]},events:[
    {key:"content.progress",schema:{type:"object",properties:{percent:{type:"integer"}}}},
    {key:"content.evidence",schema:{type:"object",properties:{digest:{type:"string"}}}},
    {key:"content.recommendation",schema:{type:"object",properties:{evidenceRefs:{type:"array"}}}},
    {key:"content.artifact",schema:{type:"object",properties:{mimeType:{type:"string"}}}},
    {key:"content.usage",schema:{type:"object",properties:{quantity:{type:"number"}}}},
    {key:"content.error",schema:{type:"object",properties:{code:{type:"string"}}}},
  ],permissions:["content.read","content.create","content.edit","content.review"]}],
  dependencies:{providers:[],agents:[{key:"research.agent",versionRange:"^1.0.0"}]},entitlements:[{key:"content-items",minimumPlan:"trial",quantity:1},{key:"monthly-credits",minimumPlan:"trial",quantity:20}],
  risks:[{capability:CONTENT_CAPABILITY,level:"medium",approval:"required"}],schedules:[{key:"manual",cron:null,minimumIntervalSeconds:60,timezone:"project"}],
  compatibility:{platform:{minimum:"1.0.0",maximum:null},manifestVersions:["1"]},
});

export type ContentEvidence={id:string;sourceRef:string;summary:string;digest:string;capturedAt:number;confidence:number};
export type ContentQualityCheck={key:string;label:string;status:"pass"|"warning";detail:string};
export type ContentAgentResult={events:AgentEventEnvelope[];markdown:string;wordCount:number;qualityScore:number;checks:ContentQualityCheck[];evidence:ContentEvidence[];reviewRequired:true};
const sha=(value:string)=>createHash("sha256").update(value).digest("hex");
const clean=(value:unknown,max=5000)=>String(value??"").replace(/\s+/g," ").trim().slice(0,max);
const base=(input:AgentExecutionEnvelope,sequence:number)=>({schemaVersion:"1" as const,eventId:`${input.taskId}:${sequence}`,sequence,occurredAt:Math.floor(Date.now()/1000),organizationId:input.organizationId,projectId:input.projectId,taskId:input.taskId,jobId:input.jobId,attemptId:input.attemptId,correlationId:input.correlationId,agent:{key:CONTENT_AGENT_KEY,version:CONTENT_AGENT_VERSION}});

export class ContentAgent implements AgentImplementation{
  readonly manifest=contentAgentManifest;
  constructor(private readonly evidence:ContentEvidence[]){}
  async run(input:AgentExecutionEnvelope){return(await this.runDetailed(input)).events;}
  async runDetailed(input:AgentExecutionEnvelope):Promise<ContentAgentResult>{
    let sequence=0;const events:AgentEventEnvelope[]=[];const progress=(step:string,percent:number,messageKey:string)=>events.push({...base(input,++sequence),kind:"progress",progress:{step,percent,messageKey,messageArgs:{}}});
    const title=clean(input.input.title,160),keyword=clean(input.input.keyword,160),audience=clean(input.input.audience,300),intent=clean(input.input.intent,100),tone=clean(input.input.tone,200),goal=clean(input.input.goal,300),sourceRef=clean(input.input.sourceRef,1000),brief=clean(input.input.brief,5000),contentType=clean(input.input.contentType,40);
    progress("brief_validation",10,"content.brief.validating");
    if(!title||!keyword||!audience||!intent||!tone||!goal||!sourceRef){events.push({...base(input,++sequence),kind:"error",error:{code:"content.brief.invalid",category:"validation",retryable:false,messageKey:"content.brief.invalid",redactedDetail:null,recoveryAction:"reconfigure"}});return{events,markdown:"",wordCount:0,qualityScore:0,checks:[],evidence:[],reviewRequired:true};}
    const selected=this.evidence.slice(0,12);for(const item of selected)events.push({...base(input,++sequence),kind:"evidence",evidence:{id:item.id,capturedAt:item.capturedAt,source:{type:"public",ref:item.sourceRef},summary:item.summary,digest:item.digest,confidence:item.confidence}});
    progress("draft_generation",45,"content.draft.generating");
    const evidenceLines=selected.length?selected.map((item,index)=>`${index+1}. ${item.summary}\n   - 来源：${item.sourceRef}\n   - 证据 ID：${item.id}`).join("\n"): `1. Brief 指定来源：${sourceRef}\n   - 该来源需要编辑在发布前复核。`;
    const typeName:{[key:string]:string}={blog_post:"博客文章",guide:"深度指南",landing_page:"商业落地页",content_refresh:"内容更新"};
    const markdown=`# ${title}\n\n> 状态：AI 辅助草稿，等待人工审核。本文不会把未验证的搜索量、排名或商业数据写成事实。\n\n## Content Brief\n\n- 目标关键词：${keyword}\n- 内容类型：${typeName[contentType]||contentType}\n- 目标受众：${audience}\n- 搜索意图：${intent}\n- 品牌语气：${tone}\n- 内容目标：${goal}\n- 指定来源：${sourceRef}\n${brief?`- 补充要求：${brief}\n`:""}\n## 摘要\n\n本文围绕“${keyword}”为${audience}建立一条清晰、可验证的理解路径，先说明核心问题，再给出评估方法、执行步骤和下一步行动。所有需要外部数据支持的结论都应在发布前由编辑核验。\n\n## 为什么这个主题值得关注\n\n读者搜索“${keyword}”时，需要的不只是定义，而是能够判断自身情况、比较方案并采取行动的信息。内容应围绕“${goal}”组织，避免空泛承诺，并将关键结论与下方证据逐一对应。\n\n## 评估与决策框架\n\n### 1. 明确目标与使用场景\n\n先确认读者当前问题、预期结果和限制条件。对${audience}而言，建议把目标拆分为可理解、可执行、可复核的阶段。\n\n### 2. 核验事实与证据\n\n引用数据、产品能力或效果结论时，必须保留来源。没有来源支持的数字、排名和客户结果不得直接发布。\n\n### 3. 形成可执行方案\n\n将建议转化为优先级、负责人、完成标准和复核节点。正文结构应服务于${intent}，并自然覆盖目标关键词，而不是重复堆砌。\n\n## 推荐执行步骤\n\n1. 审核 Brief 中的受众、意图和目标是否一致。\n2. 根据证据清单补充可引用事实，并删除无法核验的表述。\n3. 检查标题、H2/H3、摘要、FAQ 与 CTA 是否覆盖读者任务。\n4. 由人工编辑完成品牌语气、合规和发布前终审。\n\n## 常见问题\n\n### 什么样的内容才算完成？\n\n不仅要写完正文，还要通过来源、结构、SEO/GEO 可读性和人工审批检查。\n\n### 可以直接自动发布吗？\n\n不可以。Content Agent 只生成草稿和质量记录，发布必须经过人工审核并交由 Publish Agent 执行。\n\n### 缺少外部数据时怎么办？\n\n保留“待核验”标记或删除相关结论，不使用推测值代替真实数据。\n\n## 下一步行动\n\n根据“${goal}”完成编辑复核，确认所有引用来源可访问、关键事实可追溯，再提交发布审批。\n\n## 证据清单\n\n${evidenceLines}\n`;
    progress("quality_gate",80,"content.quality.checking");
    const checks:ContentQualityCheck[]=[
      {key:"brief_complete",label:"Brief 字段完整",status:"pass",detail:"标题、关键词、受众、意图、语气、目标和来源均已提供"},
      {key:"structure",label:"标题与结构完整",status:/^# .+\n[\s\S]*## /m.test(markdown)?"pass":"warning",detail:"包含 H1、分节、FAQ 与 CTA"},
      {key:"keyword",label:"关键词自然覆盖",status:markdown.split(keyword).length>2?"pass":"warning",detail:`目标关键词“${keyword}”已在关键段落中使用`},
      {key:"evidence",label:"证据可追溯",status:selected.length||sourceRef?"pass":"warning",detail:selected.length?`关联 ${selected.length} 条研究证据`:"仅有关联来源，需编辑复核"},
      {key:"geo",label:"AI 可回答结构",status:/## 常见问题/.test(markdown)?"pass":"warning",detail:"包含摘要、步骤与 FAQ"},
      {key:"human_review",label:"人工审核",status:"warning",detail:"内容生成不会绕过发布审批"},
    ];
    const passed=checks.filter(item=>item.status==="pass").length,qualityScore=Math.round(passed/checks.length*100),wordCount=markdown.replace(/[#>*`\-\d.]/g," ").split(/\s+/).filter(Boolean).length;
    events.push({...base(input,++sequence),kind:"recommendation",recommendation:{id:`review-${input.taskId}`,title:`审核并完善：${title}`,evidenceRefs:selected.map(item=>item.id),confidence:selected.length?0.9:0.65,impactHypothesis:"完成事实核验和品牌编辑后进入发布队列。",risk:"medium",changeSetRef:null,estimatedCost:0,expiresAt:Math.floor(Date.now()/1000)+604800,rollbackRequired:false}});
    const digest=sha(markdown);events.push({...base(input,++sequence),kind:"artifact",artifact:{uploadRef:`content-draft:${input.taskId}`,filename:`content-draft-${input.taskId}.md`,mimeType:"text/markdown",size:Buffer.byteLength(markdown),digest,retentionClass:"standard"}});events.push({...base(input,++sequence),kind:"usage",usage:{eventId:`content:${input.taskId}:generated`,meter:"content.items",quantity:1,unit:"item",measuredAt:Math.floor(Date.now()/1000),final:true}});progress("completed",100,"content.completed");
    return{events,markdown,wordCount,qualityScore,checks,evidence:selected,reviewRequired:true};
  }
}
