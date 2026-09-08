"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, ArrowClockwise, CalendarBlank, CheckCircle, Clock, FileText, MagnifyingGlass, NotePencil, PaperPlaneTilt, Plus, SpinnerGap, WarningCircle } from "@phosphor-icons/react";
import { contentJourney, safePublishedUrl, type JourneyRun, type JourneyVersion, type JourneyPublication, type JourneyStage } from "../../lib/content-journey";
import ContentPlanCenter from "./ContentPlanCenter";
import ContentCreationStudio from "./ContentCreationStudio";
import ContentLibraryCenter from "./ContentLibraryCenter";
import PublishAgent from "./PublishAgentControl";

type HubView = "工作流" | "选题与计划" | "内容编辑" | "内容资产" | "发布" | "效果";
type Project = { id: string; name: string; siteUrl: string; host: string };
type ContentPayload = { runs: JourneyRun[]; versions: JourneyVersion[]; model?: { ready: boolean; provider: string | null; model: string | null }; generation?: { allowed: boolean; reason?: string; creditCost?: number } };
type PlanPayload = { plans: Array<{ id: string; briefId: string; status: string }>; briefs: Array<{ id: string; topic: string; primaryKeyword: string }> };
type PublishPayload = { requests: JourneyPublication[]; connections?: Array<{ state: string; writeEnabled: boolean }> };
const viewFor = (value: string): HubView => ({"内容计划":"选题与计划","内容规划":"选题与计划","内容创作":"内容编辑","内容库":"内容资产","AI 内容生产":"发布","发布管理":"发布","内容表现":"效果"}[value] as HubView) || "工作流";
const routes: Record<HubView, string> = { 工作流: "总览", 选题与计划: "内容计划", 内容编辑: "内容创作", 内容资产: "内容库", 发布: "发布管理", 效果: "内容表现" };
const titles: Record<HubView, [string,string]> = {
  工作流: ["内容增长工作台", "从一个用户问题开始，让每篇内容走到发布与复盘。"],
  选题与计划: ["内容计划", "确定为谁写、解决什么问题，再安排创作。"],
  内容编辑: ["内容创作", "完善正文、检查事实，审核通过后安排发布。"],
  内容资产: ["内容库", "管理已保存的内容、版本与可复用资产。"],
  发布: ["发布管理", "选择已审核版本，确认渠道并跟进发布结果。"],
  效果: ["内容表现", "核对发布结果，再结合真实数据持续优化内容。"],
};
const stages = {
  planning: { label: "待策划", icon: CalendarBlank },
  generating: { label: "生成中", icon: SpinnerGap },
  draft: { label: "待完善", icon: NotePencil },
  review: { label: "待审核", icon: Clock },
  publish: { label: "待发布", icon: PaperPlaneTilt },
  publishing: { label: "发布处理中", icon: Clock },
  published: { label: "已发布", icon: CheckCircle },
  failed: { label: "需要处理", icon: WarningCircle },
};
type Filter = "all" | JourneyStage | "planning";

