"use client";

import { useEffect, useMemo, useState } from "react";

type StageStatus = "done" | "active" | "approval" | "waiting";

type WorkflowStage = {
  id: number;
  en: string;
  zh: string;
  description: string;
  output: string;
  skill: string;
  status: StageStatus;
};

const workflow: WorkflowStage[] = [
  {
    id: 1,
    en: "Website Audit",
    zh: "网站诊断",
    description: "抓取公开页面，检查索引、结构、性能、Schema 与内容质量。",
    output: "9 项问题 · 健康度 63",
    skill: "SEO Audit",
    status: "done",
  },
  {
    id: 2,
    en: "Keyword Research",
    zh: "关键词研究",
    description: "结合产品、搜索意图与第一方数据发现真实搜索需求。",
    output: "11 个关键词集群",
    skill: "Keyword Research",
    status: "done",
  },
  {
    id: 3,
    en: "Competitor Analysis",
    zh: "竞品分析",
    description: "识别搜索竞争者、内容覆盖、外链优势与可突破的空白。",
    output: "5 个主要竞品",
    skill: "Competitor Analysis",
    status: "done",
  },
  {
    id: 4,
    en: "Content Planning",
    zh: "内容规划",
    description: "把关键词映射到页面，形成主题集群、Brief 与发布优先级。",
    output: "4 份首月 Brief",
    skill: "Content Planner",
    status: "done",
  },
  {
    id: 5,
    en: "Content Production",
    zh: "内容生产",
    description: "根据已批准 Brief 生成产品页、指南和文章初稿。",
    output: "3 篇等待生成",
    skill: "AI Content Writer",
    status: "active",
  },
  {
    id: 6,
    en: "On-page SEO",
    zh: "页面优化",
    description: "生成标题、描述、结构、Schema、内链和页面修改建议。",
    output: "需要人工确认",
    skill: "SEO + CRO",
    status: "approval",
  },
  {
    id: 7,
    en: "Publish",
    zh: "发布",
    description: "通过 CMS 或开发交付发布已审核内容，保留变更记录与回滚点。",
    output: "发布连接未配置",
    skill: "CMS / Repository",
    status: "waiting",
  },
  {
    id: 8,
    en: "Index",
    zh: "收录",
    description: "检查 sitemap、URL 状态与搜索平台收录结果，提交待发现页面。",
    output: "GSC / 百度待连接",
    skill: "Search Console",
    status: "waiting",
  },
  {
    id: 9,
    en: "Monitor",
    zh: "监控",
    description: "持续观察索引、排名、点击、转化、CWV 与网站异常。",
    output: "等待基线数据",
    skill: "Monitoring",
    status: "waiting",
  },
  {
    id: 10,
    en: "Optimization",
    zh: "持续优化",
    description: "用真实表现判断刷新、扩写、合并或进入下一轮研究。",
    output: "下一轮自动回到诊断",
    skill: "SEO Operator",
    status: "waiting",
  },
];

const statusLabel: Record<StageStatus, string> = {
  done: "已完成",
  active: "进行中",
  approval: "待审批",
  waiting: "等待",
};

const actions = [
  {
    level: "P0",
    title: "为 /login 与 /app 添加 noindex",
    owner: "开发",
    stage: "页面优化",
  },
  {
    level: "P0",
    title: "生成 AI 面试助手产品页初稿",
    owner: "内容",
    stage: "内容生产",
  },
  {
    level: "P1",
    title: "连接 Search Console 与百度站长平台",
    owner: "运营",
    stage: "收录",
  },
];

