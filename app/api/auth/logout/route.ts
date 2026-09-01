import { NextResponse } from "next/server";
import {
  clearSession,
  isTrustedRequestOrigin,
} from "../../../../lib/auth";
import { currentSessionToken, identityService } from "../../../../lib/identity";

export async function POST(request: Request) {
  if (!isTrustedRequestOrigin(request))
    return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  await (await identityService(request)).logout(await currentSessionToken());
  await clearSession();
  return NextResponse.json({ ok: true });
}
