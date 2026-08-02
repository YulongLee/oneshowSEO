"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  House, Robot, CheckSquare, MagnifyingGlass, FileText, ChartLineUp, UsersThree,
  FirstAidKit, Wrench, Sparkle, ChartBar, Gear, Bell, Question, CalendarBlank,
  ArrowUp, CheckCircle, Warning, ArrowRight, CaretDown, ThumbsUp, Lightbulb,
  LinkSimple, GoogleChromeLogo, Browsers, Globe, UserCircle,
} from "@phosphor-icons/react";
import { LineChart, Line, ResponsiveContainer, PieChart, Pie, Cell, Tooltip, XAxis } from "recharts";
import Image from "next/image";

const nav = [[House,"首页"],[Robot,"AI Copilot"],[CheckSquare,"任务中心"],[MagnifyingGlass,"关键词研究"],[FileText,"内容中心"],[ChartLineUp,"排名监控"],[UsersThree,"竞争对手"],[FirstAidKit,"网站体检"],[Wrench,"技术 SEO"],[Sparkle,"GEO 监控"],[ChartBar,"数据分析"],[Gear,"设置"]] as const;
const trend = [12,18,15,26,22,33,30,37,31,35,42].map((v,i)=>({x:i,v}));
const pie = [{name:"严重",value:12,color:"#ef4444"},{name:"重要",value:28,color:"#fb923c"},{name:"一般",value:47,color:"#fbbf24"},{name:"建议",value:41,color:"#4776ee"}];