export function SeoDashboard() {
  const [domain, setDomain] = useState("https://mianshiwen.cn/");
  const [selected, setSelected] = useState(5);
  const [running, setRunning] = useState(false);
  const [current, setCurrent] = useState(5);
  const [approval, setApproval] = useState(true);
  const [toast, setToast] = useState("");

  const selectedStage = workflow[selected - 1];

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      setCurrent((value) => {
        if (value >= 10) {
          window.clearInterval(timer);
          setRunning(false);
          showToast("本轮 SEO Workflow 已执行完成。");
          return 10;
        }
        setSelected(value + 1);
        return value + 1;
      });
    }, 650);
    return () => window.clearInterval(timer);
  }, [running]);

  const progress = useMemo(() => current * 10, [current]);

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2800);
  }

  function exportWorkflow() {
    const markdown = [
      "# 面试稳 SEO Workflow",
      "",
      ...workflow.map(
        (item) =>
          `${item.id}. ${item.en}（${item.zh}）— ${item.output}`,
      ),
      "",
      "## 本周行动",
      ...actions.map(
        (item) => `- [${item.level}] ${item.title}（${item.owner}）`,
      ),
    ].join("\n");
    const blob = new Blob([markdown], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "SEO-WORKFLOW.md";
    anchor.click();
    URL.revokeObjectURL(url);
    showToast("完整工作流已导出。");
  }

  return (
    <main className="seo-app">
      <aside className="rail">
        <div className="rail-brand">
          <span>O</span>
          <strong>OneSEO</strong>
        </div>
        <nav aria-label="产品导航">
          <a className="active" href="#workflow">
            <b>01</b> Workflow
          </a>
          <a href="#actions">
            <b>02</b> Action Center
          </a>
          <a href="#connections">
            <b>03</b> Data Sources
          </a>
        </nav>
        <div className="rail-note">
          <span>PROJECT</span>
          <strong>面试稳</strong>
          <small>mianshiwen.cn</small>
        </div>
      </aside>

      <section className="page">
        <header className="page-header">
          <div>
            <p>SEO OPERATING SYSTEM</p>
            <h1>从诊断到增长，形成完整闭环。</h1>
          </div>
          <div className="header-actions">
            <span className="site-state">
              <i />
              网站在线
            </span>
            <button className="button ghost" onClick={exportWorkflow}>
              导出流程
            </button>
          </div>
        </header>

        <section className="command">
          <div className="command-copy">
            <span>ONE INPUT · TEN STAGES</span>
            <h2>输入网站，Agent 接管完整 SEO Workflow。</h2>
            <p>
              从诊断和研究开始，经过内容生产、页面优化、发布与收录，最后用真实数据持续优化。
            </p>
          </div>
          <div className="command-form">
            <label htmlFor="target-domain">目标网站</label>
            <div>
              <input
                id="target-domain"
                value={domain}
                onChange={(event) => setDomain(event.target.value)}
              />
              <button
                className="button primary"
                disabled={running || !domain.trim()}
                onClick={() => {
                  setCurrent(1);
                  setSelected(1);
                  setRunning(true);
                }}
              >
                {running ? `正在执行 ${current}/10` : "执行完整工作流"}
              </button>
            </div>
            <small>上次执行：今天 17:30 · 预计 6–12 分钟</small>
          </div>
        </section>

        <section id="workflow" className="workflow-section">
          <div className="section-heading">
            <div>
              <span>01 / SEO WORKFLOW</span>
              <h2>10 阶段增长链路</h2>
            </div>
            <div className="progress-meta">
              <strong>{progress}%</strong>
              <span>本轮进度</span>
            </div>
          </div>

          <div className="workflow-layout">
            <div className="workflow-map">
              {workflow.map((item) => {
                const isSelected = selected === item.id;
                const effectiveStatus: StageStatus =
                  running && item.id === current
                    ? "active"
                    : item.id < current
                      ? "done"
                      : item.status;
                return (
                  <button
                    key={item.id}
                    className={`workflow-step ${isSelected ? "selected" : ""} status-${effectiveStatus}`}
                    onClick={() => setSelected(item.id)}
                  >
                    <span className="step-number">
                      {effectiveStatus === "done" ? "✓" : item.id}
                    </span>
                    <span className="step-copy">
                      <small>{item.en}</small>
                      <strong>{item.zh}</strong>
                    </span>
                    <span className="step-status">
                      {statusLabel[effectiveStatus]}
                    </span>
                  </button>
                );
              })}
              <div className="cycle-note">
                <span>↻</span>
                监控结果会自动进入下一轮诊断与优化
              </div>
            </div>

            <aside className="stage-detail">
              <div className="detail-top">
                <span>STAGE {String(selectedStage.id).padStart(2, "0")}</span>
                <b className={`detail-status status-${selectedStage.status}`}>
                  {statusLabel[selectedStage.status]}
                </b>
              </div>
              <h3>{selectedStage.en}</h3>
              <h4>{selectedStage.zh}</h4>
              <p>{selectedStage.description}</p>

              <dl>
                <div>
                  <dt>当前产出</dt>
                  <dd>{selectedStage.output}</dd>
                </div>
                <div>
                  <dt>执行能力</dt>
                  <dd>{selectedStage.skill}</dd>
                </div>
              </dl>

              {selectedStage.id >= 6 && (
                <label className="approval-control">
                  <input
                    type="checkbox"
                    checked={approval}
                    onChange={(event) => setApproval(event.target.checked)}
                  />
                  <span />
                  生产变更需人工批准
                </label>
              )}

              <button
                className="button detail-button"
                onClick={() =>
                  showToast(
                    selectedStage.status === "waiting"
                      ? `请先配置「${selectedStage.skill}」连接。`
                      : `已打开「${selectedStage.zh}」执行详情。`,
                  )
                }
              >
                {selectedStage.status === "waiting" ? "配置此阶段" : "查看执行详情"}
                <span>→</span>
              </button>
            </aside>
          </div>
        </section>

        <section id="actions" className="operations">
          <div className="action-center">
            <div className="section-heading compact">
              <div>
                <span>02 / ACTION CENTER</span>
                <h2>本周需要推进</h2>
              </div>
              <button onClick={() => showToast("已生成本周执行计划。")}>
                生成本周计划 →
              </button>
            </div>
            <div className="action-list">
              {actions.map((item, index) => (
                <article key={item.title}>
                  <span className="action-number">0{index + 1}</span>
                  <b>{item.level}</b>
                  <div>
                    <h3>{item.title}</h3>
                    <p>
                      {item.stage} · 负责人：{item.owner}
                    </p>
                  </div>
                  <button
                    aria-label={`处理 ${item.title}`}
                    onClick={() => showToast(`已打开任务：${item.title}`)}
                  >
                    →
                  </button>
                </article>
              ))}
            </div>
          </div>

          <aside id="connections" className="connections">
            <div className="section-heading compact">
              <div>
                <span>03 / CONNECTIONS</span>
                <h2>闭环依赖</h2>
              </div>
            </div>
            <div className="connection-list">
              <div>
                <i className="connected" />
                <span>
                  <strong>公开网站</strong>
                  <small>抓取与审计</small>
                </span>
                <b>已连接</b>
              </div>
              <div>
                <i className="connected" />
                <span>
                  <strong>OpenSEO</strong>
                  <small>关键词与竞品</small>
                </span>
                <b>已授权</b>
              </div>
              <div>
                <i className="pending" />
                <span>
                  <strong>GSC + 百度</strong>
                  <small>收录与排名</small>
                </span>
                <button onClick={() => showToast("数据源连接入口已准备。")}>
                  连接
                </button>
              </div>
              <div>
                <i className="pending" />
                <span>
                  <strong>CMS / Repository</strong>
                  <small>发布与回滚</small>
                </span>
                <button onClick={() => showToast("发布连接入口已准备。")}>
                  配置
                </button>
              </div>
            </div>
            <p className="trust-note">
              默认只读。页面修改、发布和提交收录均需要人工确认。
            </p>
          </aside>
        </section>
      </section>

      {toast && (
        <div className="toast" role="status">
          <span>✓</span>
          {toast}
        </div>
      )}
    </main>
  );
}
