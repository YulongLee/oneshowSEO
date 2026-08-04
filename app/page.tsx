"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight, CheckCircle, Globe, PlayCircle, CaretDown,
  ChartBar, PenNib, MagnifyingGlass, TrendUp, RocketLaunch,
  Lightning, ShieldCheck, ClockCountdown,
} from "@phosphor-icons/react";
import { useLanguage } from "./i18n";

const features = [
  [ChartBar, "数据分析与机会发现", "整合搜索与站内数据，AI 自动识别增长机会和流量缺口。"],
  [PenNib, "AI 内容生成与优化", "从关键词研究到内容初稿，再到旧内容刷新与内链建议。"],
  [MagnifyingGlass, "技术 SEO 自动诊断", "持续检查抓取、索引、结构化数据和页面健康状态。"],
  [TrendUp, "排名监控与归因", "追踪关键词、页面与转化变化，判断每次优化的真实效果。"],
  [RocketLaunch, "自动执行与发布", "把高置信任务编入队列，审批后安全发布并验证结果。"],
] as const;

const workflow = ["采集", "诊断", "发现", "决策", "规划", "生产", "优化", "发布", "收录", "监控", "学习"];

export default function MarketingPage() {
  const { locale, setLocale } = useLanguage();
  return (
    <main className="marketing-page">
      <header className="marketing-nav">
        <Link href="/" aria-label="OneShowSEO 首页"><Image src="/brand/oneshowseo.png" alt="OneShowSEO" width={176} height={45} priority unoptimized /></Link>
        <nav aria-label="主导航">
          <a href="#product">产品 <CaretDown /></a>
          <a href="#workflow">解决方案 <CaretDown /></a>
          <a href="#features">功能 <CaretDown /></a>
          <a href="#pricing">定价</a>
          <a href="#resources">资源 <CaretDown /></a>
          <a href="#help">帮助中心</a>
        </nav>
        <div className="nav-actions">
          <button className="language" data-no-translate onClick={() => setLocale(locale === "zh-CN" ? "en-US" : "zh-CN")}><Globe /> {locale === "zh-CN" ? "简体中文" : "English"} <CaretDown /></button>
          <Link href="/login" className="text-link">登录</Link>
          <Link href="/register" className="primary-button">免费开始使用</Link>
        </div>
      </header>

      <section className="hero" id="product">
        <div className="hero-copy">
          <span className="eyebrow"><Lightning weight="fill" /> AI 驱动的 SEO 增长平台</span>
          <h1>让搜索流量<br/><em>自动增长</em></h1>
          <p>OneShowSEO 是你的 AI SEO 增长伙伴，自动发现机会、优化网站内容、提升排名，并用真实数据持续学习。</p>
          <ul>
            <li><CheckCircle weight="fill" />AI 自动分析并生成执行计划</li>
            <li><CheckCircle weight="fill" />技术、内容、排名数据统一管理</li>
            <li><CheckCircle weight="fill" />高风险变更保留人工审批</li>
            <li><CheckCircle weight="fill" />每天自动调度与效果验证</li>
          </ul>
          <div className="hero-actions">
            <Link href="/register" className="primary-button large">免费开始使用 <ArrowRight /></Link>
            <button className="secondary-button" onClick={() => document.querySelector("#workflow")?.scrollIntoView()}><PlayCircle /> 观看工作流程</button>
          </div>
          <small><ShieldCheck weight="fill" /> 无需信用卡 · 14 天免费试用 · 随时取消</small>
        </div>
        <DashboardPreview />
      </section>

      <section className="proof" aria-label="客户案例">
        <p>超过 2,000+ 团队正在使用 OneShowSEO 增长搜索流量</p>
        <div>{["NotebookAI", "InterviewPro", "ResumeBoost", "CodeCraft", "LaunchFast", "AIWriter", "DesignHub"].map((name) => <span key={name}><CheckCircle />{name}</span>)}</div>
      </section>

      <section className="feature-section" id="features">
        <div className="section-title"><span>完整能力</span><h2>AI 驱动的全流程 SEO</h2><p>从数据分析到内容发布，全程有据可查、有序执行。</p></div>
        <div className="feature-grid">{features.map(([Icon, title, desc]) => <article key={title}><span><Icon /></span><h3>{title}</h3><p>{desc}</p></article>)}</div>
      </section>

      <section className="workflow-section" id="workflow">
        <div className="section-title"><span>自动化工作流</span><h2>每天循环一次，增长持续发生</h2></div>
        <div className="workflow-steps">{workflow.map((item, index) => <div key={item}><b>{String(index + 1).padStart(2, "0")}</b><span>{item}</span></div>)}</div>
        <div className="workflow-note"><ClockCountdown /><div><strong>策略学习不是终点</strong><p>系统根据收录、排名、点击和转化结果，重新计算下一轮任务优先级。</p></div><Link href="/workspace">查看今日执行 <ArrowRight /></Link></div>
      </section>
    </main>
  );
}

function DashboardPreview() {
  return <div className="dashboard-preview" aria-label="OneShowSEO 产品预览">
    <div className="preview-side"><Image src="/brand/oneshowseo.png" alt="" width={118} height={30} unoptimized/>{["首页", "AI Copilot", "任务中心", "关键词研究", "内容中心", "排名监控", "技术 SEO", "数据分析"].map((x, i)=><span className={i===0?"active":""} key={x}>{x}</span>)}</div>
    <div className="preview-main">
      <div className="preview-head"><div><b>AI Copilot 今日摘要</b><small>已完成 8 项任务，发现 15 个优化机会</small></div><span>offersteady.com</span></div>
      <div className="preview-kpis">{[["自然流量","12,842","+18.6%"],["关键词排名提升","256","+32"],["点击量","8,732","+15.3%"],["展示量","215,987","+11.7%"]].map(x=><div key={x[0]}><small>{x[0]}</small><strong>{x[1]}</strong><em>{x[2]}</em></div>)}</div>
      <div className="preview-panels"><div><h4>今日任务</h4>{["修复 18 个站点问题","发布 2 篇新文章","提交 8 个页面到 Google","发现 5 个关键词机会"].map(x=><p key={x}><CheckCircle weight="fill"/>{x}</p>)}</div><div className="health"><h4>SEO 健康度</h4><strong>86</strong><span>/100</span><small>比上周提升 6 分</small></div><div><h4>最高优先级机会</h4>{["“AI Interview” 排名下降","创建简历工具落地页","优化 6 个页面内链"].map((x,i)=><p key={x}><b>P{i+1}</b>{x}</p>)}</div></div>
    </div>
  </div>
}
