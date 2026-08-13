import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("platform pricing is centrally versioned and rejects invalid product prices", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "oneshowseo-pricing-"));
  process.env.DATABASE_PATH = path.join(directory, "pricing.sqlite");
  globalThis.__oneShowSeoDatabase = undefined;
  const auth = await import("../lib/auth"), pricing = await import("../lib/plan-pricing");
  const db = auth.getDatabase(), now = Math.floor(Date.now() / 1000);
  await auth.ensureAuthSchema(db);
  db.prepare("INSERT INTO users(id,email,name,password_hash,role,status,plan,email_verified_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)").bind("pricing_admin","pricing@example.com","Pricing Admin","hash","admin","active","business",now,now,now).run();
  const initial = await pricing.productPrices();
  assert.equal(initial.length, 4);
  const version = await pricing.updateProductPrices([
    { planKey: "starter", monthlyPriceFen: 4900, available: true, featured: false },
    { planKey: "pro", monthlyPriceFen: 12900, available: true, featured: true },
    { planKey: "business", monthlyPriceFen: 29900, available: false, featured: false },
  ], "pricing_admin");
  const plans = await pricing.publicProductPlans(), pro = plans.find((item) => item.id === "pro"), business = plans.find((item) => item.id === "business");
  assert.equal(pro?.monthlyPriceCents, 12900);
  assert.equal(pro?.currency, "CNY");
  assert.equal(pro?.featured, true);
  assert.equal(business?.available, false);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM platform_plan_pricing_history WHERE price_version=?").bind(version).first<{count:number}>()?.count, 3);
  await assert.rejects(() => pricing.updateProductPrices([
    { planKey: "starter", monthlyPriceFen: 0, available: true, featured: false },
    { planKey: "pro", monthlyPriceFen: 100, available: true, featured: true },
    { planKey: "business", monthlyPriceFen: 100, available: true, featured: false },
  ], "pricing_admin"), /PLAN_PRICE_INVALID/);
});
