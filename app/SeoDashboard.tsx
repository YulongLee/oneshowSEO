"use client";

import { useEffect, useMemo, useState } from "react";

const stages = [
  "网站分析",
  "SEO 审计",
  "关键词研究",
  "竞品分析",
  "内容规划",
];

const issues = [
  {
    priority: "高",
    title: "/login 与 /app 缺少 noindex",
    detail: "两个应用路由仍复用首页 SEO 内容，可能消耗抓取资源。",
    owner: "开发",
    effort: "约 20 分钟",
  },
  {
    priority: "高",
    title: "Sitemap 仅包含 1 个公开页面",
    detail: "当前只能覆盖首页意图，产品、价格和隐私页面尚未形成搜索入口。",
    owner: "产品 + 开发",
    effort: "约 2–3 天",
  },
  {
    priority: "中",
    title: "缺少 Open Graph 分享信息",
    detail: "链接分享到微信、Slack 和社交平台时无法形成完整预览。",
    owner: "设计 + 开发",
    effort: "约 1 小时",
  },
];

const keywords = [
  ["AI 面试助手", "商业 / 交易", "产品页", "P0"],
  ["AI 模拟面试", "商业 / 信息", "独立落地页", "P0"],
  ["简历 JD 面试准备", "信息 / 商业", "主题指南", "P0"],
  ["技术面试截图题", "信息", "使用指南", "P1"],
  ["STAR 法则面试回答", "信息", "内容文章", "P1"],
];

const content = [
  {
    type: "产品页",
    title: "AI 面试助手：实时语音、截图题与个性化回答思路",
    status: "Brief 已就绪",
  },
  {
    type: "主题指南",
    title: "如何用简历和 JD 准备一场更贴近真实岗位的面试",
    status: "等待写作",
  },
  {
    type: "使用指南",
    title: "技术面试截图题怎么拆解：先识别题型，再组织回答",
    status: "等待写作",
  },
];

