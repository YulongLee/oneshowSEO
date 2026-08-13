import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../../lib/auth";
import {
  CheckoutError,
  paymentOrderStatus,
} from "../../../../../lib/payment-checkout";
import {
  can,
  permissions,
  type OrganizationRoleKey,
} from "../../../../../platform/modules/identity/authorization";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  if (
    !can(
      user.organization.roleKey as OrganizationRoleKey,
      permissions.billingRead,
    )
  )
    return NextResponse.json({ error: "没有查看计费的权限" }, { status: 403 });
  try {
    const { id } = await params;
    return NextResponse.json(
      await paymentOrderStatus(id, user.organization.organizationId),
      { headers: { "cache-control": "private, no-store" } },
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
