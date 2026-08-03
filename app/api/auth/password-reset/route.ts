import { NextResponse } from "next/server";
import { ensureAuthSchema, getDatabase, writeAudit } from "../../../../lib/auth";
import { validEmailCode } from "../../../../lib/email-code";
import { hashPassword, validatePassword } from "../../../../lib/password";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase().slice(0, 254) : "";
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!/^\d{6}$/.test(code)) return NextResponse.json({ error: "请输入 6 位邮箱验证码" }, { status: 400 });
  const passwordError = validatePassword(password);
  if (passwordError) return NextResponse.json({ error: passwordError }, { status: 400 });

  const database = getDatabase();
  await ensureAuthSchema(database);
  const user = await database.prepare("SELECT id FROM users WHERE email = ? AND status = 'active' AND email_verified_at IS NOT NULL LIMIT 1")
    .bind(email).first<{ id: string }>();
  const emailCode = user ? await validEmailCode(email, "password_reset", code, request) : null;
  if (!user || !emailCode) return NextResponse.json({ error: "邮箱验证码错误或已过期" }, { status: 400 });

  const now = Math.floor(Date.now() / 1000);
  database.exec("BEGIN IMMEDIATE");
  try {
    const consumed = await database.prepare("UPDATE email_codes SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL")
      .bind(now, emailCode.id).run();
    if (!consumed.meta.changes) throw new Error("CODE_ALREADY_USED");
    await database.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?")
      .bind(await hashPassword(password), now, user.id).run();
    await database.prepare("DELETE FROM sessions WHERE user_id = ?").bind(user.id).run();
    database.exec("COMMIT");
  } catch {
    database.exec("ROLLBACK");
    return NextResponse.json({ error: "验证码已使用，请重新获取" }, { status: 409 });
  }
  await writeAudit("password_reset_success", user.id, request);
  return NextResponse.json({ ok: true });
}
