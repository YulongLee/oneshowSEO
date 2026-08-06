"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, type ComponentType } from "react";
import {
  ArrowRight, Brain, CaretDown, ChartLineUp, Check, CheckCircle,
  ClipboardText, Code, Database, FileText, Globe, List, LockKey,
  MagnifyingGlass, PaperPlaneTilt, PlayCircle, Pulse, Robot, ShieldCheck,
  Sparkle, Target, TrendUp, UsersThree, X,
} from "@phosphor-icons/react";
import { useLanguage } from "./i18n";
import "./home.css";

type Icon = ComponentType<{ weight?: "regular" | "fill" | "duotone" }>;

const copy = {
  zh: {
    announcement: "OneShowSEO 公开试用现已开放", announcementLink: "立即体验",
    nav: ["产品", "解决方案", "工作流", "数据连接", "定价"], login: "登录", start: "免费开始",
    eyebrow: "AI SEO 增长系统", title: <>让每一个好网站<br/>被真正需要的人看见</>,
    hero: "从网站诊断、机会研究到内容任务、人工审批和效果复查，OneShowSEO 把复杂的 SEO 工作变成一条清晰、可信、可持续的增长闭环。",
    primary: "创建增长项目", secondary: "看看如何运行", safety: "无需信用卡 · 公开网站即可开始 · 高风险操作保留人工审批",
    loop: "为不同增长团队提供同一条可控 SEO 闭环", audiences: ["AI 与 SaaS", "专业服务", "消费品牌", "内容团队", "跨境业务"],
    proofTitle: "把分散的 SEO 工作，变成一个每天更聪明的系统",
    proofBody: "不再在审计工具、表格、内容文档和任务群之间来回切换。每个问题都有证据，每个建议都有优先级，每次执行都有记录。",
    principles: [
      ["真实证据", "从公开页面与已授权数据中收集事实，不用虚构指标填满仪表盘。"],
      ["人机协作", "AI 负责发现、整理和起草；团队决定什么可以继续推进。"],
      ["持续学习", "每次复查都回到项目历史中，帮助下一轮任务更准确。"],
    ],
    workflowEyebrow: "从发现到结果", workflowTitle: "一条真正闭环的 SEO 工作流",
    workflowBody: "先把一个网站看清楚，再决定下一步。OneShowSEO 让团队始终知道系统正在做什么、为什么做、接下来会发生什么。",
    workflow: [
      ["01", "添加网站", "输入公开网站，建立项目与市场基线。"],
      ["02", "诊断与研究", "检查技术问题、内容缺口与增长机会。"],
      ["03", "形成任务", "把证据转成有优先级、可追踪的行动。"],
      ["04", "审批与交付", "高风险变更由人确认，再生成内容或发布任务。"],
      ["05", "复查与学习", "比较前后变化，更新下一轮执行顺序。"],
    ],
    systemEyebrow: "一个工作区，多种专业能力", systemTitle: "让 Agent 围绕同一个项目协作",
    systemBody: "所有 Agent 共用项目、权限、Credits、任务、证据和审计记录。你得到的不是一排聊天机器人，而是一套可治理的增长系统。",
    agents: [
      ["SEO 审计 Agent", "检查抓取、索引、元数据与页面结构，输出可验证的问题清单。", "已开放"],
      ["研究 Agent", "从公开页面发现关键词、竞争内容与主题机会。", "公开数据"],
      ["内容 Agent", "把已批准机会转成内容候选、简报和可编辑草稿。", "受控工作流"],
      ["发布 Agent", "创建发布任务并保留人工审批；外部发布需先连接平台。", "需连接"],
    ],
    capabilitiesEyebrow: "完整但不失控", capabilitiesTitle: "商业团队需要的能力边界",
    capabilities: [
      ["技术 SEO", "真实抓取与证据", "检查状态码、标题、描述、Canonical、H1、图片替代文本及更多页面信号。"],
      ["机会研究", "从事实形成方向", "把站点、主题和公开竞争页面转成可排序的增长机会。"],
      ["任务与审批", "每一步都可追踪", "建议、风险、负责人和状态集中管理，高风险操作默认等待确认。"],
      ["内容生产", "从机会到候选稿", "以关键词、证据和项目背景为输入，形成可编辑、可审批的内容任务。"],
      ["报告与资产", "结果可以带走", "保存诊断报告、内容资产和执行证据，支持受控下载与保留策略。"],
      ["API 与 MCP", "让平台进入你的流程", "使用项目范围密钥、限流、权益和审计，将 OneShowSEO 接入内部系统。"],
    ],
    integrationsEyebrow: "连接你已有的数据", integrationsTitle: "授权后，建议会更接近真实业务结果",
    integrationsBody: "公开网站无需授权即可诊断。连接 Search Console、Analytics 或 CMS 后，平台才能进一步理解曝光、点击、内容表现和发布状态。",
    connected: "接入框架已就绪", authorization: "客户授权后启用", noSecrets: "凭证加密保存，不出现在浏览器和报告中",
    commercialEyebrow: "从试用到团队协作", commercialTitle: "先验证价值，再选择合适容量",
    commercialBody: "当前开放免费试用，在线支付尚未启用。你可以先完成真实网站诊断；需要更大项目容量时再申请开通。",
    plans: [
      ["Trial", "免费试用", "适合验证首个网站", ["1 个项目", "每次最多 10 页", "真实技术诊断", "任务审批与报告"], "免费开始", "open"],
      ["Growth", "申请开通", "适合持续增长团队", ["更多项目与抓取容量", "外部数据连接", "Agent 协作流程", "团队成员与 Credits"], "申请方案", "featured"],
      ["Business", "定制", "适合多项目与服务团队", ["更高容量与席位", "API 与 MCP", "专属治理策略", "上线与运营支持"], "联系团队", ""],
    ],
    securityEyebrow: "默认可控", securityTitle: "增长速度不以牺牲安全为代价",
    securityItems: ["组织与项目严格隔离", "角色权限与操作审计", "外部请求安全边界", "发布前人工审批", "Credits 预留与结算记录", "数据备份与可回滚发布"],
    faqTitle: "常见问题", faqs: [
      ["现在可以直接使用吗？", "可以。注册后可创建项目并运行公开网站诊断。部分外部数据与自动执行能力需要授权或等待逐步开放。"],
      ["会自动修改或发布我的网站吗？", "不会。高风险操作默认需要人工审批；未连接 CMS 或发布平台时，系统只会生成任务和候选内容。"],
      ["免费试用会自动扣费吗？", "不会。当前在线支付尚未启用，也不会模拟支付成功。正式结算开放前会明确展示价格和政策。"],
      ["OneShowSEO 与单点 SEO 工具有何不同？", "OneShowSEO 把诊断、研究、任务、内容、审批、报告和后续复查放在同一个项目上下文中。"],
    ],
    finalEyebrow: "从第一个真实问题开始", finalTitle: "让你的 SEO 工作形成可持续的增长循环",
    finalBody: "添加一个公开网站，几分钟内获得第一份带证据的诊断结果。",
    footer: "AI 驱动、人工可控的 SEO 增长平台。", rights: "© 2026 OneShowSEO. 保留所有权利。",
  },
  en: {
    announcement: "OneShowSEO public trial is now open", announcementLink: "Try it now",
    nav: ["Product", "Solutions", "Workflow", "Integrations", "Pricing"], login: "Log in", start: "Start free",
    eyebrow: "AI SEO GROWTH SYSTEM", title: <>Make every great website<br/>visible to the right people</>,
    hero: "From site audits and opportunity research to content tasks, human approvals, and follow-up checks, OneShowSEO turns complex SEO work into a clear, trusted growth loop.",
    primary: "Create a growth project", secondary: "See how it works", safety: "No credit card · Start with any public site · Human approval for high-risk actions",
    loop: "One controlled SEO growth loop for every kind of team", audiences: ["AI & SaaS", "Professional Services", "Consumer Brands", "Content Teams", "Global Commerce"],
    proofTitle: "Turn fragmented SEO work into a system that gets smarter every day",
    proofBody: "Stop switching between audit tools, spreadsheets, content docs, and task chats. Every issue has evidence, every recommendation has priority, and every run leaves a record.",
    principles: [
      ["Verified evidence", "Collect facts from public pages and authorized data instead of filling dashboards with invented metrics."],
      ["Human control", "AI discovers, organizes, and drafts. Your team decides what moves forward."],
      ["Continuous learning", "Every follow-up check returns to project history and improves the next priority list."],
    ],
    workflowEyebrow: "FROM DISCOVERY TO OUTCOME", workflowTitle: "One genuinely closed-loop SEO workflow",
    workflowBody: "Understand a site before deciding what to do. Your team always knows what the system is doing, why it matters, and what happens next.",
    workflow: [
      ["01", "Add a site", "Create a project and establish its market baseline."],
      ["02", "Audit & research", "Find technical issues, content gaps, and growth opportunities."],
      ["03", "Create tasks", "Turn evidence into prioritized, trackable actions."],
      ["04", "Approve & deliver", "Keep people in control before content or publishing work begins."],
      ["05", "Review & learn", "Compare changes and update the next execution order."],
    ],
    systemEyebrow: "ONE WORKSPACE, SPECIALIST CAPABILITIES", systemTitle: "Agents collaborate around the same project",
    systemBody: "Every Agent shares project context, permissions, Credits, tasks, evidence, and audit history. This is a governed growth system—not a row of disconnected chatbots.",
    agents: [
      ["SEO Audit Agent", "Checks crawlability, indexing, metadata, and page structure with verifiable findings.", "Available"],
      ["Research Agent", "Finds keyword, competitor-content, and topic opportunities from public pages.", "Public data"],
      ["Content Agent", "Turns approved opportunities into candidates, briefs, and editable drafts.", "Governed"],
      ["Publish Agent", "Creates approval-first publishing tasks; external delivery requires a connected platform.", "Connection required"],
    ],
    capabilitiesEyebrow: "COMPLETE, NOT UNCONTROLLED", capabilitiesTitle: "The boundaries commercial teams need",
    capabilities: [
      ["Technical SEO", "Real crawls and evidence", "Check status codes, titles, descriptions, canonicals, headings, image alt text, and more."],
      ["Opportunity research", "Turn facts into direction", "Convert sites, topics, and public competitor pages into ranked opportunities."],
      ["Tasks & approvals", "A traceable next step", "Manage recommendations, risk, owners, and status with approval by default."],
      ["Content production", "Opportunity to candidate", "Use keywords, evidence, and project context to produce editable content tasks."],
      ["Reports & assets", "Results you can take away", "Retain audit reports, content assets, and execution evidence with controlled downloads."],
      ["API & MCP", "Bring the platform into your stack", "Use scoped keys, limits, entitlements, and audit logs in internal workflows."],
    ],
    integrationsEyebrow: "CONNECT THE DATA YOU ALREADY USE", integrationsTitle: "Authorized data makes recommendations closer to business outcomes",
    integrationsBody: "Audit public websites without authorization. Connect Search Console, Analytics, or a CMS when you need impressions, clicks, content performance, and publishing status.",
    connected: "Integration framework ready", authorization: "Enabled after customer authorization", noSecrets: "Credentials stay encrypted and never appear in browsers or reports",
    commercialEyebrow: "FROM TRIAL TO TEAM", commercialTitle: "Prove value first, then choose the right capacity",
    commercialBody: "The public trial is open and online billing is not. Run a real site audit first, then request more project capacity when your team is ready.",
    plans: [
      ["Trial", "Free trial", "Validate your first site", ["1 project", "Up to 10 pages per audit", "Verified technical audit", "Tasks, approvals, and reports"], "Start free", "open"],
      ["Growth", "Request access", "For continuous-growth teams", ["More projects and crawl capacity", "External data connections", "Multi-Agent workflows", "Team seats and Credits"], "Request a plan", "featured"],
      ["Business", "Custom", "For multi-project organizations", ["Higher capacity and seats", "API and MCP", "Custom governance", "Launch and operations support"], "Contact us", ""],
    ],
    securityEyebrow: "CONTROL BY DEFAULT", securityTitle: "Growth speed should not compromise safety",
    securityItems: ["Strict tenant and project isolation", "Role permissions and audit trails", "Safe outbound request boundaries", "Human approval before publishing", "Credit reservation and settlement", "Backups and reversible releases"],
    faqTitle: "Frequently asked questions", faqs: [
      ["Can I use OneShowSEO today?", "Yes. Create a project and run a public-site audit. Some external-data and automation capabilities require authorization or phased access."],
      ["Will it change or publish to my website automatically?", "No. High-risk actions require human approval. Without a connected CMS, the system creates tasks and content candidates only."],
      ["Will the free trial charge me automatically?", "No. Online billing is not enabled and the product never simulates payment success. Pricing and policy will be explicit before launch."],
      ["How is this different from a point SEO tool?", "OneShowSEO keeps audits, research, tasks, content, approvals, reports, and follow-up checks in one shared project context."],
    ],
    finalEyebrow: "START WITH ONE VERIFIED ISSUE", finalTitle: "Turn your SEO work into a repeatable growth loop",
    finalBody: "Add a public website and get your first evidence-backed audit in minutes.",
    footer: "AI-driven, human-controlled SEO growth.", rights: "© 2026 OneShowSEO. All rights reserved.",
  },
} as const;

