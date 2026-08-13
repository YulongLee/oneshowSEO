"use client";

import { useEffect, useState } from "react";
import {
  ArrowRight,
  Bell,
  CalendarBlank,
  CaretDown,
  CheckCircle,
  ClockCountdown,
  Coins,
  CreditCard,
  Database,
  DownloadSimple,
  FileText,
  Folder,
  Gauge,
  LockKey,
  PlugsConnected,
  Robot,
  ShieldCheck,
  Sparkle,
  TrendUp,
  UsersThree,
  WarningCircle,
} from "@phosphor-icons/react";

type Plan = {
  id: string;
  name: string;
  currency: string;
  monthlyPriceCents: number;
  projectLimit: number;
  monthlyPageLimit: number;
  aiCreditLimit: number;
  contentLimit: number | null;
  teamSeatLimit: number;
  agents: number;
  scheduledTasks: string;
  retentionDays: number;
  apiAccess: boolean;
};
type Invoice = {
  id: string;
  invoiceNumber: string;
  periodStart: number;
  periodEnd: number;
  amountCents: number;
  currency: string;
  status: string;
  downloadUrl?: string | null;
  createdAt: number;
};
type PaymentMethod = {
  id: string;
  provider: string;
  brand: string;
  last4: string;
  expiryMonth: number;
  expiryYear: number;
  isDefault: number;
  createdAt: number;
};
type BillingEvent = {
  id: string;
  eventType: string;
  description: string;
  createdAt: number;
};
type CreditLedgerEntry = {
  id: string;
  entryType: "reservation" | "commit" | "release" | "grant" | "expiry" | "refund" | "adjustment";
  amount: number;
  taskId: string | null;
  priceVersion: string;
  createdAt: number;
};
type BillingData = {
  user: {
    name: string;
    email: string;
    plan: string;
    trialEndsAt: number | null;
  };
  plan: Plan;
  plans: Plan[];
  providerConfigured: boolean;
  payment: {
    enabled: boolean;
    configured: boolean;
    reason: string | null;
  };
  catalog: {
    version: string;
    priceVersion: string;
    currency: string;
    capturedAt: number;
  };
  subscription: {
    state: string;
    access: "active" | "grace" | "restricted" | "suspended";
    version: number;
    validUntil: number | null;
    scheduledPlanKey: string | null;
    scheduledChangeAt: number | null;
  };
  period: {
    start: number;
    end: number;
    spendCents: number;
    renewalAt: number | null;
    autoRenew: boolean;
  };
  usage: {
    pagesCrawled: number;
    aiCredits: number;
    contentGenerated: number;
    projects: number;
    teamMembers: number;
    pendingInvites: number;
    pending: {
      pagesCrawled: number;
      aiCredits: number;
      contentGenerated: number;
    };
    alerts: Array<{key:string;label:string;used:number;pending:number;limit:number;percent:number;level:"warning"|"critical"}>;
    capturedAt: number;
    state: "final" | "pending";
  };
  credits: {
    granted: number;
    committed: number;
    reserved: number;
    available: number;
    capturedAt: number;
    state: "final" | "pending";
    limit: number;
    priceVersion: string;
    recent: CreditLedgerEntry[];
  };
  invoices: Invoice[];
  paymentMethods: PaymentMethod[];
  history: BillingEvent[];
};

const tabs = [
  "概览",
  "套餐与订阅",
  "用量与限制",
  "发票",
  "支付方式",
  "计费历史",
];
const money = (cents: number, currency = "USD") =>
  new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(cents / 100);
