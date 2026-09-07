"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Article,
  ArrowRight,
  CaretDown,
  CaretLeft,
  CaretRight,
  ChartDonut,
  CheckCircle,
  ClockCountdown,
  DownloadSimple,
  Eye,
  FileText,
  FunnelSimple,
  GridFour,
  ListBullets,
  MagnifyingGlass,
  NotePencil,
  PaperPlaneTilt,
  Plus,
  SlidersHorizontal,
  Sparkle,
  Stack,
  WarningCircle,
} from "@phosphor-icons/react";
import type { Icon as PhosphorIcon } from "@phosphor-icons/react";

type Project = { id: string; name: string; host: string };
type ContentRun = {
  id: string;
  taskId: string;
  status: string;
  title: string;
  keyword: string;
  contentType: string;
  wordCount: number;
  qualityScore: number;
  reviewStatus: string | null;
  startedAt: number;
  completedAt: number | null;
  artifactId: string | null;
  archivedAt?: number | null;
  latestVersionId?: string;
};
type ContentVersion = {
  id: string;
  runId: string;
  versionNumber: number;
  wordCount: number;
  createdAt: number;
};
type PublishRequest = {
  id: string;
  contentTaskId: string;
  provider: string;
  versionId?: string;
  status: string;
  verificationStatus: string;
  publishedUrl: string | null;
  createdAt: number;
  updatedAt: number;
};
type ContentPayload = { runs: ContentRun[]; versions: ContentVersion[] };
type PublishPayload = { requests: PublishRequest[] };
type LibraryStatus = "draft" | "review" | "publish" | "published";
type LibraryRow = ContentRun & {
  displayType: string;
  displayStatus: string;
  statusKey: LibraryStatus;
  platform: string;
  updatedAt: number;
  versionNumber: number;
  publishedUrl: string | null;
};

const tabs = ["全部内容", "草稿", "待审核", "待发布", "已发布", "检查通过", "回收站"] as const;
const colors = ["#5b52ed", "#318cf3", "#25a977", "#f0a029", "#ed685b", "#8b69ef"];
const typeLabels: Record<string, string> = {
  blog_post: "深度评测",
  guide: "攻略指南",
  landing_page: "落地页",
  content_refresh: "内容更新",
};
const statusLabels: Record<LibraryStatus, string> = {
  draft: "草稿",
  review: "待审核",
  publish: "待发布",
  published: "已发布",
};
const formatDate = (value?: number | null) =>
  value
    ? new Date(value * 1000).toLocaleString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "待记录";

