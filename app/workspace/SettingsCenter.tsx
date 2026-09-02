"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Bell,
  Brain,
  Check,
  Database,
  FileText,
  Gear,
  Globe,
  PencilSimple,
  Robot,
  ShieldCheck,
  UsersThree,
  WarningCircle,
  X,
} from "@phosphor-icons/react";

type Project = {
  id: string;
  name: string;
  siteUrl: string;
  host: string;
  market: string;
  language: string;
  timezone?: string;
  businessGoal?: string;
  approvalMode?: "required" | "low_risk_auto";
  scheduleEnabled?: number;
  status?: "active" | "archived" | "pending_deletion";
  version?: number;
  businessType?: string;
  searchEngines?: string[];
  createdAt?: number;
};
type User = { name: string; email: string; role: string; plan: string };
type Integration = { id: string; providerId: string; state: string; maskedHint: string; grantedScopes: string[] };
type Catalog = { id: string; name: string; category: string; capabilities: string[]; setup: string };
type IntegrationsData = { connections: Integration[]; catalog: Catalog[]; permissions: { manageable: boolean } };
type Member = { id: string; name: string; email: string; role: string; owner?: boolean };
type TeamData = { owner: Member | null; members: Member[]; seats?: { used: number; pending: number; limit: number }; permissions?: { canManage: boolean } };
type Schedule = { id: string; scheduleKey: string; enabled: boolean; pausedAt: number | null; nextRunAt: number | null; timezone: string; cron: string; revision: number };
type Preference = { notificationType: string; inAppEnabled: boolean; emailEnabled: boolean; locale: "zh-CN" | "en"; version: number };

const tabs = ["项目设置", "数据源", "发布渠道", "AI & Agent", "团队与权限", "通知设置", "系统设置"];
const notificationNames: Record<string, string> = {
  task_completed: "任务执行完成",
  task_failed: "任务执行失败",
  task_quarantined: "任务需要人工处理",
  security_alert: "账户安全提醒",
};
const connectionLabels: Record<string, string> = {
  connected: "已连接",
  syncing: "同步中",
  degraded: "服务降级",
  expired: "凭据过期",
  permission_required: "需要授权",
  rate_limited: "已限流",
  error: "连接错误",
  disconnected: "未连接",
};
const formatDate = (value?: number | null) => value ? new Date(value * 1000).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "未安排";