const date = (value: number | null) =>
  value
    ? new Date(value * 1000).toLocaleDateString("zh-CN", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "—";
const pct = (value: number, limit: number) =>
  limit ? Math.min(100, Math.round((value / limit) * 100)) : 0;

export default function BillingCenter({
  navigate,
}: {
  navigate: (value: string) => void;
}) {
  const [data, setData] = useState<BillingData | null>(null),
    [tab, setTab] = useState("概览"),
    [error, setError] = useState(""),
    [renderedAt] = useState(() => Date.now());
  useEffect(() => {
    let alive = true;
    fetch("/api/billing", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "计费数据读取失败");
        if (alive) setData(body);
      })
      .catch((reason) => alive && setError(reason.message));
    return () => {
      alive = false;
    };
  }, []);
  if (error)
    return (
      <section className="billing-load-error">
        <WarningCircle />
        <h1>计费数据暂时不可用</h1>
        <p>{error}</p>
      </section>
    );
  if (!data)
    return (
      <section className="billing-loading">
        <Sparkle className="spin" />
        正在读取计费数据…
      </section>
    );
  const trialDays = data.user.trialEndsAt
    ? Math.max(
        0,
        Math.ceil((data.user.trialEndsAt * 1000 - renderedAt) / 86400000),
      )
    : 0;
  return (
    <div className="billing-page">
      <header className="billing-header">
        <div>
          <h1>Billing</h1>
          <p>管理订阅、用量和支付信息。</p>
        </div>
        <aside>
          <details>
            <summary>
              快捷操作 <CaretDown />
            </summary>
            <div>
              <button onClick={() => navigate("套餐升级")}>更改套餐</button>
              <button onClick={() => setTab("发票")}>查看发票</button>
              <button onClick={() => setTab("支付方式")}>支付方式</button>
            </div>
          </details>
          <button aria-label="通知">
            <Bell />
          </button>
          <span>{data.user.name.trim().slice(0, 1).toUpperCase()}</span>
        </aside>
      </header>
      <nav className="billing-tabs">
        {tabs.map((item) => (
          <button
            key={item}
            className={tab === item ? "active" : ""}
            onClick={() => setTab(item)}
          >
            {item}
          </button>
        ))}
      </nav>
      {tab === "概览" && (
        <BillingOverview
          data={data}
          trialDays={trialDays}
          navigate={navigate}
          setTab={setTab}
        />
      )}
      {tab === "套餐与订阅" && (
        <PlanSubscription
          data={data}
          trialDays={trialDays}
          navigate={navigate}
        />
      )}
      {tab === "用量与限制" && <UsageLimits data={data} />}
      {tab === "发票" && <Invoices data={data} />}
      {tab === "支付方式" && <PaymentMethods data={data} />}
      {tab === "计费历史" && <BillingHistory data={data} />}
    </div>
  );
}

