import { NextResponse } from "next/server";
import { createSessionToken, ensureAuthSchema, getDatabase, persistSession, safeReturnTo, setSessionCookie, tooManyAttempts, writeAudit } from "../../../../lib/auth";
import { verifyPassword } from "../../../../lib/password";

type LoginUser = { id: string; email: string; name: string; passwordHash: string; role: "user" | "admin"; status: "active" | "suspended"; plan: string };

export async function POST(request: Request) {
  if (await tooManyAttempts("login", request)) return NextResponse.json({ error: "登录尝试过多，请 15 分钟后重试" }, { status: 429 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase().slice(0, 254) : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const returnTo = safeReturnTo(body?.returnTo);
  const database = getDatabase();
  await ensureAuthSchema(database);
  const user = await database.prepare(`SELECT id, email, name, password_hash AS passwordHash, role, status, plan FROM users WHERE email = ? LIMIT 1`)
    .bind(email).first<LoginUser>();
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    await writeAudit("login_failed", user?.id || null, request, "invalid_credentials");
    return NextResponse.json({ error: "邮箱或密码错误" }, { status: 401 });
  }
  if (user.status !== "active") {
    await writeAudit("login_failed", user.id, request, "suspended");
    return NextResponse.json({ error: "账号已暂停，请联系管理员" }, { status: 403 });
  }
  const now = Math.floor(Date.now() / 1000);
  await database.prepare("UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?").bind(now, now, user.id).run();
  const token = createSessionToken();
  const expiresAt = await persistSession(user.id, token);
  await setSessionCookie(token, expiresAt);
  await writeAudit("login_success", user.id, request);
  return NextResponse.json({ ok: true, returnTo, user: { id: user.id, email: user.email, name: user.name, role: user.role, plan: user.plan } });
}
