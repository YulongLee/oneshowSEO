import type { DataState } from "../../core/contracts";

export type WorkspaceAvailability = Record<string,{state:DataState;message:string;source:string;capturedAt?:number}>;
export type WorkspaceFacts = {capturedAt:number;hasAudit:boolean;hasResearch:boolean;hasKeywordMetrics:boolean;hasSearchPerformance:boolean;hasAnalytics:boolean;hasRankProvider:boolean;hasCustomerIntegrations:boolean;billingLive:boolean;apiEnabled:boolean};

export function workspaceAvailability(facts: WorkspaceFacts): WorkspaceAvailability {
  const real=(source:string,message="数据来自当前项目的持久化记录")=>({state:"fresh" as const,message,source,capturedAt:facts.capturedAt});
  const noData=(source:string,message:string)=>({state:"no_data" as const,message,source,capturedAt:facts.capturedAt});
  const needs=(source:string,message:string)=>({state:"permission_required" as const,message,source,capturedAt:facts.capturedAt});
  const demo=(message:string)=>({state:"demo" as const,message,source:"prototype",capturedAt:facts.capturedAt});
  const unavailable=(source:string,message:string)=>({state:"unavailable" as const,message,source,capturedAt:facts.capturedAt});
  return {
    "总览":facts.hasAudit||facts.hasResearch?real("project_records","只展示已持久化项目数据；无来源指标显示为空"):noData("project_records","完成首次诊断或研究后生成真实总览"),
    "项目中心":real("projects"),
    "Agent Center":unavailable("agent_registry","Agent 注册、调度和运行时尚未启用；当前卡片仅为产品预览"),
    "竞争对手":facts.hasResearch?real("research_runs"):noData("research_runs","运行 Research Agent 后生成可验证研究记录"),
    "网站诊断":facts.hasAudit?real("audit_runs"):noData("audit_runs","运行首次网站诊断后生成证据与问题清单"),
    "关键词研究":facts.hasKeywordMetrics?real("rank_provider"):demo("关键词指标数据源尚未接入；页面数值仅用于界面预览，不代表真实排名或搜索量"),
    "内容规划":demo("内容文档与工作流数据源尚未建立；页面内容仅用于界面预览"),
    "AI 内容生产":demo("CMS 发布执行尚未启用；页面发布量、收录率和流量仅用于界面预览"),
    "GEO Agent":demo("AI 可见性数据源尚未接入；提及、引用和 AI 流量数值仅用于界面预览"),
    "数据分析":facts.hasAnalytics&&facts.hasSearchPerformance?real("analytics_snapshots"):demo("GA4 与搜索表现数据尚未完整接入；流量、转化和收入数值仅用于界面预览"),
    "Approval Center":real("approval_decisions","审批状态来自任务和审批记录；丰富变更证据仍在建设"),
    "任务中心":real("seo_tasks"),
    "内容库":demo("内容资产数据源尚未建立；页面条目与表现数值仅用于界面预览"),
    "知识库":demo("知识资产存储尚未建立；页面条目与存储用量仅用于界面预览"),
    "报告":facts.hasAudit?real("audit_reports","当前仅网站诊断报告可用"):noData("audit_reports","完成网站诊断后可生成真实审计报告"),
    "排名监控":facts.hasRankProvider?real("rank_snapshots"):demo("排名数据源尚未接入；关键词排名和趋势仅用于界面预览"),
    "AI 可见性":demo("AI 搜索监控数据源尚未接入；全部可见性数值仅用于界面预览"),
    "数据连接":facts.hasCustomerIntegrations?real("customer_integrations"):unavailable("customer_integrations","客户级安全数据连接尚未启用；请等待集成密钥管理上线"),
    "项目设置":real("projects","基础项目设置来自真实项目记录；未接通的高级设置会明确禁用"),
    "团队":real("project_members"),
    "Billing":facts.billingLive?real("billing_provider"):unavailable("billing_provider","在线结算尚未开放，不会自动扣款或模拟支付成功"),
    "API & MCP":facts.apiEnabled?real("api_access","API 密钥和调用记录真实可用；MCP 服务尚未启用"):needs("entitlements","当前套餐或平台状态未启用 API/MCP"),
    "套餐升级":facts.billingLive?real("billing_provider"):unavailable("billing_provider","套餐页面用于比较能力；在线升级尚未开放，不会产生扣款"),
  };
}