function BillingOverview({
  data,
  trialDays,
  navigate,
  setTab,
}: {
  data: BillingData;
  trialDays: number;
  navigate: (value: string) => void;
  setTab: (value: string) => void;
}) {
  const plan = data.plan,
    u = data.usage,
    periodUsage = money(data.period.spendCents, plan.currency),
    price = money(plan.monthlyPriceCents, plan.currency);
  const meters = [
    {
      label: "已抓取页面",
      value: u.pagesCrawled,
      limit: plan.monthlyPageLimit,
      format: (n: number) => n.toLocaleString("zh-CN"),
    },
    {
      label: "AI Credits",
      value: u.aiCredits,
      limit: plan.aiCreditLimit,
      format: (n: number) => n.toLocaleString("zh-CN"),
    },
    {
      label: "内容生成",
      value: u.contentGenerated,
      limit: plan.contentLimit,
      format: (n: number) => n.toLocaleString("zh-CN"),
    },
    {
      label: "团队成员",
      value: u.teamMembers,
      limit: plan.teamSeatLimit,
      format: (n: number) => n.toLocaleString("zh-CN"),
    },
    {
      label: "项目",
      value: u.projects,
      limit: plan.projectLimit,
      format: (n: number) => n.toLocaleString("zh-CN"),
    },
  ];
  return (
    <div className="billing-layout">
      <main>
        <section className="panel billing-current-plan">
          <header>
            <h2>当前套餐</h2>
            {data.plan.id === "trial" && <em>{`试用期还剩 ${trialDays} 天`}</em>}
          </header>
          <div className="billing-plan-main">
            <span>
              <Sparkle weight="duotone" />
            </span>
            <div>
              <h3>{plan.name} Plan</h3>
              <p>
                {data.plan.id === "trial"
                  ? "用于验证完整 SEO 工作流的安全试用套餐。"
                  : "适合持续增长团队的 SEO 自动化套餐。"}
              </p>
              <strong>
                {price}
                <small>/月</small>
              </strong>
              <small>
                {data.plan.id === "trial"
                  ? "试用期内不会自动扣款"
                  : "按月计费"}
              </small>
            </div>
            <aside>
              <button className="primary" onClick={() => navigate("套餐升级")}>
                升级套餐
              </button>
              <button onClick={() => navigate("套餐升级")}>对比套餐</button>
            </aside>
          </div>
          <div className="billing-plan-features">
            {[
              [Folder, "项目", plan.projectLimit],
              [
                Gauge,
                "每月抓取",
                plan.monthlyPageLimit.toLocaleString("zh-CN"),
              ],
              [
                Coins,
                "AI Credits / 月",
                plan.aiCreditLimit.toLocaleString("zh-CN"),
              ],
              [UsersThree, "团队席位", plan.teamSeatLimit],
              [Robot, "AI Agents", plan.agents],
              [ClockCountdown, "定时任务", plan.scheduledTasks],
              [Database, "数据保留", `${plan.retentionDays} 天`],
              [
                PlugsConnected,
                "API 访问",
                plan.apiAccess ? "已包含" : "未包含",
              ],
            ].map(([Icon, label, value]) => (
              <article key={label as string}>
                <Icon />
                <span>
                  <small>{label as string}</small>
                  <strong>{String(value)}</strong>
                </span>
              </article>
            ))}
          </div>
        </section>
        <section className="panel billing-usage-overview">
          <header>
            <h2>用量概览</h2>
            <button onClick={() => setTab("用量与限制")}>
              查看完整分析 <ArrowRight />
            </button>
          </header>
          <div>
            {meters.map((item) => (
              <UsageMeter key={item.label} {...item} />
            ))}
          </div>
        </section>
        <InvoicePanel
          invoices={data.invoices.slice(0, 5)}
          onAll={() => setTab("发票")}
        />
      </main>
      <aside className="billing-side">
        <section className="panel billing-period">
          <header>
            <div>
              <h2>当前计费周期</h2>
              <p>
                {date(data.period.start)} – {date(data.period.end)}
              </p>
            </div>
            <button onClick={() => setTab("计费历史")}>查看详情</button>
          </header>
          <strong data-no-translate>{periodUsage}</strong>
          <small>本周期实付</small>
          <div className="billing-provider-state">
            <ShieldCheck />
            {data.providerConfigured ? "支付渠道已连接" : "在线结算尚未启用"}
          </div>
          <label>
            <span>套餐价格</span>
            <b data-no-translate>{price}</b>
          </label>
          <i>
            <em
              style={{
                width: `${plan.monthlyPriceCents ? pct(data.period.spendCents, plan.monthlyPriceCents) : 0}%`,
              }}
            />
          </i>
          <footer>
            <span>续订日期：{date(data.period.renewalAt)}</span>
            <em>{data.period.autoRenew ? "自动续订" : "不会自动续订"}</em>
          </footer>
        </section>
        <section className="panel billing-credit-card">
          <h2>Credits 余额</h2>
          <p>
            {plan.aiCreditLimit.toLocaleString("zh-CN")} credits / 月 · {data.credits.state === "pending" ? "含预占" : "已结算"}
          </p>
          <strong>
            {data.credits.available.toLocaleString("zh-CN")} <small>可用</small>
            <em>{pct(data.credits.committed, plan.aiCreditLimit)}% 已用</em>
          </strong>
          <i>
            <em style={{ width: `${pct(data.credits.committed + data.credits.reserved, plan.aiCreditLimit)}%` }} />
          </i>
          <dl>
            <div>
              <dt>已结算</dt>
              <dd>{data.credits.committed.toLocaleString("zh-CN")}</dd>
            </div>
            <div>
              <dt>任务预占</dt>
              <dd>{data.credits.reserved.toLocaleString("zh-CN")}</dd>
            </div>
            <div>
              <dt>本期发放</dt>
              <dd>{data.credits.granted.toLocaleString("zh-CN")}</dd>
            </div>
          </dl>
          <button onClick={() => setTab("用量与限制")}>
            查看用量分析 <ArrowRight />
          </button>
        </section>
        <BillingQuickActions navigate={navigate} setTab={setTab} />
        <section className="panel billing-support">
          <h2>需要帮助？</h2>
          <p>如果你对套餐或计费有疑问，可以联系支持团队。</p>
          <a href="mailto:1797358496@qq.com?subject=OneShowSEO 计费支持">
            联系支持
          </a>
        </section>
      </aside>
    </div>
  );
}

