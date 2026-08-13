import { createHash, randomBytes } from "node:crypto";
import { getDatabase } from "./auth";
import { ensureBillingSchema } from "./billing";
import {
  enabledPaymentConfig,
  ensurePaymentSchema,
  type ChinaPaymentProvider,
} from "./payment-providers";
import { productPrice } from "./plan-pricing";
import {
  commercialPlan,
  type PlanKey,
} from "../platform/modules/commerce/catalog";
import {
  buildAlipayPagePayment,
  decryptWechatResource,
  verifyAlipayNotification,
  verifyWechatNotification,
  wechatAuthorization,
  type AlipayNotification,
} from "../platform/modules/commerce/china-payment-crypto";

export class CheckoutError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}
type PaidOrder = {
  id: string;
  orderNo: string;
  organizationId: string;
  userId: string;
  provider: ChinaPaymentProvider;
  planKey: Exclude<PlanKey, "trial">;
  catalogVersion: string;
  priceVersion: string;
  amountFen: number;
  currency: "CNY";
  status: string;
  expiresAt: number;
};
const orderColumns = `id,order_no AS orderNo,organization_id AS organizationId,user_id AS userId,provider,plan_key AS planKey,catalog_version AS catalogVersion,price_version AS priceVersion,amount_fen AS amountFen,currency,status,expires_at AS expiresAt`;
function paymentOrigin() {
  try {
    const url = new URL(process.env.APP_URL?.trim() ?? "");
    if (url.protocol !== "https:" || url.username || url.password)
      throw new Error();
    return url.origin;
  } catch {
    throw new CheckoutError("APP_URL_INVALID", "线上站点地址未配置", 503);
  }
}
function orderNo() {
  return `OS${Date.now().toString(36).toUpperCase()}${randomBytes(6).toString("hex").toUpperCase()}`.slice(
    0,
    32,
  );
}
function paidOrder(no: string) {
  return getDatabase()
    .prepare(
      `SELECT ${orderColumns} FROM billing_payment_orders WHERE order_no=?`,
    )
    .bind(no)
    .first<PaidOrder>();
}

