import Link from "next/link"; import Image from "next/image";
import { Buildings,Users,Queue,Pulse,Plug,Receipt,ShieldCheck,Gear,UserCircle,CheckCircle,Warning,Clock } from "@phosphor-icons/react/dist/ssr";
import { getDatabase } from "../../lib/auth"; import { ensureProductSchema } from "../../lib/product"; import { ensureDataSourceSchema } from "../../lib/data-sources"; import { CommercialUsers } from "./CommercialUsers"; import { DataSourceSettings } from "./DataSourceSettings"; import { UsageReconciliation } from "./UsageReconciliation";
import { integrationRepository } from "../../lib/integrations";
import { OperationsConsole } from "./OperationsConsole";
import { ObservabilityConsole } from "./ObservabilityConsole";
import { requireOperatorConsole } from "../../lib/operator-administration";
export const dynamic="force-dynamic";
export default async function AdminPage(){const{user:admin,role}=await requireOperatorConsole();await ensureProductSchema();await ensureDataSourceSchema();await integrationRepository();const db=getDatabase();
 if(role!=="platform_admin")return <main className="admin-shell"><aside className="admin-sidebar"><Link href="/"><Image src="/brand/oneshowseo.png" alt="OneShowSEO" width={164} height={42} unoptimized/></Link><span className="admin-badge">{role.toUpperCase()}</span><nav><span className="admin-nav-active"><Pulse/>运营总览</span><span><ShieldCheck/>授权范围</span></nav><div className="admin-user"><UserCircle weight="fill"/><div><strong>{admin.name}</strong><small>{admin.email}</small></div></div></aside><section className="admin-main"><header><div><strong>职责隔离的运营数据</strong></div></header><div className="admin-inner"><div className="admin-title"><div><span>{role}</span><h1>OneShowSEO 运营中心</h1><p>仅展示当前后台角色获准查看的真实状态；无权数据不会查询。</p></div></div><OperationsConsole/><ObservabilityConsole/></div></section></main>;
 const users=db.prepare("SELECT COUNT(*) AS count FROM users").first<{count:number}>()?.count||0;
 const projects=db.prepare("SELECT COUNT(*) AS count FROM projects").first<{count:number}>()?.count||0;
 const runs=db.prepare("SELECT COUNT(*) AS count FROM audit_runs WHERE status='completed'").first<{count:number}>()?.count||0;
 const failed=db.prepare("SELECT COUNT(*) AS count FROM audit_runs WHERE status='failed'").first<{count:number}>()?.count||0;
 const proposed=db.prepare("SELECT COUNT(*) AS count FROM seo_tasks WHERE status='proposed'").first<{count:number}>()?.count||0;
 const projectRows=db.prepare(`SELECT p.id,p.host,p.name,u.name AS owner,u.plan,p.updated_at AS updatedAt,
   (SELECT status FROM audit_runs r WHERE r.project_id=p.id ORDER BY started_at DESC LIMIT 1) AS lastStatus,
   (SELECT score FROM audit_runs r WHERE r.project_id=p.id ORDER BY started_at DESC LIMIT 1) AS score,
   (SELECT COUNT(*) FROM findings f WHERE f.project_id=p.id AND f.status='open') AS openFindings
   FROM projects p JOIN users u ON u.id=p.user_id ORDER BY p.updated_at DESC LIMIT 100`).all<{id:string;host:string;name:string;owner:string;plan:string;updatedAt:number;lastStatus:string|null;score:number|null;openFindings:number}>().results;
 const connections=db.prepare("SELECT provider_id AS provider,state AS status,COUNT(*) AS count FROM integration_connections WHERE deleted_at IS NULL GROUP BY provider_id,state ORDER BY provider_id,state").all<{provider:string;status:string;count:number}>().results;
 return <main className="admin-shell"><aside className="admin-sidebar"><Link href="/"><Image src="/brand/oneshowseo.png" alt="OneShowSEO" width={164} height={42} unoptimized/></Link><span className="admin-badge">ADMIN CONSOLE</span><nav>{[[Pulse,"运营总览"],[Buildings,"项目与租户"],[Users,"用户与权限"],[Queue,"任务队列"],[Plug,"集成状态"],[Receipt,"套餐与账单"],[ShieldCheck,"审计日志"],[Gear,"系统设置"]].map(([Icon,label],i)=><span className={i===0?"admin-nav-active":""} key={label as string}><Icon/>{label as string}</span>)}</nav><div className="admin-user"><UserCircle weight="fill"/><div><strong>{admin.name}</strong><small>{admin.email}</small></div></div></aside>
 <section className="admin-main"><header><div><strong>生产运营数据</strong></div><div><span>真实数据库</span><UserCircle weight="fill"/></div></header><div className="admin-inner"><div className="admin-title"><div><span>商业化运营</span><h1>OneShowSEO 运营中心</h1><p>用户、项目、执行、故障和数据连接均来自当前平台记录。</p></div><Link className="admin-workspace-link" href="/workspace">进入产品工作台</Link></div>
 <div className="admin-kpis">{[["注册用户",users,"账户总数"],["客户项目",projects,"真实创建项目"],["完成诊断",runs,"历史成功执行"],["待审批任务",proposed,"客户决策队列"]].map(x=><article key={x[0] as string}><span>{x[0]}</span><strong>{x[1]}</strong><small>{x[2]}</small></article>)}</div>
 <div className="admin-grid"><section className="admin-panel"><div className="admin-panel-title"><div><h2>运行健康</h2><p>基于诊断运行记录，不使用模拟可用率</p></div><span>{failed?"需要关注":"暂无失败"}</span></div><div className="admin-health-facts"><p><CheckCircle/>已完成诊断 <b>{runs}</b></p><p><Warning/>失败诊断 <b>{failed}</b></p><p><Clock/>等待客户审批 <b>{proposed}</b></p></div></section><section className="admin-panel"><div className="admin-panel-title"><div><h2>数据连接</h2><p>按提供方统计真实连接状态</p></div></div><div className="admin-connection-facts">{connections.length?connections.map(x=><p key={`${x.provider}-${x.status}`}><span>{x.provider}</span><em className={x.status}>{x.status}</em><b>{x.count}</b></p>):<p>尚无客户项目</p>}</div></section></div>
 {role==="platform_admin"&&<DataSourceSettings/>}
 {role==="platform_admin"&&<UsageReconciliation/>}
 <OperationsConsole/>
 <ObservabilityConsole/>
 {role==="platform_admin"&&<CommercialUsers/>}
 <section className="admin-panel tenant-table"><div className="table-toolbar"><div><h2>项目运行状态</h2><p>项目、套餐、诊断状态和开放问题均来自真实数据</p></div></div><div className="real-project-head"><span>项目</span><span>负责人</span><span>套餐</span><span>最近诊断</span><span>健康分</span><span>开放问题</span></div>{projectRows.length?projectRows.map(x=><div className="real-project-row" key={x.id}><strong>{x.host}<small>{x.name}</small></strong><span>{x.owner}</span><span>{x.plan}</span><em className={x.lastStatus||"none"}>{x.lastStatus||"未运行"}</em><span>{x.score??"—"}</span><span>{x.openFindings}</span></div>):<div className="commercial-empty">尚无客户项目。用户创建项目后会自动出现在这里。</div>}</section>
 </div></section></main>}
