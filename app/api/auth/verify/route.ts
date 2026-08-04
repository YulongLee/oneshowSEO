import { NextResponse } from "next/server";
import { identityService } from "../../../../lib/identity";

function redirectUrl(request: Request, status: "verified" | "invalid"): URL {
  const base = process.env.APP_URL || new URL(request.url).origin;
  return new URL(`/login?activation=${status}`, base);
}

export async function GET(request: Request) {
  const rawToken = new URL(request.url).searchParams.get("token") || "";
  if (!rawToken) return NextResponse.redirect(redirectUrl(request, "invalid"));
  const verified=await (await identityService(request)).verifyEmailToken(rawToken).catch(()=>false);
  return NextResponse.redirect(redirectUrl(request,verified?"verified":"invalid"));
}
