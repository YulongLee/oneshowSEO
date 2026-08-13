import { NextResponse } from "next/server";
import { getCurrentUser, writeAudit } from "../../../../lib/auth";
import {
  productPrices,
  updateProductPrices,
} from "../../../../lib/plan-pricing";
import {
  AuthorizationError,
  authorizePlatformAccount,
} from "../../../../platform/modules/identity/authorization";

async function admin() {
  const user = await getCurrentUser();
  if (!user) return null;
  try {
    authorizePlatformAccount(user.role);
    return user;
  } catch (error) {
    if (error instanceof AuthorizationError) return null;
    throw error;
  }
}

export async function GET() {
  const user = await admin();
  if (!user) return NextResponse.json({ error: "无权访问" }, { status: 403 });
  return NextResponse.json(
    { prices: await productPrices() },
    { headers: { "cache-control": "private, no-store" } },
  );
}

export async function PUT(request: Request) {
  const user = await admin();
  if (!user) return NextResponse.json({ error: "无权访问" }, { status: 403 });
  const body = (await request.json().catch(() => null)) as {
    prices?: unknown;
  } | null;
  if (!Array.isArray(body?.prices))
    return NextResponse.json({ error: "套餐价格格式无效" }, { status: 400 });
  const prices = body.prices.map((item) => {
    const row =
      item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    return {
      planKey: String(row.planKey ?? ""),
      monthlyPriceFen: Number(row.monthlyPriceFen),
      available: row.available === true,
      featured: row.featured === true,
    };
  });
  try {
    const priceVersion = await updateProductPrices(prices, user.id);
    await writeAudit(
      "admin_plan_pricing_update",
      user.id,
      request,
      JSON.stringify({
        priceVersion,
        plans: prices.map(
          ({ planKey, monthlyPriceFen, available, featured }) => ({
            planKey,
            monthlyPriceFen,
            available,
            featured,
          }),
        ),
      }),
    );
    return NextResponse.json({ ok: true, priceVersion });
  } catch (error) {
    const code =
      error instanceof Error ? error.message : "PLAN_PRICE_SAVE_FAILED";
    const message =
      code === "PLAN_PRICE_INVALID"
        ? "套餐价格必须是有效的正数"
        : code === "PLAN_FEATURED_INVALID"
          ? "最多只能设置一个推荐套餐"
          : "套餐价格配置不完整";
    return NextResponse.json({ error: message, code }, { status: 400 });
  }
}
