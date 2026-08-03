import { NextResponse } from "next/server";
import { ensureAuthSchema, getDatabase, writeAudit } from "../../../../lib/auth";
import { issueEmailVerification, type VerificationUser } from "../../../../lib/email-verification";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase().slice(0, 254) : "";
  if (!emailPattern.test(email)) return NextResponse.json({ error: "请输入有效的邮箱地址" }, { status: 400 });
  const database = getDatabase();
  await ensureAuthSchema(database);
  const user = await database.prepare(`
    SELECT id, email, name, email_verified_at AS emailVerifiedAt
    FROM users WHERE email = ? AND status = 'active' LIMIT 1
  `).bind(email).first<VerificationUser>();
  let retryAfter = 60;
  if (user && !user.emailVerifiedAt) {
    const delivery = await issueEmailVerification(user, request);
    retryAfter = delivery.retryAfter || 60;
  }
  await writeAudit("verification_resend_accepted", user?.id || null, request);
  return NextResponse.json({ ok: true, retryAfter }, { status: 202 });
}
