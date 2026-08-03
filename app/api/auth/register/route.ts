import { NextResponse } from "next/server";
import { ensureAuthSchema, getDatabase, ownerEmail, safeReturnTo, tooManyAttempts, writeAudit } from "../../../../lib/auth";
import { issueEmailVerification, type VerificationUser } from "../../../../lib/email-verification";
import { hashPassword, validatePassword } from "../../../../lib/password";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  if (await tooManyAttempts("register", request)) return NextResponse.json({ error: "操作过于频繁，请 15 分钟后重试" }, { status: 429 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 60) : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase().slice(0, 254) : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const returnTo = safeReturnTo(body?.returnTo);
  if (name.length < 2) return NextResponse.json({ error: "请输入至少 2 个字符的姓名" }, { status: 400 });
  if (!emailPattern.test(email)) return NextResponse.json({ error: "请输入有效的邮箱地址" }, { status: 400 });
  const passwordError = validatePassword(password);
  if (passwordError) return NextResponse.json({ error: passwordError }, { status: 400 });
  if (body?.acceptedTerms !== true) return NextResponse.json({ error: "请阅读并同意服务条款和隐私政策" }, { status: 400 });

  const database = getDatabase();
  await ensureAuthSchema(database);
  const existing = await database.prepare(`
    SELECT id, email, name, email_verified_at AS emailVerifiedAt FROM users WHERE email = ? LIMIT 1
  `).bind(email).first<VerificationUser>();
  if (existing) {
    if (existing.emailVerifiedAt) {
      await writeAudit("register_failed", existing.id, request, "duplicate_email");
      return NextResponse.json({ error: "该邮箱已注册，请直接登录" }, { status: 409 });
    }
    const delivery = await issueEmailVerification(existing, request);
    return NextResponse.json({ ok: true, verificationRequired: true, email, retryAfter: delivery.retryAfter || 60 }, { status: 202 });
  }

  const now = Math.floor(Date.now() / 1000);
  const userId = crypto.randomUUID();
  const role = email === ownerEmail() ? "admin" : "user";
  const trialEndsAt = now + 14 * 24 * 60 * 60;
  await database.prepare(`
    INSERT INTO users (id, email, name, password_hash, role, status, plan, trial_ends_at, email_verified_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'active', 'trial', ?, NULL, ?, ?)
  `).bind(userId, email, name, await hashPassword(password), role, trialEndsAt, now, now).run();
  await issueEmailVerification({ id: userId, email, name }, request);
  await writeAudit("register_pending_verification", userId, request, role);
  return NextResponse.json({ ok: true, verificationRequired: true, email, returnTo, retryAfter: 60 }, { status: 202 });
}