export default function SettingsCenter({ project, user, refresh, navigate }: { project: Project; user: User; refresh: () => Promise<void>; navigate: (value: string) => void }) {
  const [tab, setTab] = useState("项目设置");
  const [integrations, setIntegrations] = useState<IntegrationsData | null>(null);
  const [team, setTeam] = useState<TeamData | null>(null);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [preferences, setPreferences] = useState<Preference[]>([]);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: project.name,
    siteUrl: project.siteUrl,
    market: project.market,
    language: project.language,
    timezone: project.timezone || "Asia/Shanghai",
    businessGoal: project.businessGoal || "organic_growth",
    approvalMode: project.approvalMode || "required",
    scheduleEnabled: Boolean(project.scheduleEnabled),
    businessType: project.businessType || "business",
    searchEngines: project.searchEngines?.length ? project.searchEngines : ["google", "bing"],
  });

  const load = useCallback(async () => {
    const requests = await Promise.allSettled([
      fetch(`/api/integrations?projectId=${encodeURIComponent(project.id)}`, { cache: "no-store" }).then(async r => { const v = await r.json(); if (!r.ok) throw new Error(v.error); return v; }),
      fetch(`/api/projects/${encodeURIComponent(project.id)}/team?page=1&pageSize=4&status=active&role=all&query=`, { cache: "no-store" }).then(async r => { const v = await r.json(); if (!r.ok) throw new Error(v.error); return v; }),
      fetch(`/api/agents/schedules?projectId=${encodeURIComponent(project.id)}`, { cache: "no-store" }).then(async r => { const v = await r.json(); if (!r.ok) throw new Error(v.error); return v; }),
      fetch("/api/notifications/preferences", { cache: "no-store" }).then(async r => { const v = await r.json(); if (!r.ok) throw new Error(v.error); return v; }),
    ]);
    if (requests[0].status === "fulfilled") setIntegrations(requests[0].value);
    if (requests[1].status === "fulfilled") setTeam(requests[1].value);
    if (requests[2].status === "fulfilled") setSchedules(requests[2].value.schedules || []);
    if (requests[3].status === "fulfilled") setPreferences(requests[3].value.preferences || []);
  }, [project.id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    setForm({ name: project.name, siteUrl: project.siteUrl, market: project.market, language: project.language, timezone: project.timezone || "Asia/Shanghai", businessGoal: project.businessGoal || "organic_growth", approvalMode: project.approvalMode || "required", scheduleEnabled: Boolean(project.scheduleEnabled), businessType: project.businessType || "business", searchEngines: project.searchEngines?.length ? project.searchEngines : ["google", "bing"] });
  }, [project]);

  const activeConnections = useMemo(() => integrations?.connections.filter(item => !["disconnected", "error", "expired", "permission_required"].includes(item.state)) || [], [integrations]);
  const wordpress = activeConnections.find(item => item.providerId === "wordpress");
  const members = [team?.owner, ...(team?.members || [])].filter(Boolean) as Member[];
  const baseUrl = useMemo(() => { try { return new URL(project.siteUrl).origin; } catch { return project.siteUrl; } }, [project.siteUrl]);

  async function saveProject(event: React.FormEvent) {
    event.preventDefault(); setBusy("project"); setError(""); setMessage("");
    const response = await fetch("/api/projects", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: project.id, version: project.version || 1, ...form }) });
    const payload = await response.json().catch(() => ({})); setBusy("");
    if (!response.ok) { setError(payload.error || "项目设置保存失败"); return; }
    setMessage("项目设置已保存"); setEditing(false); await refresh();
  }

  async function updatePreference(item: Preference, field: "inAppEnabled" | "emailEnabled") {
    setBusy(item.notificationType + field); setError("");
    const response = await fetch("/api/notifications/preferences", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...item, [field]: !item[field] }) });
    const payload = await response.json().catch(() => ({})); setBusy("");
    if (!response.ok) { setError(payload.error || "通知设置保存失败"); return; }
    setPreferences(current => current.map(value => value.notificationType === item.notificationType ? payload.preference : value));
    setMessage("通知偏好已更新");
  }

  return <div className="settings-center-page">
    <header className="settings-center-header">
      <div><h1>设置</h1><p>管理项目配置、集成、团队和系统设置。</p></div>
      <div className="settings-project-chip"><Globe/><span><strong>{project.name}</strong><small>{project.host}</small></span></div>
    </header>
    <nav className="settings-center-tabs" aria-label="设置导航">{tabs.map(item => <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{item}</button>)}</nav>
    {error && <p className="settings-center-alert error"><WarningCircle/>{error}</p>}
    {message && <p className="settings-center-alert success"><Check/>{message}</p>}

    {tab === "项目设置" && <SettingsOverview project={project} user={user} baseUrl={baseUrl} integrations={integrations} activeConnections={activeConnections} wordpress={wordpress} schedules={schedules} team={team} members={members} preferences={preferences} edit={() => setEditing(true)} open={setTab} navigate={navigate}/>}
    {tab === "数据源" && <section className="settings-detail-card"><SectionTitle icon={<Database/>} title="数据源连接" description="连接状态与权限来自当前项目的真实集成记录。" action="打开连接中心" onAction={() => navigate("数据连接")}/><div className="settings-source-list">{integrations?.catalog.map(item => { const current = integrations.connections.find(value => value.providerId === item.id && value.state !== "disconnected"); return <article key={item.id}><span className="settings-icon"><Database/></span><div><strong>{item.name}</strong><small>{item.capabilities.join(" · ")}</small></div><em className={current?.state === "connected" ? "ok" : "waiting"}>{current ? connectionLabels[current.state] || current.state : item.setup === "oauth_pending" ? "等待平台授权" : item.setup === "api_key" ? "可配置" : "暂未开放"}</em></article>; }) || <Empty text="正在读取连接配置…"/>}</div></section>}
    {tab === "发布渠道" && <section className="settings-detail-card"><SectionTitle icon={<FileText/>} title="发布渠道" description="发布能力只展示已形成真实连接的渠道。" action="管理渠道" onAction={() => navigate("数据连接")}/>{wordpress ? <div className="settings-channel"><span className="settings-icon"><Globe/></span><div><strong>WordPress</strong><small>{wordpress.maskedHint || project.host}</small></div><em className="ok">已连接</em></div> : <Empty text="尚未连接发布渠道。当前可在数据源页面配置 WordPress。"/>}</section>}
    {tab === "AI & Agent" && <section className="settings-detail-card"><SectionTitle icon={<Brain/>} title="AI & Agent 设置" description="模型由平台安全托管；这里展示当前项目的真实自动调度。" action="打开工作流" onAction={() => navigate("工作流")}/>{schedules.length ? <div className="settings-schedule-grid">{schedules.map(item => <article key={item.id}><span className="settings-icon"><Robot/></span><div><strong>{item.scheduleKey}</strong><small>{item.cron} · {item.timezone}</small></div><em className={item.enabled && !item.pausedAt ? "ok" : "waiting"}>{item.enabled && !item.pausedAt ? `下次 ${formatDate(item.nextRunAt)}` : "已暂停"}</em></article>)}</div> : <Empty text="当前项目还没有 Agent 定时调度。"/>}</section>}
    {tab === "团队与权限" && <section className="settings-detail-card"><SectionTitle icon={<UsersThree/>} title="团队与权限" description="成员、席位与权限均来自组织身份系统。" action="管理团队" onAction={() => navigate("团队")}/><div className="settings-member-list">{members.map(member => <article key={member.id}><span className="settings-avatar">{member.name.slice(0, 1).toUpperCase()}</span><div><strong>{member.name}{member.owner ? "（所有者）" : ""}</strong><small>{member.email}</small></div><em>{member.role}</em></article>)}</div>{!members.length && <Empty text="暂无可显示的团队成员。"/>}</section>}
    {tab === "通知设置" && <section className="settings-detail-card"><SectionTitle icon={<Bell/>} title="通知设置" description="选择任务与安全事件的站内和邮件通知方式。"/><div className="settings-notification-table"><header><span>通知类型</span><span>站内通知</span><span>邮件</span></header>{preferences.map(item => <article key={item.notificationType}><div><strong>{notificationNames[item.notificationType] || item.notificationType}</strong><small>{item.locale === "zh-CN" ? "简体中文" : "English"}</small></div><Toggle checked={item.inAppEnabled} disabled={busy === item.notificationType + "inAppEnabled"} onClick={() => updatePreference(item, "inAppEnabled")}/><Toggle checked={item.emailEnabled} disabled={busy === item.notificationType + "emailEnabled"} onClick={() => updatePreference(item, "emailEnabled")}/></article>)}</div>{!preferences.length && <Empty text="正在读取通知偏好…"/>}</section>}
    {tab === "系统设置" && <section className="settings-detail-card"><SectionTitle icon={<Gear/>} title="系统设置" description="项目治理、语言、时区与审批规则。" action="编辑配置" onAction={() => setEditing(true)}/><div className="settings-system-grid"><Info label="项目状态" value={project.status === "active" ? "运行中" : project.status === "archived" ? "已归档" : "待删除"}/><Info label="默认语言" value={project.language}/><Info label="项目时区" value={project.timezone || "Asia/Shanghai"}/><Info label="审批模式" value={project.approvalMode === "low_risk_auto" ? "低风险自动执行" : "执行前需审批"}/><Info label="自动调度" value={project.scheduleEnabled ? "已启用" : "未启用"}/><Info label="项目版本" value={`v${project.version || 1}`}/></div></section>}

    {editing && <div className="settings-editor-backdrop"><form className="settings-editor" onSubmit={saveProject}><header><div><h2>编辑项目设置</h2><p>保存后立即应用到当前项目。</p></div><button type="button" aria-label="关闭" onClick={() => setEditing(false)}><X/></button></header><div className="settings-form-grid"><label>项目名称<input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}/></label><label>网站地址<input required type="url" value={form.siteUrl} onChange={e => setForm({ ...form, siteUrl: e.target.value })}/></label><label>目标市场<input required value={form.market} onChange={e => setForm({ ...form, market: e.target.value })}/></label><label>默认语言<select value={form.language} onChange={e => setForm({ ...form, language: e.target.value })}><option value="zh-CN">简体中文</option><option value="en">English</option></select></label><label>项目时区<input value={form.timezone} onChange={e => setForm({ ...form, timezone: e.target.value })}/></label><label>审批模式<select value={form.approvalMode} onChange={e => setForm({ ...form, approvalMode: e.target.value })}><option value="required">执行前需审批</option><option value="low_risk_auto">低风险自动执行</option></select></label></div><label className="settings-full-field">业务目标<textarea value={form.businessGoal} onChange={e => setForm({ ...form, businessGoal: e.target.value })}/></label><footer><button type="button" onClick={() => setEditing(false)}>取消</button><button className="primary" disabled={busy === "project"}>{busy === "project" ? "保存中…" : "保存设置"}</button></footer></form></div>}
  </div>;
}

