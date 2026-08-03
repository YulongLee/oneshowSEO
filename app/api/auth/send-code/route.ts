import { NextResponse } from "next/server";
import { ensureAuthSchema, getDatabase, writeAudit } from "../../../../lib/auth";
import { issueEmailCode } from "../../../../lib/email-code";
import type { EmailCodePurpose } from "../../../../lib/email";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase().slice(0, 254) : "";
  const purpose = body?.purpose === "password_reset" ? "password_reset" : body?.purpose === "register" ? "register" : null;
  if (!emailPattern.test(email)) return NextResponse.json({ error: "请输入有效的邮箱地址" }, { status: 400 });
  if (!purpose) return NextResponse.json({ error: "验证码用途无效" }, { status: 400 });

  const database = getDatabase();
  await ensureAuthSchema(database);
  const user = await database.prepare("SELECT id, email_verified_at AS emailVerifiedAt FROM users WHERE email = ? AND status = 'active' LIMIT 1")
    .bind(email).first<{ id: string; emailVerifiedAt: number | null }>();
  if (purpose === "register" && user) return NextResponse.json({ error: "该邮箱已注册，请直接登录" }, { status: 409 });
  if (purpose === "password_reset" && (!user || !user.emailVerifiedAt)) {
    await writeAudit("password_reset_code_accepted", user?.id || null, request);
    return NextResponse.json({ ok: true, retryAfter: 60 }, { status: 202 });
  }

  const delivery = await issueEmailCode(email, purpose as EmailCodePurpose, request);
  return NextResponse.json({ ok: true, retryAfter: delivery.retryAfter }, { status: 202 });
}
