"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowClockwise,
  ArrowRight,
  CaretDown,
  Check,
  CheckCircle,
  ClockCounterClockwise,
  CloudArrowUp,
  FileText,
  FloppyDisk,
  ImageSquare,
  LinkSimple,
  ListBullets,
  MagicWand,
  NotePencil,
  PaperPlaneTilt,
  Plus,
  Quotes,
  Sparkle,
  TextB,
  TextHOne,
  TextHTwo,
  TextItalic,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import {
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from "recharts";

type ContentRun = {
  id: string;
  taskId: string;
  status: string;
  title: string;
  keyword: string;
  contentType: string;
  audience: string;
  intent: string;
  tone: string;
  goal: string;
  sourceRef: string;
  brief: string;
  wordCount: number;
  qualityScore: number;
  checksPassed: number;
  checksTotal: number;
  reviewStatus: string;
  artifactId: string | null;
  archivedAt?: number | null;
  completedAt: number | null;
  generationMode?: "model" | "structured_fallback";
  modelProvider?: string | null;
  modelName?: string | null;
};

type ContentCheck = {
  id: string;
  key?: string;
  label: string;
  status: "pass" | "warning";
  detail: string;
};

type ContentVersion = {
  checks: ContentCheck[];
  qualityScore: number;
  reviewStatus: string;
  reviewTaskId: string | null;
  id: string;
  runId: string;
  versionNumber: number;
  body: string;
  wordCount: number;
  createdAt: number;
};

type StudioData = {
  runs: ContentRun[];
  latestRun: ContentRun | null;
  checks: ContentCheck[];
  versions: ContentVersion[];
  model: { ready: boolean; provider: string | null; model: string | null };
};

type DraftForm = {
  title: string;
  keyword: string;
  contentType: "blog_post" | "guide" | "landing_page" | "content_refresh";
  audience: string;
  intent: string;
  tone: string;
  goal: string;
  sourceRef: string;
  brief: string;
};

const emptyData: StudioData = {
  runs: [],
  latestRun: null,
  checks: [],
  versions: [],
  model: { ready: false, provider: null, model: null },
};

const emptyDraft: DraftForm = {
  title: "",
  keyword: "",
  contentType: "guide",
  audience: "",
  intent: "信息型",
  tone: "专业、清晰、可信",
  goal: "提升自然搜索可见度",
  sourceRef: "",
  brief: "",
};

const editorTabs = ["内容概览", "编辑器", "多平台版本", "SEO / GEO 检查", "内容评分"];
const platformLabels = ["官网 / SEO", "知乎", "小红书", "牛客", "微信公众号", "CSDN", "掘金", "抖音脚本"];

const countWords = (value: string) =>
  value
    .replace(/[#>*_`\[\]()\-]/g, " ")
    .trim()
    .split(/\s+|(?=[\u4e00-\u9fff])/)
    .filter(Boolean).length;

export default function ContentCreationStudio({
  project,
  navigate,
  refresh,
}: {
  project: { id: string };
  navigate: (value: string) => void;
  refresh: () => Promise<void>;
}) {
  const [data, setData] = useState<StudioData>(emptyData);
  const [activeTab, setActiveTab] = useState("编辑器");
  const [leftTab, setLeftTab] = useState("内容简报");
  const [rightTab, setRightTab] = useState("AI 助手");
  const [selectedRunId, setSelectedRunId] = useState("");
  const [body, setBody] = useState("");
  const [savedBody, setSavedBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingBody, setLoadingBody] = useState(false);
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [factsConfirmed,setFactsConfirmed]=useState(false);
  const [reviewBusy,setReviewBusy]=useState(false);
  const [draft, setDraft] = useState<DraftForm>(emptyDraft);
  const editorRef = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(async () => {
    const response = await fetch(`/api/projects/${project.id}/content`, {
      cache: "no-store",
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "内容工作台读取失败");
    const next = { ...emptyData, ...payload } as StudioData;
    setData(next);
    setSelectedRunId((current) => current || sessionStorage.getItem(`oneshowseo:content:${project.id}`) || next.latestRun?.id || "");
  }, [project.id]);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      void load()
        .catch((caught) => active && setError(caught instanceof Error ? caught.message : "内容工作台读取失败"))
        .finally(() => active && setLoading(false));
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [load]);

  useEffect(()=>{const timer=setInterval(()=>{void load().catch(()=>undefined);},5000);return()=>clearInterval(timer);},[load]);
  const selectedRun = data.runs.find((run) => run.id === selectedRunId) || null;
  const versions = useMemo(
    () => data.versions.filter((version) => version.runId === selectedRunId),
    [data.versions, selectedRunId],
  );

  useEffect(() => {
    let active = true;
    const hydrateBody = async () => {
      setFactsConfirmed(false);
      if (!selectedRun) {
        setBody("");
        setSavedBody("");
        return;
      }
      setLoadingBody(true);
      setError("");
      try {
        const latestVersion = versions[0];
        let nextBody = latestVersion?.body || "";
        if (!nextBody && selectedRun.artifactId) {
          const accessResponse = await fetch(
            `/api/artifacts/${selectedRun.artifactId}/access?projectId=${encodeURIComponent(project.id)}`,
            { cache: "no-store" },
          );
          const access = await accessResponse.json();
          if (!accessResponse.ok) throw new Error(access.error || "正文产物读取失败");
          const artifactResponse = await fetch(access.url, { cache: "no-store" });
          if (!artifactResponse.ok) throw new Error("正文产物下载失败");
          nextBody = await artifactResponse.text();
        }
        if (active) {
          setBody(nextBody);
          setSavedBody(nextBody);
        }
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "正文产物读取失败");
      } finally {
        if (active) setLoadingBody(false);
      }
    };
    void hydrateBody();
    return () => {
      active = false;
    };
  // Polling metadata must not overwrite unsaved edits. Only a changed selection or version reloads text.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, selectedRun?.id, selectedRun?.artifactId, versions[0]?.id]);

  const outline = useMemo(
    () =>
      body
        .split("\n")
        .filter((line) => /^#{1,3}\s+/.test(line))
        .map((line) => ({ level: line.match(/^#+/)?.[0].length || 1, title: line.replace(/^#{1,3}\s+/, "") }))
        .slice(0, 10),
    [body],
  );
  const wordCount = countWords(body);
  const dirty = body !== savedBody;
  const score = selectedRun?.qualityScore ?? null;
  const currentVersion=versions[0];
  const currentChecks=currentVersion?.checks||[];
  const blockingChecks=currentChecks.filter(check=>check.status!=="pass"&&["body","structure","safe_markup"].includes(check.key||check.id));
  const advisoryChecks=currentChecks.filter(check=>check.status!=="pass"&&!blockingChecks.includes(check));
  const radarData=currentChecks.map(check=>({name:check.label,value:check.status==="pass"?100:0}));
  const reviewVersion=async(action:"submit"|"approve"|"request_changes")=>{
    if(!currentVersion)return;
    if(dirty){setError("正文还有未保存修改，请先保存草稿");return;}
    if(action==="submit"&&blockingChecks.length){setActiveTab("SEO / GEO 检查");setError(`还有 ${blockingChecks.length} 项必要检查未通过，请按提示修改正文并保存`);return;}
    if((action==="submit"||action==="approve")&&!factsConfirmed){setError("请先勾选“我已核验事实、引用和品牌表述”");return;}
    setReviewBusy(true);setError("");
    try{
      const url=action==="submit"?`/api/projects/${project.id}/content`:"/api/approvals";
      const response=await fetch(url,{method:action==="submit"?"PATCH":"POST",headers:{"content-type":"application/json"},body:JSON.stringify(action==="submit"?{action:"submit_review",versionId:currentVersion.id,factsConfirmed}:{taskId:currentVersion.reviewTaskId,action,source:"legacy",note:action==="approve"?"已查看当前版本并完成事实与品牌审核":"请在编辑器修改正文后保存新版本"})});
      const result=await response.json();if(!response.ok)throw new Error(result.error||"审核操作失败");
      setMessage(action==="submit"?"当前版本已提交审核":action==="approve"?"当前版本审核通过，可进入发布管理":"已退回修改，请保存新版本");await load();await refresh();
    }catch(caught){setError(caught instanceof Error?caught.message:"审核操作失败");}finally{setReviewBusy(false);}
  };

  const saveVersion = async () => {
    if (!selectedRun || !body.trim() || !dirty) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/projects/${project.id}/content`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ runId: selectedRun.id, body, expectedVersion: versions[0]?.versionNumber ?? 0 }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "草稿保存失败");
      await load();
      setSavedBody(body);
      setMessage(`版本 ${payload.version.versionNumber} 已保存`);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "草稿保存失败");
    } finally {
      setSaving(false);
    }
  };

  const regenerate = async () => {
    if (!selectedRun) return;
    setRegenerating(true);
    setError("");
    try {
      const response = await fetch(`/api/projects/${project.id}/content`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: selectedRun.title,
          keyword: selectedRun.keyword,
          contentType: selectedRun.contentType,
          audience: selectedRun.audience,
          intent: selectedRun.intent,
          tone: selectedRun.tone,
          goal: selectedRun.goal,
          sourceRef: selectedRun.sourceRef,
          brief: selectedRun.brief,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "重新生成任务创建失败");
      setMessage(`重新生成任务已进入队列，预留 ${payload.creditsReserved} Credits`);
      setConfirmRegenerate(false);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "重新生成失败");
    } finally {
      setRegenerating(false);
    }
  };

  const createContent = async (event: React.FormEvent) => {
    event.preventDefault();
    setCreating(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/projects/${project.id}/content`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draft),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "内容生成任务创建失败");
      sessionStorage.setItem(`oneshowseo:content:${project.id}`,payload.taskId);setSelectedRunId(payload.taskId);
      setShowCreate(false);
      setDraft(emptyDraft);
      setMessage(`内容任务已创建，预留 ${payload.creditsReserved} Credits，正在生成草稿`);
      await refresh();
      window.setTimeout(() => void load().catch(() => undefined), 1200);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "内容生成任务创建失败");
    } finally {
      setCreating(false);
    }
  };

  const insertMarkup = (prefix: string, suffix = prefix, placeholder = "文本") => {
    const editor = editorRef.current;
    if (!editor) return;
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const selected = body.slice(start, end) || placeholder;
    const next = `${body.slice(0, start)}${prefix}${selected}${suffix}${body.slice(end)}`;
    setBody(next);
    requestAnimationFrame(() => {
      editor.focus();
      editor.setSelectionRange(start + prefix.length, start + prefix.length + selected.length);
    });
  };

  const applySuggestion = (kind: "title" | "section" | "cta" | "evidence") => {
    if (!selectedRun) return;
    const additions = {
      title: `\n\n## ${selectedRun.keyword}：核心结论与适用场景\n`,
      section: `\n\n## 常见问题\n\n### ${selectedRun.keyword}适合哪些人？\n\n请结合证据补充回答。\n`,
      cta: `\n\n## 下一步\n\n根据你的实际目标选择下一步行动，并在发布前完成审核。\n`,
      evidence: `\n\n> 事实核验：发布前请确认本文中的数据、产品能力和外部引用均有可追溯来源。\n`,
    };
    setBody((current) => `${current.trimEnd()}${additions[kind]}`);
    setMessage("建议已加入正文，请检查后保存新版本");
  };

  const renderEditor = () => {
    if (!selectedRun)
      return <div className="creation-empty"><NotePencil /><strong>还没有可编辑的内容</strong><p>先从内容计划创建内容简报，并完成内容生成。</p><button onClick={() => navigate("内容计划")}>前往内容计划 <ArrowRight /></button></div>;
    if (loading || loadingBody)
      return <div className="creation-empty"><ArrowClockwise className="spin" /><strong>正在加载真实内容产物…</strong></div>;
    if (["running","queued","retrying"].includes(selectedRun.status))
      return <div className="creation-empty"><ArrowClockwise className="spin" /><strong>内容正在生成</strong><p>任务已经进入后台队列，完成后会自动出现在编辑器中。</p></div>;
    if (selectedRun.status === "failed")
      return <div className="creation-empty"><WarningCircle /><strong>本次生成没有完成</strong><p>请检查模型配置和证据来源，然后重新创建任务。</p><button onClick={() => setShowCreate(true)}>重新创建</button></div>;
    return (
      <>
        <div className="creation-editor-title"><strong>Master Content（官网 / SEO 版本）</strong><span>主版本</span></div>
        <div className="creation-toolbar" role="toolbar" aria-label="正文格式工具">
          <select aria-label="段落样式" defaultValue="正文"><option>正文</option><option>标题 1</option><option>标题 2</option></select>
          <button aria-label="一级标题" onClick={() => insertMarkup("# ", "", "标题")}><TextHOne /></button>
          <button aria-label="二级标题" onClick={() => insertMarkup("## ", "", "小节标题")}><TextHTwo /></button>
          <button aria-label="加粗" onClick={() => insertMarkup("**", "**")}><TextB /></button>
          <button aria-label="斜体" onClick={() => insertMarkup("*", "*")}><TextItalic /></button>
          <button aria-label="列表" onClick={() => insertMarkup("- ", "", "列表项")}><ListBullets /></button>
          <button aria-label="引用" onClick={() => insertMarkup("> ", "", "引用内容")}><Quotes /></button>
          <button aria-label="链接" onClick={() => insertMarkup("[", "](https://)", "链接文字")}><LinkSimple /></button>
          <button aria-label="图片语法" onClick={() => insertMarkup("![", "](https://)", "图片说明")}><ImageSquare /></button>
          <button className="ai" onClick={() => applySuggestion("section")}><MagicWand /> 添加建议小节</button>
        </div>
        <textarea
          ref={editorRef}
          className="creation-textarea"
          disabled={saving}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          aria-label="内容正文编辑器"
          spellCheck
        />
        <footer className="creation-editor-status"><span>字数：{wordCount.toLocaleString("zh-CN")}</span><span>预计阅读：{Math.max(1, Math.ceil(wordCount / 350))} 分钟</span><span>{dirty ? "有未保存修改" : "已保存"}</span></footer>
      </>
    );
  };

  const renderCenter = () => {
    if (activeTab === "编辑器") return renderEditor();
    if (!selectedRun) return renderEditor();
    if (activeTab === "内容概览")
      return <div className="creation-overview"><h2>{selectedRun.title}</h2><p>{selectedRun.brief || "该内容未填写额外补充要求。"}</p><div><article><small>目标关键词</small><strong>{selectedRun.keyword}</strong></article><article><small>搜索意图</small><strong>{selectedRun.intent}</strong></article><article><small>目标受众</small><strong>{selectedRun.audience}</strong></article><article><small>质量分</small><strong>{score ?? "待检查"}</strong></article></div></div>;
    if (activeTab === "多平台版本")
      return <div className="creation-platform-grid">{platformLabels.map((platform, index) => <article key={platform} className={index === 0 ? "active" : ""}><span>{index === 0 ? <FileText /> : <CloudArrowUp />}</span><div><strong>{platform}</strong><small>{index === 0 ? `${wordCount.toLocaleString("zh-CN")} 字 · 当前主版本` : "待生成平台版本"}</small></div>{index === 0 ? <CheckCircle weight="fill" /> : <button onClick={() => setActiveTab("编辑器")}>从主版本创建</button>}</article>)}</div>;
    if (activeTab === "SEO / GEO 检查")
      return <div className="creation-checks"><header><h2>提交前检查</h2><span>{currentChecks.filter(check=>check.status==="pass").length}/{currentChecks.length} 通过</span></header>{currentChecks.length ? currentChecks.map((check) => {const required=["body","structure","safe_markup"].includes(check.key||check.id);return <article key={check.id||check.key||check.label} className={check.status}><span>{check.status === "pass" ? <CheckCircle weight="fill" /> : <WarningCircle weight="fill" />}</span><div><strong>{check.label}{check.status!=="pass"&&<small>{required?" · 必须修正":" · 可人工确认"}</small>}</strong><p>{check.detail}</p></div></article>}) : <div className="creation-empty"><WarningCircle /><strong>暂无质量检查记录</strong></div>}</div>;
    return <div className="creation-score-detail"><header><h2>内容评分</h2><strong>{score ?? "—"}<small>/100</small></strong></header><div><ResponsiveContainer width="100%" height={330}><RadarChart data={radarData}><PolarGrid stroke="#dfe4f1" /><PolarAngleAxis dataKey="name" tick={{ fill: "#667085", fontSize: 12 }} /><Radar dataKey="value" stroke="#6253ed" fill="#6253ed" fillOpacity={0.24} /></RadarChart></ResponsiveContainer></div></div>;
  };

  return (
    <div className="content-creation-page">
      <header className="content-creation-header">
        <div><span className="creation-eyebrow">内容工作台</span><h1>内容创作</h1><p>从真实研究机会或明确主题开始，完成生成、编辑、检查与审核。</p></div>
        <aside>
          <button className={data.model.ready?"creation-model-ready":"creation-model-missing"} onClick={() => !data.model.ready && window.location.assign("/admin/models")} title={data.model.ready?"当前内容生成模型":"前往后台配置内容模型"}><span></span>{data.model.ready?`${data.model.provider} · ${data.model.model}`:"内容模型未配置 · 去配置"}</button>
          {!selectedRun ? <button className="primary" onClick={() => setShowCreate(true)}><Plus />新建内容</button> : <>
            <button onClick={saveVersion} disabled={!dirty || saving || selectedRun.status!=="completed"} title={!dirty?"编辑正文后即可保存新版本":"保存当前编辑版本"}><FloppyDisk />{saving ? "正在保存…" : "保存草稿"}<CaretDown /></button>
            <button onClick={() => setConfirmRegenerate(true)} disabled={selectedRun.status==="running"} title={selectedRun.status==="running"?"当前内容仍在生成":"按当前内容简报重新生成"}><ArrowClockwise />{data.model.ready?"AI 重新生成":"生成结构草稿"}<CaretDown /></button>
            <button className="primary" onClick={() => void reviewVersion("submit")} disabled={reviewBusy||["pending","approved"].includes(currentVersion?.reviewStatus||"")} title="提交当前版本进入人工审核"><PaperPlaneTilt />提交审核<CaretDown /></button>
          </>}
        </aside>
      </header>
      {selectedRun&&currentVersion&&<section className="product-info content-review-bar" style={{display:"flex",gap:12,alignItems:"center",flexWrap:"wrap",padding:16}}>
        <strong>版本 {currentVersion.versionNumber} · {{draft:"待提交",pending:"待审核",approved:"审核通过",changes_requested:"需修改"}[currentVersion.reviewStatus]||"待提交"}</strong>
        <label><input type="checkbox" checked={factsConfirmed} onChange={e=>setFactsConfirmed(e.target.checked)}/> 我已核验事实、引用和品牌表述</label>
        {dirty&&<span>正文有未保存修改，请先保存</span>}
        {!dirty&&blockingChecks.length>0&&<button onClick={()=>setActiveTab("SEO / GEO 检查")}>查看 {blockingChecks.length} 项必须修正</button>}
        {!dirty&&blockingChecks.length===0&&advisoryChecks.length>0&&<span>{advisoryChecks.length} 项优化建议，可在人工确认后提交</span>}
        {!dirty&&blockingChecks.length===0&&advisoryChecks.length===0&&<span>检查已完成，可以提交审核</span>}
        {currentVersion.reviewStatus==="pending"&&<><button disabled={reviewBusy||dirty||!factsConfirmed} onClick={()=>void reviewVersion("approve")}>审核通过</button><button disabled={reviewBusy||dirty} onClick={()=>void reviewVersion("request_changes")}>退回修改</button></>}
        {currentVersion.reviewStatus==="approved"&&<button disabled={dirty} onClick={()=>{sessionStorage.setItem(`oneshowseo:publish:${project.id}`,selectedRun.taskId);navigate("发布管理");}}>前往发布管理</button>}
        <button onClick={()=>navigate("内容库")}>查看内容库</button>
      </section>}
      {selectedRun && <nav className="content-creation-tabs" role="tablist" aria-label="内容创作视图">{editorTabs.map((tab) => <button key={tab} role="tab" aria-selected={activeTab === tab} className={activeTab === tab ? "active" : ""} onClick={() => setActiveTab(tab)}>{tab}</button>)}</nav>}
      {message && <div className="creation-message success"><CheckCircle weight="fill" />{message}<button aria-label="关闭提示" onClick={() => setMessage("")}><X /></button></div>}
      {error && <div className="creation-message error"><WarningCircle weight="fill" />{error}<button aria-label="关闭错误" onClick={() => setError("")}><X /></button></div>}
      {selectedRun ? <div className="content-creation-layout has-content">
        <aside className="creation-brief-panel">
          <nav>{["内容简报", "大纲"].map((tab) => <button key={tab} className={leftTab === tab ? "active" : ""} onClick={() => setLeftTab(tab)}>{tab}</button>)}</nav>
          {data.runs.length > 1 && <label className="creation-run-select">当前内容<select value={selectedRunId} onChange={(event) => {if(!dirty||window.confirm("有未保存的正文，确定切换内容？"))setSelectedRunId(event.target.value);}}>{data.runs.map((run) => <option key={run.id} value={run.id}>{run.title}</option>)}</select></label>}
          {selectedRun ? leftTab === "内容简报" ? <div className="creation-brief-body">
            <section><small>主题</small><strong>{selectedRun.title}</strong></section>
            <section><small>目标关键词</small><div className="creation-tags"><span>{selectedRun.keyword}</span></div></section>
            <section><small>搜索意图</small><strong>{selectedRun.intent}</strong></section>
            <section><small>目标受众</small><p>{selectedRun.audience}</p></section>
            <section><small>内容目标</small><p>{selectedRun.goal}</p></section>
            <section><small>品牌语气</small><p>{selectedRun.tone}</p></section>
            <section><small>证据来源</small><p>{selectedRun.sourceRef}</p></section>
            <section><small>当前正文</small><p>{wordCount.toLocaleString("zh-CN")} 字</p></section>
          </div> : <div className="creation-outline">{outline.length ? outline.map((item, index) => <button key={`${item.title}-${index}`} className={`level-${item.level}`} onClick={() => { const position = body.indexOf(item.title); editorRef.current?.focus(); if (position >= 0) editorRef.current?.setSelectionRange(position, position + item.title.length); }}><span>H{item.level}</span>{item.title}</button>) : <div className="creation-empty compact"><FileText /><strong>正文中暂无标题结构</strong></div>}</div> : <div className="creation-empty compact"><FileText /><strong>等待内容生成</strong></div>}
        </aside>
        <main className="creation-editor-panel"><div className="creation-workspace-label"><span>{selectedRun?"主内容工作区":"开始创作"}</span><small>{selectedRun?.generationMode==="model"?`${selectedRun.modelProvider} · ${selectedRun.modelName}`:"结构化草稿模式"}</small></div>{renderCenter()}</main>
        <aside className="creation-assistant-panel">
          <nav>{["AI 助手", "素材库"].map((tab) => <button key={tab} className={rightTab === tab ? "active" : ""} onClick={() => setRightTab(tab)}>{tab}</button>)}</nav>
          {rightTab === "AI 助手" ? <>
            <section className="creation-suggestions"><h2>写作建议</h2>{selectedRun ? <>
              <article><span><Sparkle /></span><div><strong>补充关键词相关小节</strong><small>让主题覆盖更完整</small></div><button onClick={() => applySuggestion("title")}>应用</button></article>
              <article><span><Sparkle /></span><div><strong>增加常见问题</strong><small>覆盖用户后续搜索意图</small></div><button onClick={() => applySuggestion("section")}>应用</button></article>
              <article><span><Sparkle /></span><div><strong>加入行动建议</strong><small>为正文补充清晰 CTA</small></div><button onClick={() => applySuggestion("cta")}>应用</button></article>
              <article><span><Sparkle /></span><div><strong>补充事实核验</strong><small>发布前检查证据与引用</small></div><button onClick={() => applySuggestion("evidence")}>应用</button></article>
            </> : <div className="creation-empty compact"><Sparkle /><strong>生成内容后提供建议</strong></div>}</section>
            <section className="creation-score-card"><header><div><h2>内容评分</h2><small>基于真实质量检查</small></div>{score === null ? <strong>—</strong> : <strong>{score}<small>/100</small></strong>}</header>{score === null ? <div className="creation-empty compact"><WarningCircle /><strong>等待质量检查</strong></div> : <div className="creation-radar"><ResponsiveContainer width="100%" height={190}><RadarChart data={radarData}><PolarGrid stroke="#e1e5f0" /><PolarAngleAxis dataKey="name" tick={{ fill: "#7b849a", fontSize: 10 }} /><Radar dataKey="value" stroke="#6253ed" fill="#6253ed" fillOpacity={0.25} /></RadarChart></ResponsiveContainer></div>}</section>
            <section className="creation-history"><header><h2>历史版本</h2><span>{versions.length} 个</span></header>{versions.length ? versions.slice(0, 5).map((version) => <button key={version.id} onClick={() => { setBody(version.body); setMessage(`已载入版本 ${version.versionNumber}，点击保存将创建新版本`); }}><ClockCounterClockwise /><span><strong>版本 {version.versionNumber}</strong><small>{new Date(version.createdAt * 1000).toLocaleString("zh-CN")}</small></span><em>{version.wordCount} 字</em></button>) : <div className="creation-empty compact"><ClockCounterClockwise /><strong>尚未保存编辑版本</strong></div>}</section>
          </> : <section className="creation-materials"><div className="creation-empty"><ImageSquare /><strong>素材库尚未接入</strong><p>连接知识库或上传经授权的素材后在这里使用。</p><button onClick={() => navigate("知识库")}>前往知识库</button></div></section>}
        </aside>
      </div> : <section className="creation-start-center">
        <div className="creation-start-main">
          <span className="creation-start-icon"><MagicWand /></span>
          <span className="creation-start-kicker">开始内容生产</span>
          <h2>把一个真实机会变成可审核的内容</h2>
          <p>选择研究机会或直接填写主题。系统会保留内容简报、模型来源、质量检查和版本记录。</p>
          <div className="creation-start-actions">
            <button className="primary" onClick={() => navigate("内容计划")}><FileText /><span><strong>从内容机会创建</strong><small>使用研究结果和内容简报</small></span><ArrowRight /></button>
            <button onClick={() => setShowCreate(true)}><NotePencil /><span><strong>直接输入主题</strong><small>填写目标、受众和证据来源</small></span><ArrowRight /></button>
            <button onClick={() => navigate("内容库")}><CloudArrowUp /><span><strong>使用已有内容</strong><small>从内容库选择并继续优化</small></span><ArrowRight /></button>
          </div>
        </div>
        <aside className="creation-start-guide">
          <header><span>创作准备度</span><strong>{data.model.ready?"可以开始":"需要配置"}</strong></header>
          <ol>
            <li className="ready"><span><Check /></span><div><strong>选择项目</strong><small>当前项目已就绪</small></div></li>
            <li className={data.model.ready?"ready":"pending"}><span>{data.model.ready?<Check />:<WarningCircle />}</span><div><strong>内容生成模型</strong><small>{data.model.ready?`${data.model.provider} · ${data.model.model}`:"尚未配置，仍可生成结构化草稿"}</small></div></li>
            <li><span>3</span><div><strong>准备证据来源</strong><small>用于限制事实边界和内容引用</small></div></li>
          </ol>
          {!data.model.ready && <button onClick={() => window.location.assign("/admin/models")}>前往后台配置模型 <ArrowRight /></button>}
          <p>模型密钥只保存在服务端，内容仍需经过质量检查和人工审核。</p>
        </aside>
      </section>}
      {selectedRun && <section className="creation-platform-strip"><header><h2>多平台版本</h2><span>主版本真实可用，其余平台待生成</span></header><div>{platformLabels.map((platform, index) => <button key={platform} className={index === 0 ? "active" : ""} onClick={() => setActiveTab(index === 0 ? "编辑器" : "多平台版本")}><strong>{platform}</strong><small>{index === 0 ? `${wordCount.toLocaleString("zh-CN")} 字 · ${score ?? "待评分"} 分` : "待生成"}</small>{index === 0 && <Check />}</button>)}</div></section>}
      {showCreate && <div className="creation-modal-backdrop" onMouseDown={(event) => event.target===event.currentTarget&&setShowCreate(false)}><form className="creation-modal creation-create-dialog" role="dialog" aria-modal="true" aria-labelledby="create-content-title" onSubmit={createContent}>
        <header><span><NotePencil /></span><div><h2 id="create-content-title">新建内容任务</h2><p>补齐内容目标与证据边界，随后进入后台生成队列。</p></div><button type="button" aria-label="关闭" onClick={() => setShowCreate(false)}><X /></button></header>
        <div className="creation-create-fields">
          <label className="wide"><span>内容标题</span><input required maxLength={160} value={draft.title} onChange={(event) => setDraft({...draft,title:event.target.value})} placeholder="例如：AI 面试助手选型指南" /></label>
          <label><span>目标关键词</span><input required value={draft.keyword} onChange={(event) => setDraft({...draft,keyword:event.target.value})} placeholder="例如：AI 面试助手" /></label>
          <label><span>内容类型</span><select value={draft.contentType} onChange={(event) => setDraft({...draft,contentType:event.target.value as DraftForm["contentType"]})}><option value="guide">指南教程</option><option value="blog_post">博客文章</option><option value="landing_page">商业落地页</option><option value="content_refresh">已有内容更新</option></select></label>
          <label><span>目标受众</span><input required value={draft.audience} onChange={(event) => setDraft({...draft,audience:event.target.value})} placeholder="谁会阅读这篇内容" /></label>
          <label><span>搜索意图</span><select value={draft.intent} onChange={(event) => setDraft({...draft,intent:event.target.value})}><option>信息型</option><option>商业调研型</option><option>交易型</option><option>导航型</option></select></label>
          <label><span>品牌语气</span><input required value={draft.tone} onChange={(event) => setDraft({...draft,tone:event.target.value})} /></label>
          <label><span>内容目标</span><input required value={draft.goal} onChange={(event) => setDraft({...draft,goal:event.target.value})} /></label>
          <label className="wide"><span>证据来源</span><input required value={draft.sourceRef} onChange={(event) => setDraft({...draft,sourceRef:event.target.value})} placeholder="研究报告 URL、知识库条目或可信数据来源" /><small>模型只能基于这里提供的来源组织事实；无法核验的信息会标记为待核验。</small></label>
          <label className="wide"><span>补充要求（可选）</span><textarea rows={4} value={draft.brief} onChange={(event) => setDraft({...draft,brief:event.target.value})} placeholder="需要覆盖的问题、行动建议、禁用表述等" /></label>
        </div>
        <footer><span>本次生成将预留 20 Credits</span><button type="button" onClick={() => setShowCreate(false)}>取消</button><button className="primary" disabled={creating}>{creating?"正在创建…":data.model.ready?"创建并由模型生成":"创建结构化草稿"}</button></footer>
      </form></div>}
      {confirmRegenerate && selectedRun && <div className="creation-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setConfirmRegenerate(false)}><section role="dialog" aria-modal="true" aria-labelledby="regenerate-title" className="creation-modal"><header><span><MagicWand /></span><div><h2 id="regenerate-title">重新生成内容</h2><p>将使用当前内容简报创建新的生成任务。</p></div><button aria-label="关闭" onClick={() => setConfirmRegenerate(false)}><X /></button></header><div><p>这次操作会预留 <strong>20 Credits</strong>。新内容生成后仍需质量检查和人工审核，不会覆盖当前已保存版本。</p></div><footer><button onClick={() => setConfirmRegenerate(false)}>取消</button><button className="primary" onClick={regenerate} disabled={regenerating}>{regenerating ? "正在创建任务…" : "确认重新生成"}</button></footer></section></div>}
    </div>
  );
}
