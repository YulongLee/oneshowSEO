import type { DataState } from "../../core/contracts";

export type WorkspaceAvailability = Record<string,{state:DataState;message:string;source:string;capturedAt?:number}>;
export type WorkspaceFacts = {capturedAt:number;hasAudit:boolean;hasResearch:boolean;hasContentWorkflow?:boolean;hasKnowledgeAssets?:boolean;hasRankTracking?:boolean;hasGeo?:boolean;hasAnalyticsSnapshot?:boolean;hasKeywordMetrics:boolean;hasSearchPerformance:boolean;hasAnalytics:boolean;hasRankProvider:boolean;hasCustomerIntegrations:boolean;billingLive:boolean;apiEnabled:boolean};

export function workspaceAvailability(facts: WorkspaceFacts): WorkspaceAvailability {
  const real=(source:string,message="数据来自当前项目的持久化记录")=>({state:"fresh" as const,message,source,capturedAt:facts.capturedAt});
  const noData=(source:string,message:string)=>({state:"no_data" as const,message,source,capturedAt:facts.capturedAt});
  const needs=(source:string,message:string)=>({state:"permission_required" as const,message,source,capturedAt:facts.capturedAt});
  const unavailable=(source:string,message:string)=>({state:"unavailable" as const,message,source,capturedAt:facts.capturedAt});
  return {
    "总览":facts.hasAudit||facts.hasResearch?real("project_records","只展示已持久化项目数据；无来源指标显示为空"):noData("project_records","完成首次诊断或研究后生成真实总览"),
    "项目中心":real("projects"),
    "Agent Center":real("agent_registry","Agent 注册、启用状态、调度和运行记录均来自当前项目"),
    "竞争对手":facts.hasResearch?real("research_runs"):noData("research_runs","运行 Research Agent 后生成可验证研究记录"),
    "网站诊断":facts.hasAudit?real("audit_runs"):noData("audit_runs","运行首次网站诊断后生成证据与问题清单"),
    "关键词研究":facts.hasResearch?real(facts.hasKeywordMetrics?"rank_provider":"research_runs","只展示真实研究机会；未接入排名源时搜索量、KD 与排名保持为空"):noData("research_runs","运行首次关键词研究后生成真实机会；搜索量与 KD 需接入排名数据源"),
    "内容规划":facts.hasContentWorkflow?real("content_tasks","内容 Brief、草稿、质量检查与审核状态来自真实任务记录"):noData("content_tasks","创建首个内容 Brief 后建立真实内容生产队列"),
    "AI 内容生产":facts.hasContentWorkflow?real("publish_requests","发布准备度、审批、Worker 执行和外部验证均来自真实记录；未连接 CMS 时不会模拟成功"):noData("publish_requests","先生成并审核一份内容，再建立安全发布队列"),
    "GEO Agent":facts.hasGeo?real("geo_runs","站内 GEO 就绪度来自公开页面、结构化数据、权威和爬虫策略证据；外部 AI 提及仍需监控数据源"):noData("geo_runs","运行首次 GEO 扫描后建立真实就绪度基线"),
    "数据分析":facts.hasAnalyticsSnapshot?real("analytics_runs","Analytics 快照来自当前项目的审计、研究、内容和发布证据；GA4/GSC 未同步时不会展示流量、转化或收入估算"):noData("analytics_runs","生成首次 Analytics 快照后建立增长基线；外部流量指标需另行同步 GA4/GSC"),
    "Approval Center":real("approval_decisions","审批状态来自任务和审批记录；丰富变更证据仍在建设"),
    "任务中心":real("seo_tasks"),
    "内容库":facts.hasContentWorkflow?real("content_tasks","只展示已保存的内容任务和产物；未接入 GSC / GA4 时表现指标保持为空"):noData("content_tasks","创建首个内容任务后显示真实内容资产"),
    "知识库":facts.hasKnowledgeAssets?real("knowledge_assets","只展示已保存的知识任务、审计页面和检查证据"):noData("knowledge_assets","添加知识或完成首次网站诊断后建立知识资产"),
    "报告":facts.hasAudit?real("audit_reports","当前仅网站诊断报告可用"):noData("audit_reports","完成网站诊断后可生成真实审计报告"),
    "排名监控":facts.hasRankProvider?real("rank_snapshots"):facts.hasRankTracking?noData("rank_keywords","已保存监控关键词；接入排名供应商并生成快照后才显示排名和趋势"):noData("rank_snapshots","添加监控关键词并接入排名供应商后生成真实排名快照"),
    "AI 可见性":facts.hasGeo?real("geo_runs","当前仅展示站内 GEO 就绪证据；外部 AI 提及、引用和流量在数据源接入前保持为空"):noData("geo_runs","运行 GEO Agent 后建立站内就绪度；外部可见性需独立监控数据源"),
    "数据连接":facts.hasCustomerIntegrations?real("customer_integrations"):noData("customer_integrations","尚未连接项目数据源；WordPress 可使用应用密码建立安全连接"),
    "项目设置":real("projects","基础项目设置来自真实项目记录；未接通的高级设置会明确禁用"),
    "团队":real("project_members"),
    "Billing":facts.billingLive?real("billing_provider"):unavailable("billing_provider","在线结算尚未开放，不会自动扣款或模拟支付成功"),
    "API & MCP":facts.apiEnabled?real("api_access","API 密钥和调用记录真实可用；MCP 服务尚未启用"):needs("entitlements","当前套餐或平台状态未启用 API/MCP"),
    "套餐升级":facts.billingLive?real("billing_provider"):unavailable("billing_provider","套餐页面用于比较能力；在线升级尚未开放，不会产生扣款"),
  };
}
