import { NextResponse } from "next/server";
import { clearSession } from "../../../../lib/auth";

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(request.url).host) return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  await clearSession();
  return NextResponse.json({ ok: true });
}