function SettingsOverview({ project, user, baseUrl, integrations, activeConnections, wordpress, schedules, team, members, preferences, edit, open, navigate }: { project: Project; user: User; baseUrl: string; integrations: IntegrationsData | null; activeConnections: Integration[]; wordpress?: Integration; schedules: Schedule[]; team: TeamData | null; members: Member[]; preferences: Preference[]; edit: () => void; open: (value: string) => void; navigate: (value: string) => void }) {
  const engines = project.searchEngines?.length ? project.searchEngines : [];
  return <div className="settings-overview">
    <section className="settings-overview-grid top">
      <article className="settings-card"><CardTitle title="项目基础信息" action="编辑" onAction={edit}/><div className="settings-facts"><Info label="项目名称" value={project.name}/><Info label="网站域名" value={project.host}/><Info label="项目地区" value={project.market}/><Info label="默认语言" value={project.language}/><Info label="时区" value={project.timezone || "Asia/Shanghai"}/><Info label="创建时间" value={project.createdAt ? new Date(project.createdAt * 1000).toLocaleDateString("zh-CN") : "—"}/></div></article>
      <article className="settings-card"><CardTitle title="SEO 设置" action="编辑" onAction={edit}/><div className="settings-facts"><Info label="目标搜索引擎" value={engines.length ? engines.join(" · ") : "尚未配置"}/><Info label="Sitemap 建议地址" value={`${baseUrl}/sitemap.xml`}/><Info label="Robots 建议地址" value={`${baseUrl}/robots.txt`}/><Info label="自动调度" value={project.scheduleEnabled ? "已启用" : "未启用"}/></div><p className="settings-hint"><ShieldCheck/>地址为项目配置建议，需通过技术审计验证可用性。</p></article>
      <article className="settings-card"><CardTitle title="品牌设置" action="配置" onAction={edit}/><div className="settings-facts"><Info label="品牌名称" value={project.name}/><Info label="品牌站点" value={project.host}/><Info label="核心目标" value={project.businessGoal || "尚未配置"}/><Info label="业务类型" value={project.businessType || "尚未配置"}/></div><p className="settings-empty-inline"><FileText/>品牌资料上传能力尚未开放；当前不会展示虚构资料。</p></article>
    </section>
    <section className="settings-overview-grid middle">
      <article className="settings-card"><CardTitle title="数据源连接" action="管理" onAction={() => open("数据源")}/>{integrations ? <><div className="settings-kpi"><strong>{activeConnections.length}</strong><span>个有效连接</span></div><div className="settings-mini-list">{integrations.catalog.slice(0, 4).map(item => { const connection = integrations.connections.find(value => value.providerId === item.id && value.state !== "disconnected"); return <div key={item.id}><span><Database/>{item.name}</span><em className={connection?.state === "connected" ? "ok" : "waiting"}>{connection ? connectionLabels[connection.state] || connection.state : "未连接"}</em></div>; })}</div></> : <Empty text="正在读取数据源…"/>}</article>
      <article className="settings-card"><CardTitle title="发布渠道" action="管理" onAction={() => open("发布渠道")}/>{wordpress ? <div className="settings-channel compact"><span className="settings-icon"><Globe/></span><div><strong>WordPress</strong><small>{wordpress.maskedHint || project.host}</small></div><em className="ok">已连接</em></div> : <Empty text="尚未连接发布渠道"/>}<button className="settings-text-button" onClick={() => navigate("数据连接")}>配置真实发布连接 <ArrowRight/></button></article>
      <article className="settings-card"><CardTitle title="AI & Agent 设置" action="管理" onAction={() => open("AI & Agent")}/><div className="settings-kpi"><strong>{schedules.filter(item => item.enabled && !item.pausedAt).length}</strong><span>个启用中的调度</span></div><div className="settings-mini-list">{schedules.slice(0, 3).map(item => <div key={item.id}><span><Robot/>{item.scheduleKey}</span><em className={item.enabled && !item.pausedAt ? "ok" : "waiting"}>{item.enabled && !item.pausedAt ? formatDate(item.nextRunAt) : "已暂停"}</em></div>)}</div>{!schedules.length && <p className="settings-empty-inline"><Brain/>尚未创建 Agent 定时调度。</p>}</article>
    </section>
    <section className="settings-overview-grid bottom">
      <article className="settings-card"><CardTitle title="团队与权限" action="管理" onAction={() => open("团队与权限")}/><div className="settings-team-summary"><div className="settings-avatars">{members.slice(0, 4).map(member => <span key={member.id}>{member.name.slice(0, 1).toUpperCase()}</span>)}</div><strong>{members.length} 位活跃成员</strong><small>{team?.seats ? `席位 ${team.seats.used}/${team.seats.limit}` : `当前账户：${user.email}`}</small></div></article>
      <article className="settings-card"><CardTitle title="通知设置" action="管理" onAction={() => open("通知设置")}/><div className="settings-notification-summary"><span><Bell/></span><div><strong>{preferences.filter(item => item.inAppEnabled).length} 项站内通知已启用</strong><small>{preferences.filter(item => item.emailEnabled).length} 项邮件通知已启用</small></div></div><p className="settings-hint">通知偏好按当前账户独立保存。</p></article>
    </section>
  </div>;
}

function SectionTitle({ icon, title, description, action, onAction }: { icon: React.ReactNode; title: string; description: string; action?: string; onAction?: () => void }) { return <header className="settings-detail-title"><div><span>{icon}</span><div><h2>{title}</h2><p>{description}</p></div></div>{action && <button onClick={onAction}>{action}<ArrowRight/></button>}</header>; }
function CardTitle({ title, action, onAction }: { title: string; action: string; onAction: () => void }) { return <header className="settings-card-title"><h2>{title}</h2><button onClick={onAction}><PencilSimple/>{action}</button></header>; }
function Info({ label, value }: { label: string; value: string }) { return <div className="settings-info"><span>{label}</span><strong title={value}>{value}</strong></div>; }
function Empty({ text }: { text: string }) { return <div className="settings-empty"><Database/><p>{text}</p></div>; }
function Toggle({ checked, disabled, onClick }: { checked: boolean; disabled?: boolean; onClick: () => void }) { return <button type="button" className={`settings-toggle ${checked ? "on" : ""}`} disabled={disabled} aria-pressed={checked} onClick={onClick}><span/></button>; }