export async function createPaymentCheckout(input: {
  organizationId: string;
  userId: string;
  provider: ChinaPaymentProvider;
  planKey: string;
  fetchImpl?: typeof fetch;
}) {
  if (process.env.BILLING_LIVE_ENABLED !== "true")
    throw new CheckoutError(
      "PAYMENT_LIVE_DISABLED",
      "在线支付尚未由平台管理员开启",
      503,
    );
  if (!["starter", "pro", "business"].includes(input.planKey))
    throw new CheckoutError("PLAN_INVALID", "请选择有效的付费套餐");
  await ensureBillingSchema();
  await ensurePaymentSchema();
  const provider = input.provider,
    config = await enabledPaymentConfig(provider);
  if (!config)
    throw new CheckoutError(
      "PAYMENT_PROVIDER_DISABLED",
      "该支付方式尚未启用",
      503,
    );
  const plan = commercialPlan(input.planKey),
    pricing = await productPrice(plan.key as Exclude<PlanKey, "trial">),
    amountFen = pricing.monthlyPriceFen;
  if (!pricing.available)
    throw new CheckoutError("PLAN_NOT_FOR_SALE", "该套餐当前暂停新购", 409);
  if (!Number.isSafeInteger(amountFen) || amountFen <= 0)
    throw new CheckoutError("PAYMENT_PRICE_INVALID", "支付价格配置无效", 503);
  const now = Math.floor(Date.now() / 1000),
    no = orderNo(),
    expiresAt = now + 7200,
    id = crypto.randomUUID();
  getDatabase()
    .prepare(
      "INSERT INTO billing_payment_orders(id,order_no,organization_id,user_id,provider,plan_key,catalog_version,price_version,amount_fen,currency,status,expires_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,'CNY','created',?,?,?)",
    )
    .bind(
      id,
      no,
      input.organizationId,
      input.userId,
      provider,
      plan.key,
      plan.catalogVersion,
      pricing.priceVersion,
      amountFen,
      expiresAt,
      now,
      now,
    )
    .run();
  try {
    const appUrl = paymentOrigin();
    let checkout: { type: "redirect" | "qr"; value: string };
    if (provider === "alipay")
      checkout = {
        type: "redirect",
        value: buildAlipayPagePayment({
          gatewayUrl: config.gatewayUrl,
          appId: config.appId,
          privateKey: config.appPrivateKey,
          notifyUrl: `${appUrl}/api/billing/webhooks/alipay`,
          returnUrl: `${appUrl}/workspace?payment=return`,
          orderNo: no,
          amountFen,
          subject: `OneShowSEO ${plan.name["zh-CN"]} 月度套餐`,
        }),
      };
    else
      checkout = {
        type: "qr",
        value: await createWechatNative(
          { ...config, notifyUrl: `${appUrl}/api/billing/webhooks/wechatpay` },
          {
            orderNo: no,
            amountFen,
            description: `OneShowSEO ${plan.name["zh-CN"]} 月度套餐`,
            expiresAt,
          },
          input.fetchImpl ?? fetch,
        ),
      };
    getDatabase()
      .prepare(
        "UPDATE billing_payment_orders SET status='pending',checkout_payload=?,updated_at=? WHERE id=? AND status='created'",
      )
      .bind(JSON.stringify(checkout), now, id)
      .run();
    return {
      orderId: id,
      orderNo: no,
      provider,
      planKey: plan.key,
      amountFen,
      currency: "CNY",
      expiresAt,
      checkout,
    };
  } catch (error) {
    getDatabase()
      .prepare(
        "UPDATE billing_payment_orders SET status='failed',updated_at=? WHERE id=? AND status='created'",
      )
      .bind(Math.floor(Date.now() / 1000), id)
      .run();
    if (error instanceof CheckoutError) throw error;
    throw new CheckoutError(
      "PAYMENT_PROVIDER_REQUEST_FAILED",
      "支付渠道下单失败，请稍后重试",
      502,
    );
  }
}

async function createWechatNative(
  config: Record<string, string>,
  input: {
    orderNo: string;
    amountFen: number;
    description: string;
    expiresAt: number;
  },
  fetchImpl: typeof fetch,
) {
  const path = "/v3/pay/transactions/native",
    body = JSON.stringify({
      appid: config.appId,
      mchid: config.mchId,
      description: input.description,
      out_trade_no: input.orderNo,
      time_expire: new Date(input.expiresAt * 1000).toISOString(),
      notify_url: config.notifyUrl,
      amount: { total: input.amountFen, currency: "CNY" },
    });
  const response = await fetchImpl(`https://api.mch.weixin.qq.com${path}`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        authorization: wechatAuthorization({
          method: "POST",
          path,
          body,
          mchId: config.mchId,
          serialNo: config.merchantSerialNo,
          privateKey: config.merchantPrivateKey,
        }),
      },
      body,
      signal: AbortSignal.timeout(12000),
    }),
    raw = await response.text();
  if (!response.ok)
    throw new CheckoutError("WECHAT_ORDER_FAILED", "微信支付下单失败", 502);
  const timestamp = response.headers.get("wechatpay-timestamp") ?? "",
    nonce = response.headers.get("wechatpay-nonce") ?? "",
    signature = response.headers.get("wechatpay-signature") ?? "",
    serial = response.headers.get("wechatpay-serial") ?? "";
  if (
    !verifyWechatNotification({
      timestamp,
      nonce,
      body: raw,
      signature,
      serial,
      expectedSerial: config.wechatPayPublicKeyId,
      publicKey: config.wechatPayPublicKey,
    })
  )
    throw new CheckoutError(
      "WECHAT_RESPONSE_SIGNATURE_INVALID",
      "微信支付响应验签失败",
      502,
    );
  const parsed = JSON.parse(raw) as { code_url?: string };
  if (!parsed.code_url?.startsWith("weixin://"))
    throw new CheckoutError(
      "WECHAT_CODE_URL_INVALID",
      "微信支付二维码无效",
      502,
    );
  return parsed.code_url;
}

