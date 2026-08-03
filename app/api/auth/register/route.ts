import { NextResponse } from "next/server";
import { createSessionToken, ensureAuthSchema, getDatabase, ownerEmail, persistSession, safeReturnTo, setSessionCookie, tooManyAttempts, writeAudit } from "../../../../lib/auth";
import { validEmailCode } from "../../../../lib/email-code";
import { hashPassword, validatePassword } from "../../../../lib/password";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  if (await tooManyAttempts("register", request)) return NextResponse.json({ error: "操作过于频繁，请 15 分钟后重试" }, { status: 429 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 60) : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase().slice(0, 254) : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  const returnTo = safeReturnTo(body?.returnTo);
  if (name.length < 2) return NextResponse.json({ error: "请输入至少 2 个字符的姓名" }, { status: 400 });
  if (!emailPattern.test(email)) return NextResponse.json({ error: "请输入有效的邮箱地址" }, { status: 400 });
  const passwordError = validatePassword(password);
  if (passwordError) return NextResponse.json({ error: passwordError }, { status: 400 });
  if (!/^\d{6}$/.test(code)) return NextResponse.json({ error: "请输入 6 位邮箱验证码" }, { status: 400 });
  if (body?.acceptedTerms !== true) return NextResponse.json({ error: "请阅读并同意服务条款和隐私政策" }, { status: 400 });

  const database = getDatabase();
  await ensureAuthSchema(database);
  const existing = await database.prepare("SELECT id FROM users WHERE email = ? LIMIT 1").bind(email).first<{ id: string }>();
  if (existing) {
    await writeAudit("register_failed", existing.id, request, "duplicate_email");
    return NextResponse.json({ error: "该邮箱已注册，请直接登录" }, { status: 409 });
  }
  const emailCode = await validEmailCode(email, "register", code, request);
  if (!emailCode) return NextResponse.json({ error: "邮箱验证码错误或已过期" }, { status: 400 });

  const now = Math.floor(Date.now() / 1000);
  const userId = crypto.randomUUID();
  const role = email === ownerEmail() ? "admin" : "user";
  const trialEndsAt = now + 14 * 24 * 60 * 60;
  database.exec("BEGIN IMMEDIATE");
  try {
    const consumed = await database.prepare("UPDATE email_codes SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL")
      .bind(now, emailCode.id).run();
    if (!consumed.meta.changes) throw new Error("CODE_ALREADY_USED");
    await database.prepare(`
      INSERT INTO users (id, email, name, password_hash, role, status, plan, trial_ends_at, email_verified_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'active', 'trial', ?, ?, ?, ?)
    `).bind(userId, email, name, await hashPassword(password), role, trialEndsAt, now, now, now).run();
    database.exec("COMMIT");
  } catch {
    database.exec("ROLLBACK");
    return NextResponse.json({ error: "验证码已使用，请重新获取" }, { status: 409 });
  }
  const token = createSessionToken();
  const expiresAt = await persistSession(userId, token);
  await setSessionCookie(token, expiresAt);
  await writeAudit("register_success", userId, request, role);
  return NextResponse.json({ ok: true, returnTo, user: { id: userId, email, name, role, plan: "trial" } }, { status: 201 });
}
