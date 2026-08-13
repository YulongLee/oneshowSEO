import { NextResponse } from "next/server";
import { getCurrentUser, writeAudit } from "../../../../lib/auth";
import {
  clearPaymentProvider,
  listPaymentProviders,
  paymentEncryptionReady,
  paymentProviderDefinitions,
  savePaymentProvider,
  type ChinaPaymentProvider,
} from "../../../../lib/payment-providers";
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
function provider(value: unknown): value is ChinaPaymentProvider {
  return value === "alipay" || value === "wechatpay";
}
export async function GET() {
  const user = await admin();
  if (!user) return NextResponse.json({ error: "无权访问" }, { status: 403 });
  const providers = await listPaymentProviders();
  return NextResponse.json(
    {
      liveEnabled: process.env.BILLING_LIVE_ENABLED === "true",
      encryptionReady: paymentEncryptionReady(),
      providers: providers.map((item) => ({
        ...item,
        name: paymentProviderDefinitions[item.provider].name,
        description: paymentProviderDefinitions[item.provider].description,
        fields: paymentProviderDefinitions[item.provider].fields.map(
          (field) => ({ ...field, configured: item.configured }),
        ),
      })),
    },
    { headers: { "cache-control": "private, no-store" } },
  );
}
export async function PATCH(request: Request) {
  const user = await admin();
  if (!user) return NextResponse.json({ error: "无权访问" }, { status: 403 });
  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!provider(body?.provider))
    return NextResponse.json({ error: "支付渠道无效" }, { status: 400 });
  const values =
    body?.values &&
    typeof body.values === "object" &&
    !Array.isArray(body.values)
      ? Object.fromEntries(
          Object.entries(body.values).filter(
            (entry): entry is [string, string] => typeof entry[1] === "string",
          ),
        )
      : {};
  try {
    await savePaymentProvider(
      body.provider,
      values,
      body.enabled === true,
      user.id,
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : "SAVE_FAILED",
      messages: Record<string, string> = {
        PAYMENT_ENCRYPTION_KEY_MISSING: "服务器尚未配置支付密钥加密主密钥",
        PAYMENT_REQUIRED_FIELDS_MISSING: "启用前请补齐全部必填配置",
        PAYMENT_URL_INVALID: "支付网关和回调地址必须使用 HTTPS",
        PAYMENT_API_V3_KEY_INVALID: "微信 API v3 密钥必须正好为 32 字节",
        PAYMENT_CONFIG_INVALID: "支付配置格式无效",
      };
    return NextResponse.json(
      { error: messages[code] || "密钥或配置格式无效，请检查 PEM 内容", code },
      { status: code === "PAYMENT_ENCRYPTION_KEY_MISSING" ? 503 : 400 },
    );
  }
  await writeAudit(
    "admin_payment_provider_update",
    user.id,
    request,
    JSON.stringify({ provider: body.provider, enabled: body.enabled === true }),
  );
  return NextResponse.json({ ok: true });
}
export async function DELETE(request: Request) {
  const user = await admin();
  if (!user) return NextResponse.json({ error: "无权访问" }, { status: 403 });
  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!provider(body?.provider))
    return NextResponse.json({ error: "支付渠道无效" }, { status: 400 });
  await clearPaymentProvider(body.provider, user.id);
  await writeAudit(
    "admin_payment_provider_clear",
    user.id,
    request,
    JSON.stringify({ provider: body.provider }),
  );
  return NextResponse.json({ ok: true });
}
