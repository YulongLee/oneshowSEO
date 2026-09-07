"use client";

import { ArrowRight, Brain, CheckCircle, ClipboardText, FirstAidKit, Flag, MagnifyingGlass, PlugsConnected, ShieldCheck, Sparkle, Target, TrendUp, WarningCircle } from "@phosphor-icons/react";

type Project={id:string;name?:string;host?:string;siteUrl?:string};
type AuditRun={score:number;checksFailed:number;checksWarning:number;completedAt:number};
type Finding={id:string;title:string;description:string;severity:string;url:string};
type Task={id:string;title:string;description:string;priority:number;status:string;category?:string};
type Opportunity={id:string;title:string;keyword:string;priority:number;source:string};
type Research={latestRun?:{completedAt:number;opportunitiesFound:number};opportunities:Opportunity[];capabilities:{publicCrawl:boolean;keywordMetrics:boolean;competitorData:boolean;trendData:boolean}};

export default function GrowthCenter({project,run,findings,tasks,research,busy,audit,navigate}:{project:Project;run?:AuditRun;findings:Finding[];tasks:Task[];research?:Research;busy:boolean;audit:()=>void;navigate:(value:string)=>void}){
  const opportunities=research?.opportunities||[],pending=tasks.filter(item=>item.status==="proposed"),issues=run?run.checksFailed+run.checksWarning:0;
  const actions=[
    ...pending.map(item=>({id:`task:${item.id}`,title:item.title,detail:item.description||"等待确认执行范围",tone:"approval",label:"待审批",route:"任务中心",priority:item.priority})),
    ...findings.filter(item=>["critical","high"].includes(item.severity)).map(item=>({id:`finding:${item.id}`,title:item.title,detail:item.description||item.url||"查看诊断证据",tone:"risk",label:item.severity==="critical"?"严重问题":"高优先级",route:"网站诊断",priority:item.severity==="critical"?100:90})),
    ...opportunities.filter(item=>item.priority>=70).map(item=>({id:`opportunity:${item.id}`,title:item.title,detail:`关键词：${item.keyword} · 来源：${item.source}`,tone:"growth",label:"增长机会",route:"内容计划",priority:item.priority})),
  ].sort((a,b)=>b.priority-a.priority).filter((item,index,all)=>all.findIndex(candidate=>candidate.title===item.title)===index).slice(0,6);
  const next=!run?{title:"建立网站增长基线",detail:"先运行技术审计，确认收录、结构和页面风险。",action:"运行首次审计",route:"audit"}:!research?.latestRun?{title:"发现第一批增长机会",detail:"基于网站证据整理关键词、内容缺口和可执行任务。",action:"运行 SEO 研究",route:"SEO研究"}:pending.length?{title:`确认 ${pending.length} 项待审批行动`,detail:"先确认影响范围，再进入执行队列并保留审计记录。",action:"处理审批",route:"任务中心"}:opportunities.length?{title:`把 ${opportunities.length} 个机会转为计划`,detail:"选择高价值主题，创建内容简报并安排生产。",action:"进入内容计划",route:"内容计划"}:{title:"更新增长研究",detail:"当前没有待处理机会，重新获取最新站内证据。",action:"重新研究",route:"SEO研究"};
  const sources=[
    ["网站抓取",Boolean(research?.capabilities.publicCrawl||run)],
    ["关键词指标",Boolean(research?.capabilities.keywordMetrics)],
    ["竞品数据",Boolean(research?.capabilities.competitorData)],
    ["趋势数据",Boolean(research?.capabilities.trendData)],
  ] as const;
  const lastUpdated=Math.max(run?.completedAt||0,research?.latestRun?.completedAt||0);
  return <div className="growth-center">
    <header className="growth-center-header"><div><span>GROWTH COMMAND CENTER</span><h1>增长总览</h1><p>把研究、诊断和关键词结果转成下一步行动，并持续跟踪完成情况。</p></div><aside><small>{project.host||project.siteUrl||project.name||"当前项目"} · {lastUpdated?`更新于 ${new Date(lastUpdated*1000).toLocaleString("zh-CN")}`:"尚未建立增长基线"}</small><button onClick={()=>navigate("SEO研究")}><Brain/>运行研究</button><button className="primary" onClick={audit} disabled={busy}><ShieldCheck/>{busy?"正在诊断…":"运行技术审计"}</button></aside></header>
    <section className="growth-scorecards">
      <article><span className="purple"><TrendUp/></span><div><small>SEO 健康分</small><strong>{run?run.score:"—"}</strong><p>{run?"来自最近一次真实审计":"等待首次审计"}</p></div></article>
      <article><span className={issues?"orange":"green"}>{issues?<WarningCircle/>:<CheckCircle/>}</span><div><small>开放问题</small><strong>{run?issues:"—"}</strong><p>{run?`${run.checksFailed} 严重 · ${run.checksWarning} 警告`:"尚无诊断证据"}</p></div></article>
      <article><span className="blue"><MagnifyingGlass/></span><div><small>增长机会</small><strong>{opportunities.length}</strong><p>来自可追溯研究结果</p></div></article>
      <article><span className="red"><Flag/></span><div><small>待审批行动</small><strong>{pending.length}</strong><p>确认后才能进入执行</p></div></article>
    </section>
    <section className="growth-path" aria-label="增长工作流">{[
      ["01","SEO 研究","发现需求与内容缺口",Brain,"SEO研究",Boolean(research?.latestRun)],
      ["02","技术审计","确认站点风险与证据",FirstAidKit,"网站诊断",Boolean(run)],
      ["03","关键词决策","选择有价值的主题",Target,"关键词研究",opportunities.length>0],
      ["04","执行增长","创建内容或修复任务",ClipboardText,"任务中心",pending.length>0||actions.length>0],
    ].map(([step,title,detail,Icon,route,ready])=><button key={String(step)} onClick={()=>navigate(String(route))} className={ready?"ready":""}><b>{String(step)}</b><span><Icon/><div><strong>{String(title)}</strong><small>{String(detail)}</small></div></span><ArrowRight/></button>)}</section>
    <div className="growth-center-grid"><main><header><div><h2>优先行动</h2><p>按风险、商业价值和当前状态排序。</p></div><button onClick={()=>navigate("任务中心")}>全部任务 <ArrowRight/></button></header>{actions.length?<div className="growth-action-list">{actions.map(item=><article key={item.id}><span className={item.tone}>{item.tone==="risk"?<FirstAidKit/>:item.tone==="approval"?<ClipboardText/>:<Sparkle/>}</span><div><strong>{item.title}</strong><p>{item.detail}</p></div><em className={item.tone}>{item.label}</em><button onClick={()=>navigate(item.route)}>处理 <ArrowRight/></button></article>)}</div>:<div className="growth-action-empty"><CheckCircle/><strong>当前没有高优先级行动</strong><p>运行技术审计和 SEO 研究后，增长建议会集中显示在这里。</p></div>}</main>
      <aside><section className="growth-next"><span><Sparkle/>建议下一步</span><h2>{next.title}</h2><p>{next.detail}</p><button onClick={()=>next.route==="audit"?audit():navigate(next.route)} disabled={busy&&next.route==="audit"}>{next.action}<ArrowRight/></button></section><section className="growth-data"><header><div><h2>数据可信度</h2><p>只展示已接入的真实数据</p></div><button onClick={()=>navigate("数据连接")}><PlugsConnected/>管理</button></header>{sources.map(([label,ready])=><article key={label}><span className={ready?"ready":""}>{ready?<CheckCircle/>:<WarningCircle/>}</span><strong>{label}</strong><em>{ready?"已就绪":"待接入"}</em></article>)}</section></aside>
    </div>
  </div>;
}
