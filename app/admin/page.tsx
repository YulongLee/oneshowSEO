import Link from "next/link";
import { CheckCircle, Clock, Warning } from "@phosphor-icons/react/dist/ssr";
import { getDatabase } from "../../lib/auth";
import { ensureProductSchema } from "../../lib/product";
import { integrationRepository } from "../../lib/integrations";
import { requireOperatorConsole } from "../../lib/operator-administration";
import { OperationsConsole } from "./OperationsConsole";
import { ObservabilityConsole } from "./ObservabilityConsole";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const { role } = await requireOperatorConsole();
  if (role !== "platform_admin") return <>
    <div className="admin-title"><div><span>{role}</span><h1>职责隔离的运营中心</h1><p>仅展示当前后台角色获准查看的真实状态；无权数据不会查询。</p></div></div>
    <OperationsConsole/><ObservabilityConsole/>
  </>;
  await ensureProductSchema();
  await integrationRepository();
  const db = getDatabase();
  const count = (sql: string) => Number(db.prepare(sql).first<{ count: number }>()?.count || 0);
  const users = count("SELECT COUNT(*) count FROM users");
  const organizations = count("SELECT COUNT(*) count FROM identity_organizations");
  const projects = count("SELECT COUNT(*) count FROM projects");
  const completed = count("SELECT COUNT(*) count FROM audit_runs WHERE status='completed'");
  const failed = count("SELECT COUNT(*) count FROM audit_runs WHERE status='failed'");
  const pending = count("SELECT COUNT(*) count FROM seo_tasks WHERE status='proposed'");
  const jobs = count("SELECT COUNT(*) count FROM execution_jobs WHERE state IN ('queued','running','retry_wait','quarantined')");
  const connections = db.prepare("SELECT provider_id provider,state status,COUNT(*) count FROM integration_connections WHERE deleted_at IS NULL GROUP BY provider_id,state ORDER BY provider_id,state").all<{provider:string;status:string;count:number}>().results;
  return <>
    <div className="admin-title"><div><span>商业化运营</span><h1>运营总览</h1><p>用户、租户、项目、执行、支付和数据连接均来自当前平台记录。</p></div><Link className="admin-workspace-link" href="/workspace">进入产品工作台</Link></div>
    <div className="admin-kpis">{[["注册用户",users,"真实账户"],["客户租户",organizations,"独立商业主体"],["客户项目",projects,"已创建项目"],["运行中任务",jobs,"队列与重试"]].map(([label,value,description])=><article key={String(label)}><span>{label}</span><strong>{value}</strong><small>{description}</small></article>)}</div>
    <div className="admin-grid">
      <section className="admin-panel"><div className="admin-panel-title"><div><h2>交付健康</h2><p>来自真实诊断与审批记录</p></div><span>{failed ? "需要关注" : "运行正常"}</span></div><div className="admin-health-facts"><p><CheckCircle/>完成诊断 <b>{completed}</b></p><p><Warning/>失败诊断 <b>{failed}</b></p><p><Clock/>等待客户审批 <b>{pending}</b></p></div></section>
      <section className="admin-panel"><div className="admin-panel-title"><div><h2>数据连接</h2><p>按 Provider 汇总连接状态</p></div><Link href="/admin/integrations">管理集成</Link></div><div className="admin-connection-facts">{connections.length?connections.map(item=><p key={`${item.provider}-${item.status}`}><span>{item.provider}</span><em className={item.status}>{item.status}</em><b>{item.count}</b></p>):<p>尚无客户数据连接</p>}</div></section>
    </div>
    <OperationsConsole/><ObservabilityConsole/>
  </>;
}