export function SeoDashboard() {
  const [activeView, setActiveView] = useState<"issues" | "keywords" | "content">(
    "issues",
  );
  const [running, setRunning] = useState(false);
  const [stage, setStage] = useState(5);
  const [domain, setDomain] = useState("https://mianshiwen.cn/");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!running) return;
    setStage(0);
    const timer = window.setInterval(() => {
      setStage((current) => {
        if (current >= stages.length - 1) {
          window.clearInterval(timer);
          setRunning(false);
          setNotice("完整 SEO 任务已完成，结果已更新。");
          window.setTimeout(() => setNotice(""), 3200);
          return stages.length;
        }
        return current + 1;
      });
    }, 850);
    return () => window.clearInterval(timer);
  }, [running]);

  const progress = useMemo(() => {
    if (stage >= stages.length) return 100;
    return Math.max(8, ((stage + 1) / stages.length) * 100);
  }, [stage]);

  function exportPlan() {
    const text = [
      "# 面试稳 SEO 修复清单",
      "",
      ...issues.map(
        (item, index) =>
          `${index + 1}. [${item.priority}] ${item.title}\n   ${item.detail}\n   负责人：${item.owner}`,
      ),
    ].join("\n");
    const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "SEO-ACTION-PLAN.md";
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice("修复清单已导出，可直接交给开发。");
    window.setTimeout(() => setNotice(""), 3200);
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">O</span>
          <span>OneSEO</span>
        </div>

        <nav className="nav" aria-label="主导航">
          <a className="nav-item active" href="#overview">
            <span>01</span> 项目概览
          </a>
          <a className="nav-item" href="#workspace">
            <span>02</span> 网站分析
          </a>
          <a className="nav-item" href="#workspace">
            <span>03</span> 关键词
          </a>
          <a className="nav-item" href="#workspace">
            <span>04</span> 竞品
          </a>
          <a className="nav-item" href="#workspace">
            <span>05</span> 内容计划
          </a>
          <a className="nav-item" href="#workspace">
            <span>06</span> AI 写作
          </a>
        </nav>

        <div className="sidebar-footer">
          <div className="workspace-avatar">面</div>
          <div>
            <strong>面试稳</strong>
            <span>mianshiwen.cn</span>
          </div>
          <button aria-label="项目设置">•••</button>
        </div>
      </aside>

      <section className="main-area">
        <header className="topbar">
          <div>
            <p className="eyebrow">PROJECT OVERVIEW</p>
            <h1>面试稳 SEO 工作台</h1>
          </div>
          <div className="top-actions">
            <div className="live-pill">
              <span />
              线上站点正常
            </div>
            <button className="secondary-btn" onClick={exportPlan}>
              导出给开发
            </button>
          </div>
        </header>

        <div id="overview" className="run-panel">
          <div className="run-copy">
            <span className="section-index">01 / 执行任务</span>
            <h2>从一个网址开始，完成整套 SEO 工作。</h2>
            <p>
              自动分析网站、发现搜索机会、对比竞品，并把结果变成可执行的内容与修复计划。
            </p>
          </div>

          <div className="domain-form">
            <label htmlFor="domain">目标网站</label>
            <div className="domain-row">
              <input
                id="domain"
                value={domain}
                onChange={(event) => setDomain(event.target.value)}
                aria-label="目标网站地址"
              />
              <button
                className="primary-btn"
                disabled={running || !domain.trim()}
                onClick={() => {
                  setNotice("");
                  setRunning(true);
                }}
              >
                {running ? "Agent 执行中…" : "执行完整 SEO 任务"}
              </button>
            </div>
            <div className="run-meta">
              <span>上次完成：今天 17:30</span>
              <span>预计用时：2–4 分钟</span>
            </div>
          </div>

          <div className="stage-track" aria-label="任务执行进度">
            <div className="progress-line">
              <span style={{ width: `${progress}%` }} />
            </div>
            {stages.map((item, index) => {
              const complete = stage >= stages.length || index < stage;
              const current = running && index === stage;
              return (
                <div
                  key={item}
                  className={`stage ${complete ? "complete" : ""} ${current ? "current" : ""}`}
                >
                  <span>{complete ? "✓" : index + 1}</span>
                  <strong>{item}</strong>
                  <small>
                    {complete ? "已完成" : current ? "正在执行" : "等待"}
                  </small>
                </div>
              );
            })}
          </div>
        </div>

        <section className="summary-grid" aria-label="SEO 摘要">
          <div className="score-block">
            <span className="section-index">02 / 当前健康度</span>
            <div className="score-layout">
              <div className="score-ring">
                <strong>63</strong>
                <span>/ 100</span>
              </div>
              <div>
                <h2>基础已就绪，进入增长阶段</h2>
                <p>
                  技术基线明显改善。现在最值得投入的是独立公开页面、真实搜索数据和内容覆盖。
                </p>
                <div className="delta">↑ 较上次审计提升 31 分</div>
              </div>
            </div>
          </div>

          <div className="metric-list">
            <div>
              <span>待修复</span>
              <strong>09</strong>
              <small>6 个已确认</small>
            </div>
            <div>
              <span>关键词集群</span>
              <strong>11</strong>
              <small>5 个优先执行</small>
            </div>
            <div>
              <span>内容 Brief</span>
              <strong>04</strong>
              <small>首月计划已就绪</small>
            </div>
          </div>
        </section>

        <section id="workspace" className="workspace">
          <div className="workspace-heading">
            <div>
              <span className="section-index">03 / 执行中心</span>
              <h2>下一步该做什么</h2>
            </div>
            <div className="view-tabs" role="tablist" aria-label="执行中心视图">
              <button
                role="tab"
                aria-selected={activeView === "issues"}
                className={activeView === "issues" ? "active" : ""}
                onClick={() => setActiveView("issues")}
              >
                修复清单
              </button>
              <button
                role="tab"
                aria-selected={activeView === "keywords"}
                className={activeView === "keywords" ? "active" : ""}
                onClick={() => setActiveView("keywords")}
              >
                关键词机会
              </button>
              <button
                role="tab"
                aria-selected={activeView === "content"}
                className={activeView === "content" ? "active" : ""}
                onClick={() => setActiveView("content")}
              >
                内容计划
              </button>
            </div>
          </div>

          {activeView === "issues" && (
            <div className="issue-list">
              {issues.map((item, index) => (
                <article className="issue-row" key={item.title}>
                  <div className="row-number">0{index + 1}</div>
                  <span className={`priority priority-${item.priority}`}>
                    {item.priority}优先级
                  </span>
                  <div className="issue-copy">
                    <h3>{item.title}</h3>
                    <p>{item.detail}</p>
                    <div className="owner-line">
                      <span>负责人：{item.owner}</span>
                      <span>{item.effort}</span>
                    </div>
                  </div>
                  <button
                    className="row-action"
                    onClick={() => {
                      setNotice(`已打开「${item.title}」的修复说明。`);
                      window.setTimeout(() => setNotice(""), 3200);
                    }}
                  >
                    查看方案 →
                  </button>
                </article>
              ))}
            </div>
          )}

          {activeView === "keywords" && (
            <div className="data-table">
              <div className="table-row table-head">
                <span>关键词集群</span>
                <span>搜索意图</span>
                <span>目标页面</span>
                <span>优先级</span>
              </div>
              {keywords.map((item) => (
                <div className="table-row" key={item[0]}>
                  <strong>{item[0]}</strong>
                  <span>{item[1]}</span>
                  <span>{item[2]}</span>
                  <b>{item[3]}</b>
                </div>
              ))}
              <div className="data-warning">
                连接 OpenSEO 或 Search Console 后，将显示真实搜索量、难度与当前排名。
                <button onClick={() => setNotice("数据源连接入口已准备。")}>
                  连接数据源
                </button>
              </div>
            </div>
          )}

          {activeView === "content" && (
            <div className="content-list">
              {content.map((item, index) => (
                <article key={item.title}>
                  <span className="content-index">0{index + 1}</span>
                  <div>
                    <small>{item.type}</small>
                    <h3>{item.title}</h3>
                    <p>{item.status}</p>
                  </div>
                  <button
                    onClick={() => {
                      setNotice(`AI Writer 已准备处理「${item.title}」。`);
                      window.setTimeout(() => setNotice(""), 3200);
                    }}
                  >
                    交给 AI Writer →
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>

        <footer className="data-strip">
          <div>
            <span className="data-dot ready" />
            公开网站数据
            <strong>已连接</strong>
          </div>
          <div>
            <span className="data-dot ready" />
            OpenSEO
            <strong>已授权</strong>
          </div>
          <div>
            <span className="data-dot pending" />
            Search Console
            <strong>待连接</strong>
          </div>
          <div>
            <span className="data-dot pending" />
            GA4 / 百度统计
            <strong>待连接</strong>
          </div>
        </footer>
      </section>

      {notice && (
        <div className="toast" role="status">
          <span>✓</span>
          {notice}
        </div>
      )}
    </main>
  );
}
