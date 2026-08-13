import { getDatabase } from "./auth";
import { ensureProductSchema } from "./product";
import {
  planCatalog,
  type PlanKey,
} from "../platform/modules/commerce/catalog";

export type ProductPrice = {
  planKey: PlanKey;
  monthlyPriceFen: number;
  currency: "CNY";
  available: boolean;
  featured: boolean;
  priceVersion: string;
  updatedAt: number;
};

const paidPlans = ["starter", "pro", "business"] as const;
const defaultPrices: Record<(typeof paidPlans)[number], number> = {
  starter: 3500,
  pro: 9800,
  business: 23800,
};

export async function ensurePlanPricingSchema() {
  await ensureProductSchema();
  const db = getDatabase();
  db.exec(`
    CREATE TABLE IF NOT EXISTS platform_plan_pricing (
      plan_key TEXT PRIMARY KEY CHECK(plan_key IN ('trial','starter','pro','business')),
      monthly_price_fen INTEGER NOT NULL CHECK(monthly_price_fen>=0),
      currency TEXT NOT NULL DEFAULT 'CNY' CHECK(currency='CNY'),
      available INTEGER NOT NULL DEFAULT 1,
      featured INTEGER NOT NULL DEFAULT 0,
      price_version TEXT NOT NULL,
      updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS platform_plan_pricing_history (
      id TEXT PRIMARY KEY,
      plan_key TEXT NOT NULL CHECK(plan_key IN ('trial','starter','pro','business')),
      monthly_price_fen INTEGER NOT NULL CHECK(monthly_price_fen>=0),
      currency TEXT NOT NULL CHECK(currency='CNY'),
      available INTEGER NOT NULL,
      featured INTEGER NOT NULL,
      price_version TEXT NOT NULL,
      updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at INTEGER NOT NULL,
      UNIQUE(plan_key,price_version)
    );
  `);
  const now = Math.floor(Date.now() / 1000);
  const defaults: Array<[PlanKey, number, number, number]> = [
    ["trial", 0, 1, 0],
    ["starter", defaultPrices.starter, 1, 0],
    ["pro", defaultPrices.pro, 1, 1],
    ["business", defaultPrices.business, 1, 0],
  ];
  for (const [planKey, amount, available, featured] of defaults) {
    db.prepare(
      `INSERT OR IGNORE INTO platform_plan_pricing
      (plan_key,monthly_price_fen,currency,available,featured,price_version,updated_at)
      VALUES (?,?,'CNY',?,?,?,?)`,
    )
      .bind(planKey, amount, available, featured, "cny-initial-2026-08-11", now)
      .run();
  }
}

export async function productPrices(): Promise<ProductPrice[]> {
  await ensurePlanPricingSchema();
  return getDatabase()
    .prepare(
      `SELECT plan_key AS planKey,monthly_price_fen AS monthlyPriceFen,currency,
    available,featured,price_version AS priceVersion,updated_at AS updatedAt
    FROM platform_plan_pricing ORDER BY CASE plan_key WHEN 'trial' THEN 0 WHEN 'starter' THEN 1 WHEN 'pro' THEN 2 ELSE 3 END`,
    )
    .all<
      Omit<ProductPrice, "available" | "featured"> & {
        available: number;
        featured: number;
      }
    >()
    .results.map((row) => ({
      ...row,
      available: Boolean(row.available),
      featured: Boolean(row.featured),
    }));
}

export async function productPrice(planKey: Exclude<PlanKey, "trial">) {
  const price = (await productPrices()).find(
    (item) => item.planKey === planKey,
  );
  if (!price) throw new Error("PLAN_PRICE_NOT_CONFIGURED");
  return price;
}

export async function updateProductPrices(
  values: Array<{
    planKey: string;
    monthlyPriceFen: number;
    available: boolean;
    featured: boolean;
  }>,
  adminId: string,
) {
  if (
    values.length !== paidPlans.length ||
    new Set(values.map((item) => item.planKey)).size !== paidPlans.length
  )
    throw new Error("PLAN_PRICE_SET_INVALID");
  for (const item of values) {
    if (!paidPlans.includes(item.planKey as (typeof paidPlans)[number]))
      throw new Error("PLAN_PRICE_SET_INVALID");
    if (
      !Number.isSafeInteger(item.monthlyPriceFen) ||
      item.monthlyPriceFen < 1 ||
      item.monthlyPriceFen > 100_000_000
    )
      throw new Error("PLAN_PRICE_INVALID");
  }
  if (values.filter((item) => item.featured).length > 1)
    throw new Error("PLAN_FEATURED_INVALID");
  await ensurePlanPricingSchema();
  const db = getDatabase(),
    now = Math.floor(Date.now() / 1000),
    version = `cny-${now}-${crypto.randomUUID().slice(0, 8)}`;
  db.transaction(() => {
    for (const item of values) {
      db.prepare(
        `UPDATE platform_plan_pricing SET monthly_price_fen=?,available=?,featured=?,price_version=?,updated_by=?,updated_at=? WHERE plan_key=?`,
      )
        .bind(
          item.monthlyPriceFen,
          item.available ? 1 : 0,
          item.featured ? 1 : 0,
          version,
          adminId,
          now,
          item.planKey,
        )
        .run();
      db.prepare(
        `INSERT INTO platform_plan_pricing_history(id,plan_key,monthly_price_fen,currency,available,featured,price_version,updated_by,created_at)
        VALUES (?,?,?,'CNY',?,?,?,?,?)`,
      )
        .bind(
          crypto.randomUUID(),
          item.planKey,
          item.monthlyPriceFen,
          item.available ? 1 : 0,
          item.featured ? 1 : 0,
          version,
          adminId,
          now,
        )
        .run();
    }
  });
  return version;
}

export async function publicProductPlans() {
  const prices = await productPrices();
  return prices.map((price) => {
    const plan = planCatalog[price.planKey],
      limits = plan.entitlements;
    return {
      id: plan.key,
      name: plan.name["zh-CN"],
      nameEn: plan.name["en-US"],
      catalogVersion: plan.catalogVersion,
      priceVersion: price.priceVersion,
      currency: price.currency,
      monthlyPriceCents: price.monthlyPriceFen,
      available: price.available,
      featured: price.featured,
      projectLimit: limits.projects,
      monthlyPageLimit: limits.pagesPerMonth,
      pageLimit: limits.pagesPerAudit,
      keywordLimit: limits.keywords,
      aiCreditLimit: limits.monthlyCredits,
      contentLimit: limits.contentItems,
      teamSeatLimit: limits.seats,
      agents: limits.agents,
      scheduledTasks:
        limits.scheduledRunsPerDay === null
          ? "不限"
          : limits.scheduledRunsPerDay === 0
            ? "手动"
            : `每日 ${limits.scheduledRunsPerDay} 次`,
      retentionDays: limits.retentionDays,
      storageBytes: limits.storageBytes,
      apiRequestLimit: limits.apiRequests,
      apiKeyLimit: limits.apiKeys,
      apiAccess: limits.apiAccess,
      integrations: limits.integrations,
      support: limits.support,
    };
  });
}
