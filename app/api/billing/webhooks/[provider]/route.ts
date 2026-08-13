import { NextResponse } from "next/server";
import {
  ensureBillingSchema,
  sandboxPaymentService,
} from "../../../../../lib/billing";
import { PaymentError } from "../../../../../platform/modules/commerce/payments";
import {
  CheckoutError,
  receiveAlipayNotification,
  receiveWechatNotification,
} from "../../../../../lib/payment-checkout";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 1_048_576)
    return NextResponse.json(
      { error: "事件载荷过大", code: "PAYLOAD_TOO_LARGE" },
      { status: 413 },
    );
  if (provider === "alipay" || provider === "wechatpay") {
    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody) > 1_048_576)
      return NextResponse.json(
        { error: "事件载荷过大", code: "PAYLOAD_TOO_LARGE" },
        { status: 413 },
      );
    try {
      const result =
        provider === "alipay"
          ? await receiveAlipayNotification(rawBody)
          : await receiveWechatNotification(rawBody, request.headers);
      return provider === "alipay"
        ? new NextResponse("success", {
            status: 200,
            headers: { "content-type": "text/plain; charset=utf-8" },
          })
        : NextResponse.json({
            code: "SUCCESS",
            message: "成功",
            duplicate: result.duplicate,
          });
    } catch (error) {
      if (error instanceof CheckoutError)
        return provider === "alipay"
          ? new NextResponse("failure", {
              status: error.status,
              headers: { "content-type": "text/plain; charset=utf-8" },
            })
          : NextResponse.json(
              { code: error.code, message: error.message },
              { status: error.status },
            );
      return NextResponse.json(
        { code: "PAYMENT_WEBHOOK_INVALID", message: "支付通知无效" },
        { status: 400 },
      );
    }
  }
  if (provider !== "sandbox")
    return NextResponse.json(
      { error: "支付提供商不存在", code: "PAYMENT_PROVIDER_NOT_FOUND" },
      { status: 404 },
    );
  await ensureBillingSchema();
  const service = sandboxPaymentService();
  if (!service)
    return NextResponse.json(
      { error: "支付沙箱未启用", code: "PAYMENT_SANDBOX_DISABLED" },
      { status: 503 },
    );
  const signature = request.headers.get("x-payment-signature") ?? "";
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody) > 1_048_576)
    return NextResponse.json(
      { error: "事件载荷过大", code: "PAYLOAD_TOO_LARGE" },
      { status: 413 },
    );
  try {
    const result = service.receiveWebhook(rawBody, signature);
    return NextResponse.json(
      {
        accepted: true,
        duplicate: result.duplicate,
        eventId: result.record.providerEventId,
        state: result.record.state,
      },
      { status: result.duplicate ? 200 : 202 },
    );
  } catch (error) {
    if (error instanceof PaymentError)
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    return NextResponse.json(
      { error: "支付事件签名或载荷无效", code: "PAYMENT_WEBHOOK_INVALID" },
      { status: 400 },
    );
  }
}
