import { NextResponse } from "next/server";
import { safeReturnTo, setSessionCookie } from "../../../../../lib/auth";
import { verifySmsLogin, SmsAuthError } from "../../../../../lib/sms-auth";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    const returnTo = safeReturnTo(body?.returnTo);
    const result = await verifySmsLogin(
      {
        phone: body?.phone,
        code: body?.code,
        acceptedTerms: body?.acceptedTerms,
      },
      request,
    );
    await setSessionCookie(result.token, result.expiresAt);
    return NextResponse.json(
      {
        ok: true,
        returnTo,
        created: result.created,
        phone: result.maskedPhone,
      },
      { status: result.created ? 201 : 200 },
    );
  } catch (error) {
    if (error instanceof SmsAuthError)
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    console.error("[auth] sms verification failure", error);
    return NextResponse.json(
      {
        error: "短信登录服务暂时不可用，请稍后重试",
        code: "AUTH_SERVICE_UNAVAILABLE",
      },
      { status: 500 },
    );
  }
}