const navTargets = ["product", "solutions", "workflow", "integrations", "pricing"];
const principleIcons: Icon[] = [MagnifyingGlass, UsersThree, TrendUp];
const agentIcons: Icon[] = [ShieldCheck, Brain, FileText, PaperPlaneTilt];
const capabilityIcons: Icon[] = [Pulse, Target, ClipboardText, Sparkle, Database, Code];
const integrationLogos = [
  ["Google", "/integrations/google.svg"], ["Google Analytics", "/integrations/googleanalytics.svg"],
  ["WordPress", "/integrations/wordpress.svg"], ["Webflow", "/integrations/webflow.svg"],
  ["Semrush", "/integrations/semrush.svg"], ["Notion", "/integrations/notion.svg"],
] as const;

export default function MarketingPage() {
  const { isEnglish, locale, setLocale } = useLanguage();
  const [menuOpen, setMenuOpen] = useState(false);
  const c = isEnglish ? copy.en : copy.zh;
  return <main className="growth-home" data-no-translate>
    <div className="growth-announcement"><span>{c.announcement}</span><Link href="/register">{c.announcementLink}<ArrowRight/></Link></div>
    <header className="growth-nav">
      <Link className="growth-brand" href="/" aria-label="OneShowSEO home"><Image src="/brand/oneshowseo.png" alt="OneShowSEO" width={178} height={45} priority unoptimized/></Link>
      <nav aria-label="Primary navigation">{c.nav.map((label,index)=><a key={label} href={`#${navTargets[index]}`} onClick={()=>setMenuOpen(false)}>{label}</a>)}</nav>
      <div className="growth-nav-actions">
        <button className="growth-locale" onClick={()=>setLocale(locale==="zh-CN"?"en-US":"zh-CN")}><Globe/>{isEnglish?"中文":"EN"}</button>
        <Link className="growth-login" href="/login">{c.login}</Link><Link className="growth-button small" href="/register">{c.start}</Link>
        <button className="growth-menu" aria-label={menuOpen?"Close menu":"Open menu"} aria-expanded={menuOpen} onClick={()=>setMenuOpen(!menuOpen)}>{menuOpen?<X/>:<List/>}</button>
      </div>
      {menuOpen&&<div className="growth-mobile-nav">{c.nav.map((label,index)=><a key={label} href={`#${navTargets[index]}`} onClick={()=>setMenuOpen(false)}>{label}</a>)}<Link href="/login">{c.login}</Link><Link href="/register">{c.start}</Link></div>}
    </header>

    <section className="growth-hero" id="product">
      <Image className="growth-spectrum" src="/marketing/oneshowseo-data-spectrum.png" alt="" fill priority sizes="100vw"/>
      <div className="growth-hero-copy">
        <span className="growth-kicker"><i/><Robot weight="fill"/>{c.eyebrow}</span>
        <h1>{c.title}</h1><p>{c.hero}</p>
        <div className="growth-hero-actions"><Link className="growth-button" href="/register">{c.primary}<ArrowRight/></Link><a className="growth-button secondary" href="#workflow"><PlayCircle/>{c.secondary}</a></div>
        <small><ShieldCheck weight="fill"/>{c.safety}</small>
      </div>
      <div className="growth-audiences"><p>{c.loop}</p><div>{c.audiences.map(name=><span key={name}>{name}</span>)}</div></div>
    </section>

    <section className="growth-intro" id="solutions">
      <header><span>OneShowSEO OS</span><h2>{c.proofTitle}</h2><p>{c.proofBody}</p></header>
      <div className="growth-principles">{c.principles.map(([title,body],index)=>{const Icon=principleIcons[index];return <article key={title}><span><Icon weight="duotone"/></span><div><b>0{index+1}</b><h3>{title}</h3><p>{body}</p></div></article>})}</div>
    </section>

    <section className="growth-workflow" id="workflow">
      <header className="growth-section-head"><span>{c.workflowEyebrow}</span><h2>{c.workflowTitle}</h2><p>{c.workflowBody}</p></header>
      <div className="growth-workflow-track">{c.workflow.map(([number,title,body],index)=><article key={number}><div><b>{number}</b>{index<c.workflow.length-1&&<ArrowRight/>}</div><h3>{title}</h3><p>{body}</p></article>)}</div>
      <Link className="growth-text-link" href="/register">{c.primary}<ArrowRight/></Link>
    </section>

    <section className="growth-agent-system">
      <div className="growth-agent-copy"><span>{c.systemEyebrow}</span><h2>{c.systemTitle}</h2><p>{c.systemBody}</p><ul><li><Check/>Organization & project context</li><li><Check/>Permissions, Credits & audit trail</li><li><Check/>Evidence-backed handoffs</li></ul><Link className="growth-button" href="/register">{c.primary}<ArrowRight/></Link></div>
      <div className="growth-agent-grid">{c.agents.map(([title,body,status],index)=>{const Icon=agentIcons[index];return <article key={title}><header><span><Icon weight="duotone"/></span><em>{status}</em></header><h3>{title}</h3><p>{body}</p><footer><i/><small>OneShowSEO Agent</small><ArrowRight/></footer></article>})}</div>
    </section>

    <section className="growth-capabilities">
      <header className="growth-section-head"><span>{c.capabilitiesEyebrow}</span><h2>{c.capabilitiesTitle}</h2></header>
      <div>{c.capabilities.map(([title,label,body],index)=>{const Icon=capabilityIcons[index];return <article key={title}><span><Icon weight="duotone"/></span><small>{label}</small><h3>{title}</h3><p>{body}</p><a href="#workflow" aria-label={`${title} workflow`}><ArrowRight/></a></article>})}</div>
    </section>

    <section className="growth-integrations" id="integrations">
      <div className="growth-integration-copy"><span>{c.integrationsEyebrow}</span><h2>{c.integrationsTitle}</h2><p>{c.integrationsBody}</p><div><span><CheckCircle weight="fill"/>{c.connected}</span><span><LockKey weight="fill"/>{c.authorization}</span><span><ShieldCheck weight="fill"/>{c.noSecrets}</span></div></div>
      <div className="growth-logo-grid">{integrationLogos.map(([name,src])=><article key={name}><Image src={src} alt="" width={34} height={34}/><strong>{name}</strong><small>{c.authorization}</small></article>)}</div>
    </section>

    <section className="growth-commercial" id="pricing">
      <header className="growth-section-head"><span>{c.commercialEyebrow}</span><h2>{c.commercialTitle}</h2><p>{c.commercialBody}</p></header>
      <div className="growth-plans">{c.plans.map(([name,price,audience,items,cta,tone])=><article className={tone} key={name}><header><span>{name}</span>{tone==="featured"&&<em>{isEnglish?"Recommended":"推荐"}</em>}</header><h3>{price}</h3><p>{audience}</p><ul>{items.map(item=><li key={item}><Check/>{item}</li>)}</ul><Link href={name==="Trial"?"/register":"mailto:1797358496@qq.com"}>{cta}<ArrowRight/></Link></article>)}</div>
      <Link className="growth-text-link" href="/pricing">{isEnglish?"Compare all plan boundaries":"查看完整套餐边界"}<ArrowRight/></Link>
    </section>

    <section className="growth-security">
      <div><span>{c.securityEyebrow}</span><h2>{c.securityTitle}</h2></div>
      <ul>{c.securityItems.map(item=><li key={item}><ShieldCheck weight="duotone"/>{item}</li>)}</ul>
    </section>

    <section className="growth-faq" id="faq"><header><span>FAQ</span><h2>{c.faqTitle}</h2></header><div>{c.faqs.map(([question,answer],index)=><details key={question} open={index===0}><summary>{question}<CaretDown/></summary><p>{answer}</p></details>)}</div></section>

    <section className="growth-final"><span>{c.finalEyebrow}</span><h2>{c.finalTitle}</h2><p>{c.finalBody}</p><div><Link className="growth-button inverse" href="/register">{c.primary}<ArrowRight/></Link><Link className="growth-button ghost" href="/login">{c.login}</Link></div></section>

    <footer className="growth-footer"><div><Image src="/brand/oneshowseo.png" alt="OneShowSEO" width={174} height={44} unoptimized/><p>{c.footer}</p></div><nav><a href="#product">{c.nav[0]}</a><a href="#workflow">{c.nav[2]}</a><Link href="/pricing">{c.nav[4]}</Link><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></nav><small>{c.rights}</small></footer>
  </main>;
}
