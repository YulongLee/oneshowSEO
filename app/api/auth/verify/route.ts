import { NextResponse } from "next/server";
import { ensureAuthSchema, getDatabase, hashAuthToken, writeAudit } from "../../../../lib/auth";

function redirectUrl(request: Request, status: "verified" | "invalid"): URL {
  const base = process.env.APP_URL || new URL(request.url).origin;
  return new URL(`/login?activation=${status}`, base);
}

export async function GET(request: Request) {
  const rawToken = new URL(request.url).searchParams.get("token") || "";
  if (!rawToken) return NextResponse.redirect(redirectUrl(request, "invalid"));
  const database = getDatabase();
  await ensureAuthSchema(database);
  const now = Math.floor(Date.now() / 1000);
  const token = await database.prepare(`
    SELECT id, user_id AS userId FROM email_verification_tokens
    WHERE token_hash = ? AND consumed_at IS NULL AND expires_at > ? LIMIT 1
  `).bind(await hashAuthToken(rawToken), now).first<{ id: string; userId: string }>();
  if (!token) {
    await writeAudit("verification_failed", null, request, "invalid_or_expired");
    return NextResponse.redirect(redirectUrl(request, "invalid"));
  }

  database.exec("BEGIN IMMEDIATE");
  try {
    const consumed = await database.prepare(`
      UPDATE email_verification_tokens SET consumed_at = ?
      WHERE id = ? AND consumed_at IS NULL AND expires_at > ?
    `).bind(now, token.id, now).run();
    if (!consumed.meta.changes) throw new Error("TOKEN_ALREADY_CONSUMED");
    await database.prepare("UPDATE users SET email_verified_at = ?, updated_at = ? WHERE id = ?")
      .bind(now, now, token.userId).run();
    database.exec("COMMIT");
  } catch {
    database.exec("ROLLBACK");
    await writeAudit("verification_failed", token.userId, request, "already_consumed");
    return NextResponse.redirect(redirectUrl(request, "invalid"));
  }
  await writeAudit("verification_success", token.userId, request);
  return NextResponse.redirect(redirectUrl(request, "verified"));
}