export async function paymentOrderStatus(
  orderId: string,
  organizationId: string,
) {
  await ensurePaymentSchema();
  const row = getDatabase()
    .prepare(
      `SELECT ${orderColumns},paid_at AS paidAt FROM billing_payment_orders WHERE id=? AND organization_id=?`,
    )
    .bind(orderId, organizationId)
    .first<PaidOrder & { paidAt: number | null }>();
  if (!row)
    throw new CheckoutError("PAYMENT_ORDER_NOT_FOUND", "支付订单不存在", 404);
  return row;
}

export async function receiveAlipayNotification(raw: string) {
  if (process.env.BILLING_LIVE_ENABLED !== "true")
    throw new CheckoutError("PAYMENT_LIVE_DISABLED", "在线支付未启用", 503);
  await ensureBillingSchema();
  const config = await enabledPaymentConfig("alipay");
  if (!config)
    throw new CheckoutError("PAYMENT_PROVIDER_DISABLED", "支付宝未启用", 503);
  const params = Object.fromEntries(
    new URLSearchParams(raw).entries(),
  ) as AlipayNotification;
  if (!verifyAlipayNotification(params, config.alipayPublicKey))
    throw new CheckoutError(
      "ALIPAY_SIGNATURE_INVALID",
      "支付宝通知验签失败",
      400,
    );
  const order = paidOrder(params.out_trade_no);
  if (!order || order.provider !== "alipay")
    throw new CheckoutError("PAYMENT_ORDER_NOT_FOUND", "支付订单不存在", 404);
  if (
    params.app_id !== config.appId ||
    params.total_amount !== (order.amountFen / 100).toFixed(2) ||
    (params.trade_status !== "TRADE_SUCCESS" &&
      params.trade_status !== "TRADE_FINISHED")
  )
    throw new CheckoutError(
      "PAYMENT_NOTIFICATION_MISMATCH",
      "支付宝通知与订单不一致",
      409,
    );
  return settle(
    order,
    params.trade_no,
    params.notify_id || params.trade_no,
    raw,
  );
}

export async function receiveWechatNotification(raw: string, headers: Headers) {
  if (process.env.BILLING_LIVE_ENABLED !== "true")
    throw new CheckoutError("PAYMENT_LIVE_DISABLED", "在线支付未启用", 503);
  await ensureBillingSchema();
  const config = await enabledPaymentConfig("wechatpay");
  if (!config)
    throw new CheckoutError("PAYMENT_PROVIDER_DISABLED", "微信支付未启用", 503);
  const timestamp = headers.get("wechatpay-timestamp") ?? "",
    nonce = headers.get("wechatpay-nonce") ?? "",
    signature = headers.get("wechatpay-signature") ?? "",
    serial = headers.get("wechatpay-serial") ?? "";
  if (
    !verifyWechatNotification({
      timestamp,
      nonce,
      body: raw,
      signature,
      serial,
      expectedSerial: config.wechatPayPublicKeyId,
      publicKey: config.wechatPayPublicKey,
    })
  )
    throw new CheckoutError(
      "WECHAT_SIGNATURE_INVALID",
      "微信支付通知验签失败",
      400,
    );
  const envelope = JSON.parse(raw) as {
      id?: string;
      resource?: {
        algorithm: string;
        nonce: string;
        associated_data?: string;
        ciphertext: string;
      };
    },
    data = decryptWechatResource(envelope.resource!, config.apiV3Key);
  const order = paidOrder(String(data.out_trade_no ?? ""));
  if (!order || order.provider !== "wechatpay")
    throw new CheckoutError("PAYMENT_ORDER_NOT_FOUND", "支付订单不存在", 404);
  const amount = data.amount as
    { total?: number; currency?: string } | undefined;
  if (
    data.appid !== config.appId ||
    data.mchid !== config.mchId ||
    data.trade_state !== "SUCCESS" ||
    amount?.total !== order.amountFen ||
    amount.currency !== "CNY"
  )
    throw new CheckoutError(
      "PAYMENT_NOTIFICATION_MISMATCH",
      "微信支付通知与订单不一致",
      409,
    );
  return settle(
    order,
    String(data.transaction_id ?? ""),
    envelope.id ?? String(data.transaction_id ?? ""),
    raw,
  );
}

