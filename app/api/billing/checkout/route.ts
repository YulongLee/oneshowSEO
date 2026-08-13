import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import {
  createPaymentCheckout,
  CheckoutError,
} from "../../../../lib/payment-checkout";
import type { ChinaPaymentProvider } from "../../../../lib/payment-providers";
import {
  can,
  permissions,
  type OrganizationRoleKey,
} from "../../../../platform/modules/identity/authorization";
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  if (
    !can(
      user.organization.roleKey as OrganizationRoleKey,
      permissions.billingManage,
    )
  )
    return NextResponse.json({ error: "没有管理计费的权限" }, { status: 403 });
  const body = (await request.json().catch(() => null)) as {
    provider?: ChinaPaymentProvider;
    planKey?: string;
  } | null;
  if (!body || !(["alipay", "wechatpay"] as unknown[]).includes(body.provider))
    return NextResponse.json(
      { error: "请选择支付方式", code: "PAYMENT_PROVIDER_INVALID" },
      { status: 400 },
    );
  try {
    return NextResponse.json(
      await createPaymentCheckout({
        organizationId: user.organization.organizationId,
        userId: user.id,
        provider: body.provider!,
        planKey: body.planKey ?? "",
      }),
      { status: 201, headers: { "cache-control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof CheckoutError)
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    throw error;
  }
}
