import { NextResponse } from "next/server";
import { safeReturnTo, setSessionCookie, tooManyAttempts } from "../../../../lib/auth";
import { currentSessionToken, identityService, IdentityError } from "../../../../lib/identity";

export async function POST(request: Request) {
  try {
    if (await tooManyAttempts("login", request)) return NextResponse.json({ error: "登录尝试过多，请 15 分钟后重试" }, { status: 429 });
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const returnTo = safeReturnTo(body?.returnTo);
    const result = await (await identityService(request)).login({email:body?.email,password:body?.password,previousToken:await currentSessionToken()});
    await setSessionCookie(result.session.token,result.session.expiresAt);
    return NextResponse.json({ok:true,returnTo,user:{id:result.account.id,email:result.account.email,name:result.account.name,role:result.account.role,plan:result.account.plan}});
  } catch (error) {
    if (error instanceof IdentityError) return NextResponse.json({error:error.message,code:error.code},{status:error.status});
    console.error("[auth] login service failure", error);
    return NextResponse.json({error:"登录服务暂时不可用，请稍后重试",code:"AUTH_SERVICE_UNAVAILABLE"},{status:500});
  }
}