export default function ContentLibraryCenter({
  project,
  user,
  navigate,
}: {
  project: Project;
  user: { name: string; email: string };
  navigate: (value: string) => void;
}) {
  const [content, setContent] = useState<ContentPayload>({ runs: [], versions: [] });
  const [publishing, setPublishing] = useState<PublishPayload>({ requests: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<(typeof tabs)[number]>("全部内容");
  const [query, setQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [view, setView] = useState<"list" | "grid">("list");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [contentResponse, publishResponse] = await Promise.all([
        fetch(`/api/projects/${project.id}/content`, { cache: "no-store" }),
        fetch(`/api/projects/${project.id}/publish`, { cache: "no-store" }),
      ]);
      const [contentResult, publishResult] = await Promise.all([
        contentResponse.json(),
        publishResponse.json(),
      ]);
      if (!contentResponse.ok) throw new Error(contentResult.error || "内容资产读取失败");
      if (!publishResponse.ok) throw new Error(publishResult.error || "发布状态读取失败");
      setContent({ runs: contentResult.runs || [], versions: contentResult.versions || [] });
      setPublishing({ requests: publishResult.requests || [] });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "内容资产读取失败");
    } finally {
      setLoading(false);
    }
  }, [project.id]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const rows = useMemo<LibraryRow[]>(() => {
    return content.runs.map((run) => {
      const request = publishing.requests.find((item) => item.contentTaskId === run.taskId && item.versionId===run.latestVersionId);
      const versions = content.versions.filter((item) => item.runId === run.id);
      const latestVersion = versions.reduce<ContentVersion | null>(
        (latest, item) => (!latest || item.versionNumber > latest.versionNumber ? item : latest),
        null,
      );
      const isPublished = request?.status === "published" && request.verificationStatus === "verified";
      const statusKey: LibraryStatus = isPublished
        ? "published"
        : run.status !== "completed"
          ? "draft"
          : run.reviewStatus !== "approved"
            ? run.reviewStatus === "pending" ? "review" : "draft"
            : "publish";
      return {
        ...run,
        displayType: typeLabels[run.contentType] || "内容资产",
        displayStatus: statusLabels[statusKey],
        statusKey,
        platform: request?.provider === "wordpress" ? "WordPress" : "官网 / SEO",
        updatedAt: Math.max(run.completedAt || 0, latestVersion?.createdAt || 0, request?.updatedAt || 0, run.startedAt),
        versionNumber: latestVersion?.versionNumber || 1,
        publishedUrl: request?.publishedUrl || null,
      };
    });
  }, [content, publishing]);

  const counts = useMemo(
    () => ({
      all: rows.filter(row=>!row.archivedAt).length,
      draft: rows.filter((row) => !row.archivedAt && row.statusKey === "draft").length,
      review: rows.filter((row) => !row.archivedAt && row.statusKey === "review").length,
      publish: rows.filter((row) => !row.archivedAt && row.statusKey === "publish").length,
      published: rows.filter((row) => !row.archivedAt && row.statusKey === "published").length,
      excellent: rows.filter((row) => !row.archivedAt && row.qualityScore === 100).length,
    }),
    [rows],
  );
  const tabCount = (name: (typeof tabs)[number]) =>
    name === "全部内容"
      ? counts.all
      : name === "草稿"
        ? counts.draft
        : name === "待审核"
          ? counts.review
          : name === "待发布"
            ? counts.publish
            : name === "已发布"
              ? counts.published
              : name === "检查通过"
                ? counts.excellent
                : rows.filter(row=>row.archivedAt).length;

  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase();
    return rows.filter((row) => {
      const tabMatch =
        tab === "全部内容" ||
        (tab === "草稿" && row.statusKey === "draft") ||
        (tab === "待审核" && row.statusKey === "review") ||
        (tab === "待发布" && row.statusKey === "publish") ||
        (tab === "已发布" && row.statusKey === "published") ||
        (tab === "检查通过" && row.qualityScore === 100) ||
        tab === "回收站";
      return (
        tabMatch &&
        (tab === "回收站" ? Boolean(row.archivedAt) : !row.archivedAt) &&
        (typeFilter === "all" || row.contentType === typeFilter) &&
        (statusFilter === "all" || row.statusKey === statusFilter) &&
        (platformFilter === "all" || row.platform === platformFilter) &&
        (!search || `${row.title} ${row.keyword} ${row.displayType}`.toLowerCase().includes(search))
      );
    });
  }, [rows, tab, query, typeFilter, statusFilter, platformFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const visibleRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const typeBuckets = useMemo(() => {
    const total = Math.max(1, rows.length);
    return Object.entries(
      rows.reduce<Record<string, number>>((all, row) => {
        all[row.displayType] = (all[row.displayType] || 0) + 1;
        return all;
      }, {}),
    ).map(([name, value], index) => ({ name, value, percent: Math.round((value / total) * 1000) / 10, color: colors[index % colors.length] }));
  }, [rows]);
  const platformBuckets = useMemo(() => {
    const total = Math.max(1, rows.length);
    return Object.entries(
      rows.reduce<Record<string, number>>((all, row) => {
        all[row.platform] = (all[row.platform] || 0) + 1;
        return all;
      }, {}),
    ).map(([name, value]) => ({ name, value, percent: Math.round((value / total) * 1000) / 10 }));
  }, [rows]);
  const topics = useMemo(() => {
    const values = rows.reduce<Record<string, number>>((all, row) => {
      const key = row.keyword || "未设置关键词";
      all[key] = (all[key] || 0) + 1;
      return all;
    }, {});
    return Object.entries(values).sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [rows]);

  const metrics: Array<[PhosphorIcon, string, number, string]> = [
    [Stack, "全部内容", counts.all, "当前项目内容资产"],
    [NotePencil, "草稿", counts.draft, "正在生成或编辑"],
    [ClockCountdown, "待审核", counts.review, "等待质量或人工审核"],
    [PaperPlaneTilt, "待发布", counts.publish, "审核通过，等待发布"],
    [CheckCircle, "已发布", counts.published, "已发布并完成验证"],
    [Sparkle, "检查通过", counts.excellent, "机器质量检查通过"],
  ];

  const openContent=(row:LibraryRow)=>{sessionStorage.setItem(`oneshowseo:content:${project.id}`,row.id);navigate("内容创作");};
  const archive=async(row:LibraryRow)=>{try{const response=await fetch(`/api/projects/${project.id}/content`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({action:row.archivedAt?"restore":"archive",runId:row.id})}),result=await response.json();if(!response.ok)throw new Error(result.error||"操作失败");await load();}catch(caught){setError(caught instanceof Error?caught.message:"操作失败");}};
  const resetFilters = () => {
    setTypeFilter("all");
    setStatusFilter("all");
    setPlatformFilter("all");
    setQuery("");
  };
  const exportCsv = () => {
    if (!filtered.length) return;
    const quote = (value: unknown) => `"${String(value ?? "").replace(/^[=+@\-\t\r]/, "'$&").replaceAll('"', '""')}"`;
    const lines = [
      ["标题", "平台", "类型", "关键词", "状态", "质量分", "字数", "版本", "更新时间"],
      ...filtered.map((row) => [row.title, row.platform, row.displayType, row.keyword, row.displayStatus, row.qualityScore, row.wordCount, `v${row.versionNumber}`, formatDate(row.updatedAt)]),
    ].map((line) => line.map(quote).join(","));
    const url = URL.createObjectURL(new Blob([`\ufeff${lines.join("\n")}`], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${project.host}-content-library.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="content-library-v2">
      <header className="content-library-v2-header">
        <div>
          <h1>内容库</h1>
          <p>集中管理所有内容资产，支持搜索、筛选、分组、复用和效果分析。</p>
        </div>
        <div className="content-library-v2-actions">
          <label>
            <MagnifyingGlass />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索标题、关键词、主题…" aria-label="搜索内容库" />
          </label>
          <button onClick={() => setFiltersOpen((value) => !value)} className={filtersOpen ? "active" : ""}><SlidersHorizontal />高级筛选</button>
          <button className="primary" onClick={() => navigate("内容创作")}><Plus />新建内容 <CaretDown /></button>
        </div>
      </header>

      <div className="content-library-v2-nav">
        <nav>
          {tabs.map((name) => <button key={name} onClick={() => { setTab(name); setPage(1); }} className={tab === name ? "active" : ""}>{name}<span>{tabCount(name)}</span></button>)}
        </nav>
        <div>
          <button aria-label="列表视图" className={view === "list" ? "active" : ""} onClick={() => setView("list")}><ListBullets /></button>
          <button aria-label="卡片视图" className={view === "grid" ? "active" : ""} onClick={() => setView("grid")}><GridFour /></button>
          <button onClick={exportCsv} disabled={!filtered.length}><DownloadSimple />导出</button>
        </div>
      </div>

      {error && <div className="content-library-v2-alert"><WarningCircle weight="fill" />{error}<button onClick={() => void load()}>重新加载</button></div>}

      <section className="content-library-v2-metrics">
        {metrics.map(([Icon, label, value, hint], index) => <article key={label}><span style={{ background: `${colors[index]}14`, color: colors[index] }}><Icon weight="duotone" /></span><div><small>{label}</small><strong>{loading ? "—" : value}</strong><p>{hint}</p></div></article>)}
      </section>

      <div className="content-library-v2-layout">
        <main className="content-library-v2-main">
          {filtersOpen && <div className="content-library-v2-filters">
            <select value={platformFilter} onChange={(event) => { setPlatformFilter(event.target.value); setPage(1); }} aria-label="筛选平台"><option value="all">全部平台</option><option value="官网 / SEO">官网 / SEO</option><option value="WordPress">WordPress</option></select>
            <select value={typeFilter} onChange={(event) => { setTypeFilter(event.target.value); setPage(1); }} aria-label="筛选类型"><option value="all">全部类型</option>{Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }} aria-label="筛选状态"><option value="all">全部状态</option><option value="draft">草稿</option><option value="review">待审核</option><option value="publish">待发布</option><option value="published">已发布</option></select>
            <button disabled>内容负责人 <CaretDown /></button>
            <button disabled>创建时间 <CaretDown /></button>
            <button onClick={resetFilters}><FunnelSimple />清空</button>
          </div>}

          {view === "list" ? <div className="content-library-v2-table-wrap">
            <div className="content-library-v2-table">
              <div className="head"><span>内容</span><span>平台</span><span>类型</span><span>主题 / 关键词</span><span>状态</span><span>负责人</span><span>创建时间</span><span>最近更新</span><span>表现数据</span><span>操作</span></div>
              {visibleRows.map((row) => <article key={row.id}>
                <div className="asset"><span><Article weight="duotone" /></span><p><strong>{row.title}</strong><small>字数：{row.wordCount.toLocaleString("zh-CN")} · 版本：v{row.versionNumber}</small></p></div>
                <span className="platform">{row.platform}</span>
                <span>{row.displayType}</span>
                <span className="keyword">{row.keyword || "未设置"}</span>
                <em className={row.statusKey}>{row.displayStatus}</em>
                <span className="owner"><i>{(user.name || user.email || "U").slice(0, 1).toUpperCase()}</i>{user.name || user.email}</span>
                <time>{formatDate(row.startedAt)}</time>
                <time>{formatDate(row.updatedAt)}</time>
                <span className="performance">质量 <strong>{row.qualityScore}</strong><small>流量待接入</small></span>
                <div className="row-actions"><button onClick={()=>void archive(row)}>{row.archivedAt?"恢复":"归档"}</button><button aria-label={`查看 ${row.title}`} onClick={() => openContent(row)}><Eye /></button>{row.publishedUrl && <a href={row.publishedUrl} target="_blank" rel="noreferrer" aria-label={`打开 ${row.title}`}><ArrowRight /></a>}</div>
              </article>)}
            </div>
            {!loading && !visibleRows.length && <EmptyState recycle={tab === tabs[6]} navigate={navigate} />}
            {loading && <div className="content-library-v2-loading">正在读取真实内容资产…</div>}
          </div> : <div className="content-library-v2-grid">
            {visibleRows.map((row) => <article key={row.id}><header><span><Article weight="duotone" /></span><em className={row.statusKey}>{row.displayStatus}</em></header><h3>{row.title}</h3><p>{row.keyword || "未设置目标关键词"}</p><dl><div><dt>类型</dt><dd>{row.displayType}</dd></div><div><dt>质量分</dt><dd>{row.qualityScore}</dd></div><div><dt>版本</dt><dd>v{row.versionNumber}</dd></div></dl><button onClick={() => openContent(row)}>打开内容 <ArrowRight /></button></article>)}
            {!loading && !visibleRows.length && <EmptyState recycle={tab === tabs[6]} navigate={navigate} />}
          </div>}
          <footer className="content-library-v2-pagination"><span>共 {filtered.length} 条</span><label><select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}><option value={10}>10 条/页</option><option value={20}>20 条/页</option><option value={50}>50 条/页</option></select></label><nav><button disabled={safePage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}><CaretLeft /></button>{Array.from({ length: Math.min(pageCount, 5) }, (_, index) => index + 1).map((value) => <button key={value} className={safePage === value ? "active" : ""} onClick={() => setPage(value)}>{value}</button>)}<button disabled={safePage >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}><CaretRight /></button></nav></footer>
        </main>

        <aside className="content-library-v2-side">
          <section><header><h2>内容类型分布</h2></header>{typeBuckets.length ? <div className="library-v2-donut"><div style={{ background: `conic-gradient(${typeBuckets.map((item, index) => `${item.color} ${typeBuckets.slice(0, index).reduce((sum, value) => sum + value.percent, 0)}% ${typeBuckets.slice(0, index + 1).reduce((sum, value) => sum + value.percent, 0)}%`).join(",")})` }}><span><strong>{rows.length}</strong><small>总数</small></span></div><ul>{typeBuckets.map((item) => <li key={item.name}><i style={{ background: item.color }} /><span>{item.name}</span><b>{item.value}</b><small>{item.percent}%</small></li>)}</ul></div> : <SideEmpty icon={ChartDonut} text="生成内容后展示类型分布" />}</section>
          <section><header><h2>平台分布</h2></header>{platformBuckets.length ? <div className="library-v2-bars">{platformBuckets.map((item) => <article key={item.name}><div><span>{item.name}</span><b>{item.value}（{item.percent}%）</b></div><i><span style={{ width: `${item.percent}%` }} /></i></article>)}</div> : <SideEmpty icon={Stack} text="发布或生成内容后展示平台分布" />}</section>
          <section className="topics"><header><h2>热门主题 Top 10</h2></header>{topics.length ? topics.map(([name, value], index) => <article key={name}><b>{index + 1}</b><span>{name}</span><em>{value}</em></article>) : <SideEmpty icon={MagnifyingGlass} text="内容关键词将自动形成热门主题" />}</section>
        </aside>
      </div>
    </div>
  );
}

function EmptyState({ recycle, navigate }: { recycle: boolean; navigate: (value: string) => void }) {
  return <div className="content-library-v2-empty"><FileText weight="duotone" /><strong>{recycle ? "回收站为空" : "暂无内容资产"}</strong><p>{recycle ? "被删除的内容会保留在这里，当前没有记录。" : "Content Agent 完成生成后，内容、版本、审核与发布状态会自动汇总到这里。"}</p>{!recycle && <button onClick={() => navigate("内容创作")}><Plus />新建内容</button>}</div>;
}

function SideEmpty({ icon: Icon, text }: { icon: PhosphorIcon; text: string }) {
  return <div className="content-library-v2-side-empty"><Icon weight="duotone" /><span>{text}</span></div>;
}
