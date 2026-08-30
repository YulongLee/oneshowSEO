import { requirePlatformAdministrator } from "../../../lib/operator-administration";
import { OperatorAssignments } from "../OperatorAssignments";

export const dynamic = "force-dynamic";
const state=(ready:boolean)=>ready?"已就绪":"未配置";
export default async function AdminSettingsPage(){await requirePlatformAdministrator();const checks=[
  ["后台管理员白名单",Boolean(process.env.ADMIN_EMAILS||process.env.ADMIN_EMAIL),"通过 ADMIN_EMAILS 管理初始管理员与恢复入口"],
  ["平台数据加密",Boolean(process.env.DATA_SOURCE_ENCRYPTION_KEY),"保护平台数据源凭据"],
  ["支付配置加密",Boolean(process.env.PAYMENT_CONFIG_ENCRYPTION_KEY),"保护支付宝私钥与微信 API v3 密钥"],
  ["生产支付总开关",process.env.BILLING_LIVE_ENABLED==="true","关闭时仅允许保存和校验支付配置"],
  ["后台 Worker",process.env.WORKER_RUNTIME_ENABLED==="true","负责 Agent 执行、报告生成和 Credits 结算"],
];return <><div className="admin-title"><div><span>平台治理</span><h1>平台设置</h1><p>管理后台职责分工并检查商业化关键环境是否具备上线条件。</p></div></div><OperatorAssignments/><section className="admin-panel readiness-panel"><div className="admin-panel-title"><div><h2>商业化上线条件</h2><p>仅展示是否配置，不展示任何密钥或敏感值。</p></div></div>{checks.map(([label,ready,description])=><article key={String(label)}><strong>{label}<small>{description}</small></strong><em className={ready?"ready":"missing"}>{state(Boolean(ready))}</em></article>)}</section></>;}
