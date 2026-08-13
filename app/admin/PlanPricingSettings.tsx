"use client";
import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle,
  CurrencyCny,
  FloppyDisk,
  Star,
} from "@phosphor-icons/react";

type Price = {
  planKey: "trial" | "starter" | "pro" | "business";
  monthlyPriceFen: number;
  currency: "CNY";
  available: boolean;
  featured: boolean;
  priceVersion: string;
  updatedAt: number;
};
const labels: Record<string, string> = {
  trial: "试用版",
  starter: "Starter",
  pro: "Pro",
  business: "Business",
};

export function PlanPricingSettings() {
  const [prices, setPrices] = useState<Price[]>([]),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const load = useCallback(async () => {
    const response = await fetch("/api/admin/plan-pricing", {
        cache: "no-store",
      }),
      body = await response.json();
    if (response.ok) setPrices(body.prices);
    else setMessage(body.error || "读取定价失败");
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);
  const update = (key: string, patch: Partial<Price>) =>
    setPrices((current) =>
      current.map((item) =>
        item.planKey === key ? { ...item, ...patch } : item,
      ),
    );
  const save = async () => {
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/admin/plan-pricing", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prices: prices
            .filter((item) => item.planKey !== "trial")
            .map(({ planKey, monthlyPriceFen, available, featured }) => ({
              planKey,
              monthlyPriceFen,
              available,
              featured,
            })),
        }),
      }),
      body = await response.json();
    setBusy(false);
    if (!response.ok) return setMessage(body.error || "保存失败");
    setMessage("套餐定价已发布，新的结算订单将使用新价格");
    await load();
  };
  return (
    <section className="admin-panel plan-pricing-admin">
      <div className="admin-panel-title">
        <div>
          <h2>产品定价</h2>
          <p>统一管理官网、工作台、支付宝和微信支付使用的人民币月度价格。</p>
        </div>
        <span>
          <CurrencyCny />
          人民币结算
        </span>
      </div>
      {message && (
        <div className="data-source-message">
          <CheckCircle />
          {message}
        </div>
      )}
      <div className="plan-pricing-grid">
        {prices.map((item) => (
          <article
            key={item.planKey}
            className={item.featured ? "featured" : ""}
          >
            <header>
              <div>
                <strong>{labels[item.planKey]}</strong>
                <small>
                  {item.planKey === "trial" ? "固定免费" : item.priceVersion}
                </small>
              </div>
              {item.featured && (
                <em>
                  <Star weight="fill" />
                  推荐
                </em>
              )}
            </header>
            <label>
              <span>月费（人民币元）</span>
              <div>
                <b>¥</b>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  disabled={item.planKey === "trial"}
                  value={(item.monthlyPriceFen / 100).toFixed(2)}
                  onChange={(event) =>
                    update(item.planKey, {
                      monthlyPriceFen: Math.round(
                        Number(event.target.value) * 100,
                      ),
                    })
                  }
                />
              </div>
            </label>
            <footer>
              <label>
                <input
                  type="checkbox"
                  disabled={item.planKey === "trial"}
                  checked={item.available}
                  onChange={(event) =>
                    update(item.planKey, { available: event.target.checked })
                  }
                />
                <span>允许新购</span>
              </label>
              <label>
                <input
                  type="radio"
                  name="featured-plan"
                  disabled={item.planKey === "trial"}
                  checked={item.featured}
                  onChange={() =>
                    setPrices((current) =>
                      current.map((plan) => ({
                        ...plan,
                        featured: plan.planKey === item.planKey,
                      })),
                    )
                  }
                />
                <span>设为推荐</span>
              </label>
            </footer>
          </article>
        ))}
      </div>
      <div className="plan-pricing-actions">
        <p>修改价格只影响新创建的订单；已创建订单保留原金额与价格版本。</p>
        <button onClick={() => void save()} disabled={busy || !prices.length}>
          <FloppyDisk />
          {busy ? "正在保存…" : "发布定价"}
        </button>
      </div>
    </section>
  );
}