export default function ContentHub({ project, user, initialView, navigate, refresh }: { project: Project; user: { name: string; email: string }; initialView: string; navigate: (value: string) => void; refresh: () => Promise<void> }) {
  const view = viewFor(initialView);
  const [content, setContent] = useState<ContentPayload>({ runs: [], versions: [] });
  const [planning, setPlanning] = useState<PlanPayload>({ plans: [], briefs: [] });
  const [publishing, setPublishing] = useState<PublishPayload>({ requests: [] });
  const [loading, setLoading] = useState(true), [errors, setErrors] = useState<string[]>([]);
  const [filter, setFilter] = useState<Filter>("all"), [query, setQuery] = useState("");
  const [createIntent, setCreateIntent] = useState(0);
  const load = useCallback(async () => {
    const results = await Promise.allSettled(["content", "content-plan", "publish"].map(async endpoint => {
      const response = await fetch(`/api/projects/${project.id}/${endpoint}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "读取失败");
      return payload;
    }));
    const names = ["内容", "计划", "发布"];
    setErrors(results.flatMap((result, index) => result.status === "rejected" ? [`${names[index]}：${result.reason instanceof Error ? result.reason.message : "暂时无法读取"}`] : []));
    if (results[0].status === "fulfilled") setContent(results[0].value);
    if (results[1].status === "fulfilled") setPlanning(results[1].value);
    if (results[2].status === "fulfilled") setPublishing(results[2].value);
    setLoading(false);
  }, [project.id]);
  useEffect(() => {
    if (view !== "工作流" && view !== "效果") return;
    const timer = window.setTimeout(() => void load(), 0);
    const poll = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 15000);
    return () => { window.clearTimeout(timer); window.clearInterval(poll); };
  }, [load, view]);
  const rows = useMemo(() => contentJourney(content.runs, content.versions, publishing.requests), [content, publishing]);
  const pendingPlans = planning.plans.filter(plan => ["UNSCHEDULED", "SCHEDULED"].includes(plan.status));
  const counts = (stage: keyof typeof stages) => stage === "planning" ? pendingPlans.length : rows.filter(row => row.stage === stage).length;
  const create = () => {
    if (view === "选题与计划") setCreateIntent(value => value + 1);
    else { sessionStorage.setItem(`oneshowseo:create:${project.id}`, "1"); navigate("内容计划"); }
  };
  const openRow = (row: typeof rows[number]) => {
    sessionStorage.setItem(`oneshowseo:content:${project.id}`, row.run.id);
    if (["publish", "publishing", "published"].includes(row.stage) || row.publishFailure) {
      sessionStorage.setItem(`oneshowseo:publish:${project.id}`, row.run.taskId);
      navigate("发布管理");
    } else navigate("内容创作");
  };
  const openPlan = (id: string) => { sessionStorage.setItem(`oneshowseo:plan:${project.id}`, id); navigate("内容计划"); };
  const search = query.trim().toLowerCase();
  const visibleRows = rows.filter(row => (filter === "all" || row.stage === filter) && `${row.run.title} ${row.run.keyword}`.toLowerCase().includes(search));
  const visiblePlans = pendingPlans.filter(plan => { const brief = planning.briefs.find(item => item.id === plan.briefId); return `${brief?.topic || ""} ${brief?.primaryKeyword || ""}`.toLowerCase().includes(search); });
  const next = rows.find(row => row.stage === "failed") || rows.find(row => row.stage === "review") || rows.find(row => row.stage === "publish") || rows.find(row => row.stage === "draft") || rows.find(row => row.stage === "generating");
  const action = (row: typeof rows[number]) => row.publishFailure ? "处理发布问题" : ({ generating: "查看进度", draft: "继续编辑", review: "审核内容", publish: "安排发布", publishing: "查看发布进度", published: "查看发布记录", failed: "查看原因" }[row.stage]);
  return <section className="content-hub journey-v2">
    <header className="content-hub-header"><div><span>{project.name || project.host || "OneShowSEO"} · 内容运营</span><h1>{titles[view][0]}</h1><p>{titles[view][1]}</p></div><div><button onClick={() => navigate("数据连接")}>渠道与数据连接</button><button className="primary" onClick={create}><Plus />创建内容</button></div></header>
    <nav className="journey-path" aria-label="内容生产流程">{(["工作流", "选题与计划", "内容编辑", "内容资产", "发布", "效果"] as HubView[]).map((item, index) => <button key={item} aria-current={view === item ? "page" : undefined} onClick={() => navigate(routes[item])}><span>{index === 0 ? "0" : index}</span>{index === 0 ? "工作台" : routes[item]}{index < 5 && <ArrowRight />}</button>)}</nav>
    {(view === "工作流" || view === "效果") && <>
      {!!errors.length && <div className="content-hub-error" role="alert"><WarningCircle /><span>{errors.join("；")}。以下仅显示已读取的数据。</span><button onClick={() => void load()}>重新读取</button></div>}
      {view === "工作流" ? <>
        <section className="journey-banner"><div><span>今天的内容工作</span><h2>{loading ? "正在整理你的待办…" : next ? `${counts("failed") + counts("review") + counts("publish") + counts("draft") + counts("generating")} 篇内容等待你处理` : pendingPlans.length ? `${pendingPlans.length} 个计划可以开始创作` : "把下一位客户的问题，变成一篇好内容"}</h2><p>{next ? `${next.run.title} · ${stages[next.stage].label}` : "选择真实需求，补充产品事实，审核后发布到已连接渠道。"}</p><button className="primary" disabled={loading} onClick={() => next ? openRow(next) : pendingPlans[0] ? openPlan(pendingPlans[0].id) : create()}>{next ? action(next) : pendingPlans.length ? "继续计划" : "创建第一篇内容"}<ArrowRight /></button></div><aside><strong>准备情况</strong><p><i className={content.model?.ready ? "ready" : ""} />内容模型：{loading ? "读取中" : content.model?.ready ? "已配置" : "未就绪"}</p><p><i className={publishing.connections?.some(item => item.state === "connected" && item.writeEnabled) ? "ready" : ""} />发布渠道：{loading ? "读取中" : publishing.connections?.some(item => item.state === "connected" && item.writeEnabled) ? "可发布" : "待连接"}</p>{content.generation?.allowed === false && <small>{content.generation.reason}</small>}<button onClick={() => navigate("项目设置")}>完善项目资料 <ArrowRight /></button></aside></section>
        <section className="journey-stages content-stage-strip" aria-label="按内容状态筛选">{(Object.keys(stages) as Array<keyof typeof stages>).map(stage => { const Icon = stages[stage].icon; return <button key={stage} aria-pressed={filter === stage} onClick={() => setFilter(filter === stage ? "all" : stage)}><Icon /><strong>{stages[stage].label}</strong><b>{loading || errors.length ? "—" : counts(stage)}</b></button>; })}</section>
        <section className="journey-list"><header><div><h2>{filter === "all" ? "全部待办与内容" : stages[filter].label}</h2><p>每篇文章保留独立版本，发布结果按渠道记录。</p></div><label><MagnifyingGlass /><input aria-label="搜索内容或关键词" placeholder="搜索标题或关键词" value={query} onChange={event => setQuery(event.target.value)} /></label><button onClick={() => { setFilter("all"); setQuery(""); }}>显示全部</button><button aria-label="刷新内容状态" onClick={() => void load()}><ArrowClockwise /></button></header>
          {loading ? <div className="content-hub-empty" role="status"><SpinnerGap className="spin" />正在加载内容…</div> : <>
            {(filter === "all" || filter === "planning") && visiblePlans.map(plan => { const brief = planning.briefs.find(item => item.id === plan.briefId); return <article key={plan.id}><span className="journey-icon"><CalendarBlank /></span><div><strong>{brief?.topic || "未命名计划"}</strong><small>{brief?.primaryKeyword || "未设置关键词"} · {plan.status === "SCHEDULED" ? "已排期" : "待策划"}</small></div><span className="journey-status">内容计划</span><button onClick={() => openPlan(plan.id)}>查看计划<ArrowRight /></button></article>; })}
            {visibleRows.map(row => { const Icon = stages[row.stage].icon; return <article key={row.run.id}><span className={`journey-icon ${row.stage}`}><Icon /></span><div><strong>{row.run.title || "未命名内容"}</strong><small>{row.run.keyword || "未设置关键词"}{row.version ? ` · V${row.version.versionNumber}` : ""}{row.run.wordCount ? ` · ${row.run.wordCount.toLocaleString("zh-CN")} 字` : ""}</small></div><span className={`journey-status ${row.stage}`}>{stages[row.stage].label}</span><button onClick={() => openRow(row)}>{action(row)}<ArrowRight /></button></article>; })}
            {!visibleRows.length && (!(filter === "all" || filter === "planning") || !visiblePlans.length) && <div className="content-hub-empty"><FileText /><strong>{query || filter !== "all" ? "没有符合条件的内容" : "开始你的第一个内容计划"}</strong><p>{query || filter !== "all" ? "试试其他关键词或查看全部状态。" : "有主题就可以开始，不必先完成关键词研究。"}</p><button onClick={query || filter !== "all" ? () => { setFilter("all"); setQuery(""); } : create}>{query || filter !== "all" ? "清除筛选" : "创建内容"}</button></div>}
          </>}
        </section>
        <section className="journey-shortcuts"><button onClick={() => navigate("关键词研究")}><MagnifyingGlass /><strong>还不知道写什么？</strong><span>从关键词与用户需求发现选题</span><ArrowRight /></button><button onClick={() => navigate("知识库")}><FileText /><strong>让内容更了解你的产品</strong><span>整理产品资料与可引用的事实</span><ArrowRight /></button><button onClick={() => navigate("内容表现")}><CheckCircle /><strong>发布之后继续优化</strong><span>检查渠道发布与页面核验结果</span><ArrowRight /></button></section>
      </> : <section className="journey-results"><div className="journey-data-note"><h2>发布记录与效果复盘</h2><p>以下来自真实发布任务。阅读量、搜索点击和转化尚未接入本视图，不以 0 代替缺失数据；发布成功也不代表已经被搜索引擎收录。</p><button onClick={() => navigate("数据分析")}>查看数据分析 <ArrowRight /></button></div>{loading ? <p role="status">正在读取发布记录…</p> : publishing.requests.length ? publishing.requests.map(request => { const url = safePublishedUrl(request.publishedUrl); return <article key={request.id}><div><strong>{request.title}</strong><p>{request.provider === "wordpress" ? "WordPress" : request.provider || "发布渠道"} · {({ published: "已发布", failed: "发布失败", awaiting_approval: "等待发布审批", queued: "排队中", running: "发布中", rejected: "已拒绝", cancelled: "已取消" } as Record<string,string>)[request.status] || "处理中"}</p>{request.error && <p className="journey-result-error">{request.error}</p>}<small>页面核验：{request.verificationStatus === "verified" ? "已验证" : request.verificationStatus === "failed" ? "核验失败" : "尚未验证"} · 流量与转化：未接入</small></div>{url && <a href={url} target="_blank" rel="noopener noreferrer">打开发布页面 ↗</a>}<button onClick={() => { sessionStorage.setItem(`oneshowseo:publish:${project.id}`, request.contentTaskId); navigate("发布管理"); }}>查看任务<ArrowRight /></button></article>; }) : <div className="content-hub-empty"><PaperPlaneTilt /><strong>还没有发布记录</strong><p>先完成内容审核，再选择渠道发布。</p><button onClick={() => navigate("内容库")}>查看内容库</button></div>}</section>}
    </>}
    {view === "选题与计划" && <ContentPlanCenter project={project} navigate={navigate} createIntent={createIntent} />}
    {view === "内容编辑" && <ContentCreationStudio project={project} navigate={navigate} refresh={refresh} />}
    {view === "内容资产" && <ContentLibraryCenter project={project} user={user} navigate={navigate} />}
    {view === "发布" && <PublishAgent project={project} user={user} navigate={navigate} refresh={refresh} />}
  </section>;
}