function UsageMeter({
  label,
  value,
  limit,
  format,
}: {
  label: string;
  value: number;
  limit: number | null;
  format: (n: number) => string;
}) {
  const percent = limit === null ? null : pct(value, limit);
  return (
    <article className="billing-meter">
      <strong>{label}</strong>
      <p>
        {format(value)} / {limit === null ? "不限" : format(limit)}
      </p>
      {percent === null ? (
        <>
          <i className="unlimited">
            <em />
          </i>
          <small>不限</small>
        </>
      ) : (
        <>
          <i>
            <em style={{ width: `${percent}%` }} />
          </i>
          <small>{percent}%</small>
        </>
      )}
    </article>
  );
}

function InvoicePanel({
  invoices,
  onAll,
}: {
  invoices: Invoice[];
  onAll: () => void;
}) {
  return (
    <section className="panel billing-invoices">
      <header>
        <h2>最近发票</h2>
        {invoices.length > 0 && (
          <button onClick={onAll}>
            查看全部 <ArrowRight />
          </button>
        )}
      </header>
      {invoices.length ? (
        <div className="billing-invoice-table">
          <div className="head">
            <span>发票</span>
            <span>日期</span>
            <span>金额</span>
            <span>状态</span>
            <span>下载</span>
          </div>
          {invoices.map((invoice) => (
            <article key={invoice.id}>
              <strong>{invoice.invoiceNumber}</strong>
              <span>{date(invoice.createdAt)}</span>
              <span>{money(invoice.amountCents, invoice.currency)}</span>
              <em className={invoice.status}>
                {invoice.status === "paid" ? "已支付" : invoice.status}
              </em>
              {invoice.downloadUrl ? (
                <a href={invoice.downloadUrl} aria-label="下载发票">
                  <DownloadSimple />
                </a>
              ) : (
                <button disabled aria-label="没有可下载文件">
                  <DownloadSimple />
                </button>
              )}
            </article>
          ))}
        </div>
      ) : (
        <Empty
          icon={FileText}
          title="尚未产生发票"
          text="在线结算启用并完成首次付款后，发票会显示在这里。"
          action="查看套餐"
          onAction={onAll}
        />
      )}
    </section>
  );
}

function BillingQuickActions({
  navigate,
  setTab,
}: {
  navigate: (value: string) => void;
  setTab: (value: string) => void;
}) {
  return (
    <section className="panel billing-quick">
      <h2>快捷操作</h2>
      {[
        [
          Sparkle,
          "更改套餐",
          "选择适合业务规模的套餐",
          () => navigate("套餐升级"),
        ],
        [
          Coins,
          "购买 Credits",
          "支付渠道启用后开放",
          () => navigate("套餐升级"),
        ],
        [DownloadSimple, "下载发票", "查看全部可用账单", () => setTab("发票")],
        [
          CreditCard,
          "更新支付方式",
          "管理安全支付方式",
          () => setTab("支付方式"),
        ],
        [LockKey, "取消订阅", "查看当前订阅状态", () => setTab("套餐与订阅")],
      ].map(([Icon, title, subtitle, action]) => (
        <button key={title as string} onClick={action as () => void}>
          <span>
            <Icon />
          </span>
          <div>
            <strong>{title as string}</strong>
            <small>{subtitle as string}</small>
          </div>
          <ArrowRight />
        </button>
      ))}
    </section>
  );
}

