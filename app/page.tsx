"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, type ComponentType } from "react";
import {
  ArrowRight, Brain, CaretDown, ChartLineUp, Check, CheckCircle,
  ClipboardText, FileText, Globe, List, MagnifyingGlass,
  PaperPlaneTilt, ShieldCheck, Sparkle, Target, TrendUp, UserFocus, X,
} from "@phosphor-icons/react";
import { useLanguage } from "./i18n";
import "./home.css";

type Icon = ComponentType<{ weight?: "regular" | "fill" | "duotone" }>;

const copy = {
  zh: {
    nav: ["产品", "工作方式", "为什么选择", "定价"], login: "登录", start: "开始免费增长",
    heroEyebrow: "AI AGENT 驱动的自然增长系统", title: <>让每一个好产品<br/>都应该被看见</>,
    hero: "把网站、市场和内容交给一组协作的 AI Agent。每天发现机会、执行策略、沉淀证据，让自然增长从偶然变成系统。",
    primary: "开始免费增长", secondary: "看看今天会做什么", trust: ["无需信用卡", "几分钟创建项目", "关键操作由你审批"],
    visibilityStates: [["未被发现", "产品价值被搜索噪音淹没"], ["建立可见度", "内容与页面被搜索和 AI 理解"], ["持续被发现", "用结果指导下一轮策略"]],
    today: "今天 OneShowSEO 将会", todayLink: "查看完整计划",
    daily: [["发现机会", "扫描网站与市场信号"], ["制定策略", "按影响和证据排序"], ["创建内容", "生成可编辑的任务"], ["发布优化", "审批后进入执行"], ["学习迭代", "用结果更新下一步"]],
    journeyEyebrow: "从隐形到可见", journeyTitle: "一条每天持续推进的增长旅程",
    journeyBody: "不是一次性生成报告，而是把发现、决策、执行和复盘连成同一个可追踪的工作流。",
    journey: [["发现", "找到用户在搜索什么，以及你还缺什么"], ["决策", "判断最值得先做的机会与修复"], ["创建", "把证据变成内容与页面任务"], ["发布", "经审批后交付到真实渠道"], ["学习", "复查结果并调整下一轮方向"]],
    evidenceEyebrow: "真实产品能力", evidenceTitle: <>每一步都有证据<br/>每一步都可执行</>,
    evidenceBody: "OneShowSEO 不用演示数字填满仪表盘。没有连接的数据会明确显示等待接入，所有建议都保留来源、风险和审批记录。",
    evidenceItems: [["证据溯源", "清楚看到建议来自哪个页面与检查结果"], ["可控执行", "内容与发布等关键动作默认保留人工审批"], ["沉淀资产", "报告、任务和内容进入同一个项目上下文"]],
    previewTitle: "项目机会概览", previewTabs: ["研究机会", "技术问题", "内容任务", "发布计划"],
    previewRows: [["网站基础诊断", "可运行", "公开网站"], ["搜索表现分析", "等待连接", "Search Console"], ["内容机会研究", "准备就绪", "项目上下文"], ["发布与效果复查", "等待授权", "CMS / Analytics"]],
    previewAction: "添加网站并开始", whyTitle: "为什么选择 OneShowSEO",
    why: [["提升可见度", "从真实搜索需求和网站事实出发，让产品更容易被搜索和 AI 答案发现。"], ["提升效率", "多个专业 Agent 共用同一份上下文，减少工具切换和重复整理。"], ["掌控与安心", "权限、Credits、证据和审批都留在系统中，关键动作始终可追踪。"]],
    pricingEyebrow: "先试用，再决定", pricingTitle: "简单定价，按需选择", pricingBody: "当前公开试用不会自动扣费。需要更大容量时，再选择适合团队的方案。",
    plans: [["Trial", "免费试用", "适合验证首个网站", ["1 个项目", "真实网站诊断", "基础 Agent 工作流"], "免费开始", "open"], ["Pro", "专业版", "适合个人与小型团队", ["更多项目与 Credits", "自动化每日计划", "数据连接与团队协作"], "查看方案", "featured"], ["Team", "团队版", "适合多项目运营", ["更高容量与席位", "API 与治理能力", "上线与运营支持"], "联系团队", ""]],
    faqTitle: "常见问题", faqs: [
      ["需要多久能看到第一份结果？", "创建项目并添加公开网站后，可以先运行基础诊断。搜索表现、流量与发布状态需要连接对应的数据源。"],
      ["我需要懂 SEO 才能使用吗？", "不需要。OneShowSEO 会解释问题、证据、影响和下一步，专业用户也可以查看更完整的检查与执行记录。"],
      ["AI 生成的内容可以直接发布吗？", "内容会先进入可编辑和可审批状态。只有在连接发布平台并获得明确授权后，系统才会执行发布动作。"],
      ["数据安全吗？", "项目数据按组织隔离，凭证加密保存；权限、审计和审批记录用于控制敏感操作。"],
      ["可以连接现有工具吗？", "可以逐步连接 Search Console、Analytics、WordPress 等工具。未连接时，页面会如实显示等待接入。"],
      ["可以随时取消吗？", "可以。公开试用不会自动扣费，付费方案上线后也会在结算前明确展示价格、周期与取消规则。"],
    ],
    finalTitle: "让你的好产品被更多对的人看见", finalBody: "从一个真实网站开始，建立可持续、可验证的自然增长系统。",
    footer: "AI 驱动、人工可控的 SEO 增长系统。", rights: "© 2026 OneShowSEO. 保留所有权利。",
  },
  en: {
    nav: ["Product", "How it works", "Why OneShowSEO", "Pricing"], login: "Log in", start: "Start growing free",
    heroEyebrow: "AI AGENT-POWERED ORGANIC GROWTH", title: <>Every great product<br/>deserves to be seen</>,
    hero: "Give your site, market, and content to a coordinated team of AI Agents. They find opportunities, execute strategy, preserve evidence, and turn organic growth into a system.",
    primary: "Start growing free", secondary: "See today’s plan", trust: ["No credit card", "Create a project in minutes", "You approve critical actions"],
    visibilityStates: [["Unseen", "Product value is buried in search noise"], ["Building visibility", "Search and AI can understand your content"], ["Continuously discovered", "Results guide the next strategy"]],
    today: "Today, OneShowSEO will", todayLink: "View the full plan",
    daily: [["Find opportunities", "Scan site and market signals"], ["Set strategy", "Prioritize by impact and evidence"], ["Create content", "Produce editable tasks"], ["Publish safely", "Move forward after approval"], ["Learn and iterate", "Use results to update the plan"]],
    journeyEyebrow: "FROM UNSEEN TO VISIBLE", journeyTitle: "A growth journey that moves forward every day",
    journeyBody: "Not another one-off report. Discovery, decisions, execution, and learning live in one traceable workflow.",
    journey: [["Discover", "Understand what people seek and what is missing"], ["Decide", "Choose the highest-value opportunity or fix"], ["Create", "Turn evidence into content and page tasks"], ["Publish", "Deliver through approved channels"], ["Learn", "Review outcomes and update the next cycle"]],
    evidenceEyebrow: "REAL PRODUCT BEHAVIOR", evidenceTitle: <>Evidence at every step.<br/>Action behind every insight.</>,
    evidenceBody: "OneShowSEO never fills a dashboard with demo numbers. Missing connections are clearly labeled, and every recommendation retains its source, risk, and approval record.",
    evidenceItems: [["Traceable evidence", "See the exact page and check behind every recommendation"], ["Controlled execution", "Content and publishing actions retain human approval"], ["Durable assets", "Reports, tasks, and content stay in one project context"]],
    previewTitle: "Project opportunity overview", previewTabs: ["Research", "Technical issues", "Content tasks", "Publishing plan"],
    previewRows: [["Site baseline audit", "Available", "Public site"], ["Search performance", "Connect data", "Search Console"], ["Content opportunity research", "Ready", "Project context"], ["Publishing and follow-up", "Authorization needed", "CMS / Analytics"]],
    previewAction: "Add a site and start", whyTitle: "Why OneShowSEO",
    why: [["Improve visibility", "Start from real search demand and site evidence so your product is easier to discover in search and AI answers."], ["Move faster", "Specialist Agents share one context, reducing tool switching and repetitive coordination."], ["Stay in control", "Permissions, Credits, evidence, and approvals remain traceable across critical actions."]],
    pricingEyebrow: "TRY FIRST, DECIDE LATER", pricingTitle: "Simple plans for each stage", pricingBody: "The public trial never charges automatically. Choose more capacity only when your team is ready.",
    plans: [["Trial", "Free trial", "Validate your first site", ["1 project", "Verified site audit", "Core Agent workflow"], "Start free", "open"], ["Pro", "Professional", "For individuals and small teams", ["More projects and Credits", "Automated daily plans", "Connections and collaboration"], "View plans", "featured"], ["Team", "Team plan", "For multi-project operations", ["Higher capacity and seats", "API and governance", "Launch and operations support"], "Contact us", ""]],
    faqTitle: "Frequently asked questions", faqs: [
      ["How quickly can I see the first result?", "Add a public site and run a baseline audit. Search performance, traffic, and publishing status require the relevant connection."],
      ["Do I need to be an SEO expert?", "No. OneShowSEO explains the issue, evidence, impact, and next step while preserving deeper records for specialists."],
      ["Can AI-generated content publish automatically?", "Content begins as an editable, approval-ready asset. Publishing only occurs after a platform is connected and explicitly authorized."],
      ["Is my data secure?", "Project data is isolated by organization, credentials are encrypted, and sensitive actions are governed by permissions and audit records."],
      ["Can I connect my existing tools?", "You can progressively connect Search Console, Analytics, WordPress, and more. Missing connections are shown honestly."],
      ["Can I cancel anytime?", "Yes. The trial never charges automatically, and paid terms will be shown clearly before checkout."],
    ],
    finalTitle: "Help the right people discover your great product", finalBody: "Start with one real website and build a sustainable, verifiable organic growth system.",
    footer: "AI-driven, human-controlled organic growth.", rights: "© 2026 OneShowSEO. All rights reserved.",
  },
} as const;