export default function WorkspacePage(){
  const [toast,setToast]=useState("");
  const [currentUser,setCurrentUser]=useState<{name:string;email:string;plan:string;role:string}|null>(null);
  useEffect(()=>{fetch("/api/auth/me").then(response=>response.ok?response.json():null).then(result=>result?.user&&setCurrentUser(result.user)).catch(()=>undefined)},[]);
  const notify=(x:string)=>{setToast(x);window.setTimeout(()=>setToast(""),2200)};
  const logout=async()=>{await fetch("/api/auth/logout",{method:"POST"});window.location.href="/login"};
  return <main className="app-shell">
    <aside className="workspace-sidebar">
      <Link href="/"><Image src="/brand/oneshowseo.png" alt="OneShowSEO" width={162} height={41} unoptimized/></Link>
      <button className="project-select">offersteady.com <CaretDown/></button>
      <nav>{nav.map(([Icon,label],i)=><button key={label} className={i===0?"active":""} onClick={()=>notify(`${label} 模块已选择`)}><Icon/>{label}{label==="GEO 监控"&&<small>Beta</small>}</button>)}</nav>
      <div className="plan-card"><span>当前套餐 · {currentUser?.plan === "trial" ? "14 天试用" : currentUser?.plan || "Pro"}</span><p>AI 生成文章 <b>32 / 100</b></p><i><em style={{width:"32%"}}/></i><p>关键词监控 <b>450 / 1000</b></p><i><em style={{width:"45%"}}/></i><p>页面抓取 <b>1200 / 5000</b></p><i><em style={{width:"24%"}}/></i><button>升级套餐</button></div>
    </aside>
    <section className="workspace-content">
      <header className="app-topbar"><span/><div><button><Bell/><b>12</b></button><button><Question/></button><UserCircle weight="fill"/><strong>{currentUser?.name || "用户"}</strong>{currentUser?.role === "admin"&&<Link href="/admin">管理后台</Link>}<button className="account-menu-button" onClick={logout}>退出</button></div></header>
      <div className="workspace-inner">
        <div className="workspace-heading"><div><h1>你好，{currentUser?.name || "用户"} 👋</h1><p>AI SEO 助手已为你完成每日分析，以下是你网站的增长概览</p></div><button className="date-button"><CalendarBlank/> 2025-05-18　~　2025-05-24</button></div>
        <div className="metric-grid">{[["自然流量","12,842","18.6%","#4776ee"],["关键词排名提升","256","32","#7c5cff"],["点击量","8,732","15.3%","#20b77a"],["展示量","215,987","11.7%","#f59e0b"],["收录页面","1,248","28","#4776ee"]].map(x=><article key={x[0]}><span>{x[0]}</span><div><strong>{x[1]}</strong><em><ArrowUp/>{x[2]}</em></div><small>较上周期</small><div className="mini-chart"><ResponsiveContainer><LineChart data={trend}><Line type="monotone" dataKey="v" stroke={x[3]} dot={false} strokeWidth={2}/></LineChart></ResponsiveContainer></div></article>)}<article className="score-card"><span>SEO 健康分</span><div className="score-ring"><strong>86</strong><small>/100</small></div><em><ArrowUp/>6</em></article></div>
        <div className="workspace-grid">
          <section className="panel task-summary"><div className="panel-title"><h2>AI Copilot 今日执行摘要</h2></div>{[["完成了 18 个技术 SEO 问题修复","修复了 404 错误、Canonical 问题、图片缺失 Alt 等问题"],["发布了 2 篇新文章","AI Interview Assistant 完整指南、如何准备系统设计面试"],["优化了 6 个页面","更新了 Title、Meta、FAQ 和内链结构"],["提交了 15 个页面到 Google","已通过 Indexing API 提交"],["发现 45 个关键词机会","其中 12 个高价值关键词已加入内容计划"]].map(x=><div className="task-row" key={x[0]}><CheckCircle weight="fill"/><div><strong>{x[0]}</strong><small>{x[1]}</small></div><button onClick={()=>notify("任务详情已打开")}>查看详情</button></div>)}<button className="panel-footer" onClick={()=>notify("已打开全部任务")}>查看所有任务 <ArrowRight/></button></section>
          <section className="panel health-panel"><div className="panel-title"><h2>网站健康状况</h2><a href="#health">查看完整报告</a></div><div className="health-content"><div className="donut"><PieChart width={190} height={190}><Pie data={pie} dataKey="value" innerRadius={54} outerRadius={78} paddingAngle={1}>{pie.map(x=><Cell key={x.name} fill={x.color}/>)}</Pie><Tooltip/></PieChart><span>共<strong>128</strong>个问题</span></div><div className="legend">{pie.map(x=><p key={x.name}><i style={{background:x.color}}/>{x.name}<b>{x.value}</b></p>)}</div></div><button className="danger-action" onClick={()=>notify("已创建严重问题修复任务")}><Warning/>发现 12 个严重问题 <span>立即处理</span></button></section>
          <section className="panel recommend-panel"><div className="panel-title"><h2>AI 推荐</h2></div>{[[Sparkle,"创建新内容机会","AI Mock Interview 搜索量增长 320%","高机会"],[FileText,"优化现有页面","8 个页面排名在 11–20 位","高影响"],[Wrench,"技术问题修复","Site Audit 发现 12 个严重问题","紧急"],[LinkSimple,"提升内部链接","发现 25 个内部链接机会","建议"]].map(([Icon,title,desc,tag])=><button className="recommend-row" key={title as string} onClick={()=>notify(`${title} 已加入任务队列`)}><Icon/><div><strong>{title as string}</strong><small>{desc as string}</small></div><em>{tag as string}</em><CaretDown/></button>)}<button className="panel-footer">查看所有推荐 <ArrowRight/></button></section>
          <section className="panel rank-panel"><div className="panel-title"><h2>关键词排名趋势</h2></div><div className="rank-tabs"><span>全部</span><span>Top 3</span><span>4–10</span><span>11–20</span></div><div className="large-chart"><ResponsiveContainer><LineChart data={trend}><XAxis dataKey="x" hide/><Line dataKey="v" stroke="#4776ee" dot={false} strokeWidth={2}/><Line dataKey="v" stroke="#7c5cff" dot={false} strokeWidth={1} transform="translate(0,18)"/></LineChart></ResponsiveContainer></div></section>
          <section className="panel source-panel"><div className="panel-title"><h2>流量来源对比</h2></div><div className="source-body"><div className="source-donut"><PieChart width={170} height={170}><Pie data={[62,21,10,5,2].map((value,i)=>({value}))} dataKey="value" innerRadius={52} outerRadius={75}>{["#20b77a","#4776ee","#fbbf24","#ef6db3","#d7deea"].map(c=><Cell key={c} fill={c}/>)}</Pie></PieChart><span><strong>12,842</strong>总流量</span></div><div><p>自然搜索 <b>62.5%</b></p><p>直接访问 <b>20.6%</b></p><p>推荐流量 <b>10.3%</b></p><p>社交媒体 <b>5.0%</b></p></div></div></section>
          <section className="panel content-panel"><div className="panel-title"><h2>最新内容表现</h2><a href="#all">查看全部</a></div>{[["AI Interview Assistant 完整指南","1,287","842","3"],["如何准备系统设计面试","956","623","5"],["Top 10 AI 面试工具对比","834","512","7"]].map(x=><div className="content-row" key={x[0]}><div><strong>{x[0]}</strong><small>发布于 2025-05-20</small></div><span>{x[1]}<small>浏览量</small></span><span>{x[2]}<small>点击量</small></span><span>{x[3]}<small>排名</small></span></div>)}</section>
        </div>
        <section className="connections"><h2>已连接的数据源</h2>{[[GoogleChromeLogo,"Google Search Console"],[ChartBar,"Google Analytics 4"],[Browsers,"Bing Webmaster"],[MagnifyingGlass,"DataForSEO"],[Globe,"WordPress"]].map(([Icon,name])=><span key={name as string}><Icon/><b>{name as string}</b><small>已连接</small></span>)}<button onClick={()=>notify("数据源管理已打开")}>管理连接</button></section>
      </div>
    </section>
    {toast&&<div className="toast"><ThumbsUp weight="fill"/>{toast}</div>}
  </main>
}
