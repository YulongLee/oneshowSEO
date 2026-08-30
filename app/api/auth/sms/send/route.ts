import { NextResponse } from "next/server";
import { sendSmsLoginCode, SmsAuthError } from "../../../../../lib/sms-auth";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    const result = await sendSmsLoginCode(body?.phone, request);
    return NextResponse.json({ ok: true, ...result }, { status: 202 });
  } catch (error) {
    if (error instanceof SmsAuthError)
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
          retryAfter: error.retryAfter,
        },
        { status: error.status },
      );
    console.error("[auth] sms send failure", error);
    return NextResponse.json(
      { error: "验证码发送失败，请稍后重试", code: "SMS_SEND_FAILED" },
      { status: 500 },
    );
  }
}