function PlanSubscription({
  data,
  trialDays,
  navigate,
}: {
  data: BillingData;
  trialDays: number;
  navigate: (value: string) => void;
}) {
  return (
    <div className="billing-section-page">
      <header>
        <h2>套餐与订阅</h2>
        <p>查看当前订阅，并根据项目规模调整容量。</p>
      </header>
      <section className="panel billing-subscription-summary">
        <div>
          <span>
            <Sparkle />
          </span>
          <div>
            <small>当前套餐</small>
            <h3>{data.plan.name} Plan</h3>
            <p>
              {data.plan.id === "trial"
                ? `试用期还剩 ${trialDays} 天，结束后不会自动扣款。`
                : `${money(data.plan.monthlyPriceCents, data.plan.currency)} / 月`}
            </p>
            {data.subscription.scheduledPlanKey && data.subscription.scheduledChangeAt && (
              <p>
                已安排在 {date(data.subscription.scheduledChangeAt)} 切换到 {data.plans.find((plan) => plan.id === data.subscription.scheduledPlanKey)?.name ?? data.subscription.scheduledPlanKey} 套餐。
              </p>
            )}
          </div>
        </div>
        <aside>
          <em>{data.providerConfigured ? "订阅可管理" : "在线结算未启用"}</em>
          <button onClick={() => navigate("套餐升级")}>更改套餐</button>
        </aside>
      </section>
      <div className="billing-plan-options">
        {data.plans.map((plan) => (
          <article
            className={`panel ${plan.id === data.plan.id ? "current" : ""}`}
            key={plan.id}
          >
            <header>
              <h3>{plan.name}</h3>
              {plan.id === data.plan.id && <em>当前套餐</em>}
            </header>
            <strong>
              {money(plan.monthlyPriceCents, plan.currency)}
              <small>/月</small>
            </strong>
            <ul>
              <li>
                <CheckCircle />
                {plan.projectLimit} 个项目
              </li>
              <li>
                <CheckCircle />
                {plan.aiCreditLimit.toLocaleString("zh-CN")} AI Credits
              </li>
              <li>
                <CheckCircle />
                {plan.teamSeatLimit} 个团队席位
              </li>
              <li>
                <CheckCircle />
                {plan.agents} 个 AI Agents
              </li>
            </ul>
            <button
              disabled={plan.id === data.plan.id}
              onClick={() => navigate("套餐升级")}
            >
              {plan.id === data.plan.id ? "已在使用" : "查看升级方案"}
            </button>
          </article>
        ))}
      </div>
      <section className="panel billing-safe-note">
        <ShieldCheck />
        <div>
          <strong>订阅变更受保护</strong>
          <p>
            当前版本不会直接扣款。套餐申请会进入人工确认流程，支付渠道接入后才会启用自动结算。
          </p>
        </div>
      </section>
    </div>
  );
}

function UsageLimits({ data }: { data: BillingData }) {
  const p = data.plan,
    u = data.usage;
  const items = [
    {
      label: "每月页面抓取",
      value: u.pagesCrawled,
      pending: u.pending.pagesCrawled,
      limit: p.monthlyPageLimit,
      icon: Gauge,
    },
    {
      label: "AI Credits",
      value: u.aiCredits,
      pending: u.pending.aiCredits,
      limit: p.aiCreditLimit,
      icon: Coins,
    },
    {
      label: "内容生成",
      value: u.contentGenerated,
      pending: u.pending.contentGenerated,
      limit: p.contentLimit,
      icon: FileText,
    },
    { label: "项目", value: u.projects, pending: 0, limit: p.projectLimit, icon: Folder },
    {
      label: "团队席位",
      value: u.teamMembers + u.pendingInvites,
      pending: u.pendingInvites,
      limit: p.teamSeatLimit,
      icon: UsersThree,
    },
  ];
  return (
    <div className="billing-section-page">
      <header>
        <h2>用量与限制</h2>
        <p>所有数据均来自当前计费周期的真实使用记录。</p>
      </header>
      {u.alerts.length > 0 && <section className={`panel billing-usage-alert ${u.alerts.some(alert=>alert.level==="critical")?"critical":"warning"}`}><WarningCircle/><div><strong>{u.alerts.some(alert=>alert.level==="critical")?"部分额度已达到上限":"部分额度即将用完"}</strong><p>{u.alerts.map(alert=>`${alert.label} ${alert.percent}%`).join(" · ")}。待结算用量已计入预警，但不会产生超额扣费。</p></div></section>}
      <div className="billing-limit-grid">
        {items.map(({ label, value, pending, limit, icon: Icon }) => (
          <article className="panel" key={label}>
            <span>
              <Icon />
            </span>
            <small>{label}</small>
            <strong>
              {value.toLocaleString("zh-CN")}{" "}
              <em>
                / {limit === null ? "不限" : limit.toLocaleString("zh-CN")}
              </em>
            </strong>
            <i>
              <em
                style={{
                  width: `${limit === null ? 100 : pct(value, limit)}%`,
                }}
              />
            </i>
            <p>
              {limit === null
                ? "当前套餐不限量"
                : `${Math.max(0, limit - value - pending).toLocaleString("zh-CN")} 剩余${pending?` · ${pending.toLocaleString("zh-CN")} 待结算`:""}`}
            </p>
          </article>
        ))}
      </div>
      <section className="panel billing-limit-policy">
        <h3>额度规则</h3>
        <div>
          <article>
            <ShieldCheck />
            <strong>不会产生超额扣费</strong>
            <p>达到套餐上限后，系统会暂停新的超额任务。</p>
          </article>
          <article>
            <CalendarBlank />
            <strong>按月重置</strong>
            <p>页面抓取和 AI Credits 在每个自然月开始时重新计算。</p>
          </article>
          <article>
            <TrendUp />
            <strong>升级即时扩容</strong>
            <p>套餐开通后新的容量限制立即生效。</p>
          </article>
        </div>
      </section>
      <section className="panel billing-history">
        <header>
          <div>
            <h3>Credits 明细</h3>
            <p>
              余额截至 {new Date(data.credits.capturedAt * 1000).toLocaleString("zh-CN")}，预占任务完成后才会正式扣减。
            </p>
          </div>
        </header>
        {data.credits.recent.length ? (
          data.credits.recent.map((item) => (
            <article key={item.id}>
              <span><Coins /></span>
              <div>
                <strong>{creditEntryLabel(item.entryType)}</strong>
                <small>{item.taskId ? `任务 ${item.taskId}` : item.priceVersion}</small>
              </div>
              <time>
                {item.amount > 0 ? "+" : ""}{item.amount.toLocaleString("zh-CN")} · {date(item.createdAt)}
              </time>
            </article>
          ))
        ) : (
          <Empty icon={Coins} title="暂无 Credits 变动" text="本期额度发放后会显示在这里。" />
        )}
      </section>
    </div>
  );
}

