import { NextResponse } from "next/server";
import { smsAuthStatus } from "../../../../../lib/sms-auth";

export async function GET() {
  const status = smsAuthStatus();
  return NextResponse.json({
    enabled: status.enabled,
    available: status.configured,
  });
}
