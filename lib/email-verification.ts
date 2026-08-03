import { consumeRateLimit, createSessionToken, ensureAuthSchema, getDatabase, hashAuthToken, writeAudit } from "./auth";
import { sendVerificationEmail } from "./email";

const TOKEN_AGE_SECONDS = 60 * 60;
const RESEND_COOLDOWN_SECONDS = 60;

export type VerificationUser = { id: string; email: string; name: string; emailVerifiedAt?: number | null };

export async function issueEmailVerification(user: VerificationUser, request: Request): Promise<{ sent: boolean; retryAfter?: number }> {
  const database = getDatabase();
  await ensureAuthSchema(database);
  const now = Math.floor(Date.now() / 1000);
  const latest = await database.prepare(`
    SELECT created_at AS createdAt FROM email_verification_tokens
    WHERE user_id = ? AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 1
  `).bind(user.id).first<{ createdAt: number }>();
  if (latest && latest.createdAt + RESEND_COOLDOWN_SECONDS > now) {
    return { sent: false, retryAfter: latest.createdAt + RESEND_COOLDOWN_SECONDS - now };
  }
  if (await consumeRateLimit("verification-email", user.email, request, 5, 60 * 60)) {
    await writeAudit("verification_rate_limited", user.id, request);
    return { sent: false, retryAfter: 60 * 60 };
  }

  const rawToken = createSessionToken();
  const tokenId = crypto.randomUUID();
  await database.prepare("UPDATE email_verification_tokens SET consumed_at = ? WHERE user_id = ? AND consumed_at IS NULL")
    .bind(now, user.id).run();
  await database.prepare(`
    INSERT INTO email_verification_tokens (id, user_id, token_hash, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).bind(tokenId, user.id, await hashAuthToken(rawToken), now + TOKEN_AGE_SECONDS, now).run();
  try {
    await sendVerificationEmail({ to: user.email, name: user.name, token: rawToken, requestUrl: request.url });
  } catch (error) {
    await database.prepare("UPDATE email_verification_tokens SET consumed_at = ? WHERE id = ?").bind(now, tokenId).run();
    await writeAudit("verification_delivery_failed", user.id, request);
    throw error;
  }
  await writeAudit("verification_email_sent", user.id, request);
  return { sent: true };
}