function creditEntryLabel(type: CreditLedgerEntry["entryType"]) {
  return {
    reservation: "任务预占",
    commit: "任务结算",
    release: "释放预占",
    grant: "套餐额度发放",
    expiry: "额度到期",
    refund: "额度退回",
    adjustment: "人工调整",
  }[type];
}

function Invoices({ data }: { data: BillingData }) {
  return (
    <div className="billing-section-page">
      <header>
        <div><h2>发票</h2><p>下载并核对所有真实结算记录。</p></div>
        {data.invoices.length>0&&<a href="/api/billing/invoices/export"><DownloadSimple/>导出 CSV</a>}
      </header>
      <InvoicePanel invoices={data.invoices} onAll={() => undefined} />
    </div>
  );
}

function PaymentMethods({ data }: { data: BillingData }) {
  return (
    <div className="billing-section-page">
      <header>
        <h2>支付方式</h2>
        <p>安全管理用于订阅结算的支付方式。</p>
      </header>
      <section className="panel billing-methods">
        {data.paymentMethods.length ? (
          data.paymentMethods.map((method) => (
            <article key={method.id}>
              <span>
                <CreditCard />
              </span>
              <div>
                <strong>
                  {method.brand} •••• {method.last4}
                </strong>
                <p>
                  有效期 {method.expiryMonth}/{method.expiryYear}
                </p>
              </div>
              {method.isDefault ? <em>默认</em> : null}
            </article>
          ))
        ) : (
          <Empty
            icon={CreditCard}
            title="尚未添加支付方式"
            text={
              data.providerConfigured
                ? "添加支付方式后才能开通付费套餐。"
                : "支付渠道尚未启用，因此暂时不能保存银行卡信息。"
            }
          />
        )}
      </section>
      <section className="panel billing-safe-note">
        <LockKey />
        <div>
          <strong>敏感支付信息不会存储在 OneShowSEO</strong>
          <p>支付渠道接入后，卡号等敏感信息将由合规支付服务商托管。</p>
        </div>
      </section>
    </div>
  );
}

function BillingHistory({ data }: { data: BillingData }) {
  return (
    <div className="billing-section-page">
      <header>
        <h2>计费历史</h2>
        <p>查看套餐、发票和支付方式的变更记录。</p>
      </header>
      <section className="panel billing-history">
        {data.history.length ? (
          data.history.map((item) => (
            <article key={item.id}>
              <span>
                <ClockCountdown />
              </span>
              <div>
                <strong>{item.description}</strong>
                <small>{item.eventType}</small>
              </div>
              <time>{date(item.createdAt)}</time>
            </article>
          ))
        ) : (
          <Empty
            icon={ClockCountdown}
            title="暂无计费活动"
            text="套餐变更、付款或发票生成后会留下可审计记录。"
          />
        )}
      </section>
    </div>
  );
}

function Empty({
  icon: Icon,
  title,
  text,
  action,
  onAction,
}: {
  icon: typeof FileText;
  title: string;
  text: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="billing-empty">
      <span>
        <Icon />
      </span>
      <strong>{title}</strong>
      <p>{text}</p>
      {action && onAction && <button onClick={onAction}>{action}</button>}
    </div>
  );
}
