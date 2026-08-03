import { consumeRateLimit, ensureAuthSchema, getDatabase, hashAuthToken, writeAudit } from "./auth";
import { sendEmailCode, type EmailCodePurpose } from "./email";

const CODE_AGE_SECONDS = 10 * 60;
const RESEND_COOLDOWN_SECONDS = 60;
const MAX_ATTEMPTS = 5;

export async function issueEmailCode(email: string, purpose: EmailCodePurpose, request: Request): Promise<{ sent: boolean; retryAfter: number }> {
  const database = getDatabase();
  await ensureAuthSchema(database);
  const now = Math.floor(Date.now() / 1000);
  const latest = await database.prepare(`
    SELECT created_at AS createdAt FROM email_codes
    WHERE email = ? AND purpose = ? AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 1
  `).bind(email, purpose).first<{ createdAt: number }>();
  if (latest && latest.createdAt + RESEND_COOLDOWN_SECONDS > now) {
    return { sent: false, retryAfter: latest.createdAt + RESEND_COOLDOWN_SECONDS - now };
  }
  if (await consumeRateLimit(`email-code-${purpose}`, email, request, 5, 60 * 60)) {
    await writeAudit("email_code_rate_limited", null, request, purpose);
    return { sent: false, retryAfter: 60 * 60 };
  }

  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  const code = String(values[0] % 1_000_000).padStart(6, "0");
  const id = crypto.randomUUID();
  await database.prepare("UPDATE email_codes SET consumed_at = ? WHERE email = ? AND purpose = ? AND consumed_at IS NULL")
    .bind(now, email, purpose).run();
  await database.prepare(`
    INSERT INTO email_codes (id, email, purpose, code_hash, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(id, email, purpose, await hashAuthToken(code), now + CODE_AGE_SECONDS, now).run();
  try {
    await sendEmailCode(email, code, purpose);
  } catch (error) {
    await database.prepare("UPDATE email_codes SET consumed_at = ? WHERE id = ?").bind(now, id).run();
    await writeAudit("email_code_delivery_failed", null, request, purpose);
    throw error;
  }
  await writeAudit("email_code_sent", null, request, purpose);
  return { sent: true, retryAfter: RESEND_COOLDOWN_SECONDS };
}

export async function validEmailCode(email: string, purpose: EmailCodePurpose, code: string, request: Request): Promise<{ id: string } | null> {
  const database = getDatabase();
  await ensureAuthSchema(database);
  const now = Math.floor(Date.now() / 1000);
  const record = await database.prepare(`
    SELECT id, code_hash AS codeHash, attempts FROM email_codes
    WHERE email = ? AND purpose = ? AND consumed_at IS NULL AND expires_at > ?
    ORDER BY created_at DESC LIMIT 1
  `).bind(email, purpose, now).first<{ id: string; codeHash: string; attempts: number }>();
  if (!record || record.attempts >= MAX_ATTEMPTS) return null;
  if (record.codeHash !== await hashAuthToken(code)) {
    await database.prepare("UPDATE email_codes SET attempts = attempts + 1 WHERE id = ?").bind(record.id).run();
    await writeAudit("email_code_failed", null, request, purpose);
    return null;
  }
  return { id: record.id };
}