function settle(
  order: PaidOrder,
  transactionId: string,
  eventId: string,
  raw: string,
) {
  if (!transactionId || !eventId)
    throw new CheckoutError(
      "PAYMENT_NOTIFICATION_INVALID",
      "支付通知缺少交易标识",
    );
  const db = getDatabase(),
    now = Math.floor(Date.now() / 1000),
    hash = createHash("sha256").update(raw).digest("hex");
  return db.transaction(() => {
    const existing = db
      .prepare(
        "SELECT payload_sha256 AS hash,status FROM billing_payment_notifications WHERE provider=? AND provider_event_id=?",
      )
      .bind(order.provider, eventId)
      .first<{ hash: string; status: string }>();
    if (existing) {
      if (existing.hash !== hash)
        throw new CheckoutError(
          "PAYMENT_NOTIFICATION_CONFLICT",
          "重复通知载荷不一致",
          409,
        );
      return { duplicate: true, orderId: order.id };
    }
    db.prepare(
      "INSERT INTO billing_payment_notifications(id,provider,provider_event_id,payload_sha256,received_at,status) VALUES (?,?,?,?,?,'processing')",
    )
      .bind(crypto.randomUUID(), order.provider, eventId, hash, now)
      .run();
    const changed = db
      .prepare(
        "UPDATE billing_payment_orders SET status='paid',provider_transaction_id=?,paid_at=?,updated_at=? WHERE id=? AND status IN ('created','pending')",
      )
      .bind(transactionId, now, now, order.id)
      .run().meta.changes;
    if (changed) {
      const plan = commercialPlan(order.planKey),
        periodEnd = now + 30 * 86400 - 1;
      db.prepare(
        "UPDATE commerce_subscriptions SET plan_key=?,state='active',source_type='provider',catalog_version=?,currency=?,current_period_start=?,current_period_end=?,grace_until=NULL,cancel_at_period_end=0,pending_plan_key=NULL,plan_change_at=NULL,plan_change_reason=NULL,provider_customer_ref=?,provider_subscription_ref=?,version=version+1,updated_at=? WHERE organization_id=?",
      )
        .bind(
          order.planKey,
          plan.catalogVersion,
          plan.currency,
          now,
          periodEnd,
          `pay:${order.organizationId}`,
          `${order.provider}:${order.orderNo}`,
          now,
          order.organizationId,
        )
        .run();
      db.prepare(
        "INSERT OR IGNORE INTO billing_invoices(id,user_id,organization_id,invoice_number,period_start,period_end,amount_cents,currency,status,provider_invoice_id,download_url,created_at) VALUES (?,?,?,?,?,?,?,?, 'paid',?,?,?)",
      )
        .bind(
          crypto.randomUUID(),
          order.userId,
          order.organizationId,
          `INV-${order.orderNo}`,
          now,
          periodEnd,
          order.amountFen,
          "CNY",
          `${order.provider}:${transactionId}`,
          null,
          now,
        )
        .run();
      db.prepare(
        "INSERT INTO billing_events(id,user_id,organization_id,event_type,description,created_at) VALUES (?,?,?,?,?,?)",
      )
        .bind(
          crypto.randomUUID(),
          order.userId,
          order.organizationId,
          "payment_succeeded",
          `${order.provider === "alipay" ? "支付宝" : "微信支付"}支付成功，${plan.name["zh-CN"]} 套餐已开通`,
          now,
        )
        .run();
      db.prepare("UPDATE users SET plan=?,updated_at=? WHERE id=?")
        .bind(order.planKey, now, order.userId)
        .run();
    }
    db.prepare(
      "UPDATE billing_payment_notifications SET status='processed',processed_at=? WHERE provider=? AND provider_event_id=?",
    )
      .bind(now, order.provider, eventId)
      .run();
    return { duplicate: !changed, orderId: order.id };
  });
}