const navTargets = ["product", "workflow", "why", "pricing"];
const dailyIcons: Icon[] = [MagnifyingGlass, Target, FileText, PaperPlaneTilt, ChartLineUp];
const journeyIcons: Icon[] = [MagnifyingGlass, Target, Sparkle, PaperPlaneTilt, TrendUp];
const evidenceIcons: Icon[] = [ClipboardText, ShieldCheck, Brain];
const whyIcons: Icon[] = [UserFocus, TrendUp, ShieldCheck];

export default function MarketingPage() {
  const { isEnglish, locale, setLocale } = useLanguage();
  const [menuOpen, setMenuOpen] = useState(false);
  const c = isEnglish ? copy.en : copy.zh;

  return <main className="visibility-home" data-no-translate>
    <header className="visibility-nav">
      <Link className="visibility-brand" href="/" aria-label="OneShowSEO home"><Image src="/brand/oneshowseo.png" alt="OneShowSEO" width={178} height={45} priority unoptimized/></Link>
      <nav aria-label="Primary navigation">{c.nav.map((label,index)=><a key={label} href={`#${navTargets[index]}`}>{label}</a>)}</nav>
      <div className="visibility-nav-actions">
        <button className="visibility-locale" onClick={()=>setLocale(locale==="zh-CN"?"en-US":"zh-CN")}><Globe/>{isEnglish?"中文":"EN"}</button>
        <Link className="visibility-login" href="/login">{c.login}</Link><Link className="visibility-button small" href="/login">{c.start}</Link>
        <button className="visibility-menu" aria-label={menuOpen?"Close menu":"Open menu"} aria-expanded={menuOpen} onClick={()=>setMenuOpen(!menuOpen)}>{menuOpen?<X/>:<List/>}</button>
      </div>
      {menuOpen&&<div className="visibility-mobile-nav">{c.nav.map((label,index)=><a key={label} href={`#${navTargets[index]}`} onClick={()=>setMenuOpen(false)}>{label}</a>)}<Link href="/login">{c.login}</Link><Link href="/login">{c.start}</Link></div>}
    </header>

    <section className="visibility-hero" id="product">
      <div className="visibility-hero-copy"><span className="visibility-eyebrow"><Sparkle weight="fill"/>{c.heroEyebrow}</span><h1>{c.title}</h1><p>{c.hero}</p>
        <div className="visibility-hero-actions"><Link className="visibility-button" href="/login">{c.primary}<ArrowRight/></Link><a className="visibility-button secondary" href="#daily">{c.secondary}<ArrowRight/></a></div>
        <ul className="visibility-trust">{c.trust.map(item=><li key={item}><CheckCircle weight="fill"/>{item}</li>)}</ul>
      </div>
      <div className="visibility-hero-art" aria-label={isEnglish?"A visibility journey from unseen to continuously discovered":"产品从未被发现到持续被看见的路径"}>
        <Image src="/marketing/visibility-journey-v2.webp" alt="" width={900} height={1013} priority sizes="(max-width: 900px) 90vw, 46vw"/>
        {c.visibilityStates.map(([title,body],index)=>{const Icon=[MagnifyingGlass,Brain,UserFocus][index];return <article className={`visibility-state state-${index+1}`} key={title}><span><Icon weight="duotone"/></span><div><strong>{title}</strong><small>{body}</small></div></article>})}
      </div>
    </section>

    <section className="visibility-daily" id="daily"><header><span><Sparkle weight="fill"/>{c.today}</span><a href="#workflow">{c.todayLink}<ArrowRight/></a></header><div>{c.daily.map(([title,body],index)=>{const Icon=dailyIcons[index];return <article key={title}><span><Icon weight="duotone"/></span><h3>{title}</h3><p>{body}</p></article>})}</div></section>

    <section className="visibility-journey" id="workflow"><header className="visibility-section-head"><span>{c.journeyEyebrow}</span><h2>{c.journeyTitle}</h2><p>{c.journeyBody}</p></header><div className="visibility-journey-track">{c.journey.map(([title,body],index)=>{const Icon=journeyIcons[index];return <article key={title}><div><span><Icon weight="duotone"/></span>{index<c.journey.length-1&&<ArrowRight className="journey-arrow"/>}</div><h3>{title}</h3><p>{body}</p></article>})}</div></section>

    <section className="visibility-evidence">
      <div className="visibility-preview" aria-label={c.previewTitle}><header><div><Image src="/brand/oneshowseo.png" alt="" width={102} height={26} unoptimized/><span>{c.previewTitle}</span></div><small>OneShowSEO Workspace</small></header><nav>{c.previewTabs.map((tab,index)=><span className={index===0?"active":""} key={tab}>{tab}</span>)}</nav><div className="visibility-preview-table">{c.previewRows.map(([title,status,source],index)=><article key={title}><span className={`preview-index preview-${index}`}>0{index+1}</span><div><strong>{title}</strong><small>{source}</small></div><em>{status}</em></article>)}</div><Link href="/login">{c.previewAction}<ArrowRight/></Link></div>
      <div className="visibility-evidence-copy"><span className="visibility-eyebrow">{c.evidenceEyebrow}</span><h2>{c.evidenceTitle}</h2><p>{c.evidenceBody}</p><div>{c.evidenceItems.map(([title,body],index)=>{const Icon=evidenceIcons[index];return <article key={title}><span><Icon weight="duotone"/></span><div><h3>{title}</h3><p>{body}</p></div></article>})}</div></div>
    </section>

    <section className="visibility-why" id="why"><h2>{c.whyTitle}</h2><div>{c.why.map(([title,body],index)=>{const Icon=whyIcons[index];return <article key={title}><span><Icon weight="duotone"/></span><h3>{title}</h3><p>{body}</p></article>})}</div></section>

    <section className="visibility-pricing" id="pricing"><header className="visibility-section-head"><span>{c.pricingEyebrow}</span><h2>{c.pricingTitle}</h2><p>{c.pricingBody}</p></header><div className="visibility-plans">{c.plans.map(([name,price,audience,items,cta,tone])=><article className={tone} key={name}><header><span>{name}</span>{tone==="featured"&&<em>{isEnglish?"Recommended":"推荐"}</em>}</header><h3>{price}</h3><p>{audience}</p><ul>{items.map(item=><li key={item}><Check/>{item}</li>)}</ul><Link href={name==="Trial"?"/login":name==="Pro"?"/pricing":"mailto:1797358496@qq.com"}>{cta}<ArrowRight/></Link></article>)}</div><Link className="visibility-text-link" href="/pricing">{isEnglish?"Compare plan details":"查看完整套餐说明"}<ArrowRight/></Link></section>

    <section className="visibility-faq"><header><span>FAQ</span><h2>{c.faqTitle}</h2></header><div>{c.faqs.map(([question,answer])=><details key={question}><summary>{question}<CaretDown/></summary><p>{answer}</p></details>)}</div></section>

    <section className="visibility-final"><Image src="/marketing/visibility-journey-v2.webp" alt="" width={900} height={1013}/><div><h2>{c.finalTitle}</h2><p>{c.finalBody}</p><Link className="visibility-button" href="/login">{c.primary}<ArrowRight/></Link></div></section>

    <footer className="visibility-footer"><div><Image src="/brand/oneshowseo.png" alt="OneShowSEO" width={164} height={42} unoptimized/><p>{c.footer}</p></div><nav><a href="#product">{c.nav[0]}</a><a href="#workflow">{c.nav[1]}</a><Link href="/pricing">{c.nav[3]}</Link><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></nav><small>{c.rights}</small></footer>
  </main>;
}
