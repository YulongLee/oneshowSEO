import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { POST as resetPassword } from "../app/api/auth/password-reset/route";
import { ensureAuthSchema, getDatabase } from "../lib/auth";
import { issueEmailCode, validEmailCode } from "../lib/email-code";
import { hashPassword, verifyPassword } from "../lib/password";

process.env.NODE_ENV = "test";
process.env.EMAIL_PROVIDER = "outbox";
process.env.APP_URL = "https://oneshowseo.test";
process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), "oneshowseo-email-")), "test.sqlite");

const request = (path = "/api/auth/send-code") => new Request(`https://oneshowseo.test${path}`, {
  method: "POST",
  headers: { "content-type": "application/json", "x-forwarded-for": "192.0.2.8" },
});

async function latestCode(email: string, kind: string): Promise<string> {
  const mail = await getDatabase().prepare("SELECT text FROM email_outbox WHERE recipient = ? AND kind = ? ORDER BY created_at DESC LIMIT 1")
    .bind(email, kind).first<{ text: string }>();
  const code = mail?.text.match(/\b\d{6}\b/)?.[0];
  assert.ok(code);
  return code;
}

test("registration codes are six digits, expire, and allow at most one use", async () => {
  const email = "register-code@oneshowseo.test";
  await ensureAuthSchema();
  const issued = await issueEmailCode(email, "register", request());
  assert.equal(issued.sent, true);
  const code = await latestCode(email, "register");
  assert.match(code, /^\d{6}$/);
  assert.equal(await validEmailCode(email, "register", "000000" === code ? "000001" : "000000", request()), null);
  const valid = await validEmailCode(email, "register", code, request());
  assert.ok(valid?.id);
  await getDatabase().prepare("UPDATE email_codes SET consumed_at = ? WHERE id = ?").bind(Math.floor(Date.now() / 1000), valid!.id).run();
  assert.equal(await validEmailCode(email, "register", code, request()), null);
});

test("password reset requires an emailed code and invalidates sessions", async () => {
  const database = getDatabase();
  await ensureAuthSchema(database);
  const email = "password-reset@oneshowseo.test";
  const now = Math.floor(Date.now() / 1000);
  const userId = crypto.randomUUID();
  await database.prepare(`
    INSERT INTO users (id, email, name, password_hash, role, status, plan, email_verified_at, created_at, updated_at)
    VALUES (?, ?, 'Reset Test', ?, 'user', 'active', 'trial', ?, ?, ?)
  `).bind(userId, email, await hashPassword("OldPassword2026!"), now, now, now).run();
  await database.prepare("INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES ('test-session', ?, ?, ?)")
    .bind(userId, now + 3600, now).run();

  await issueEmailCode(email, "password_reset", request());
  const code = await latestCode(email, "password_reset");
  const response = await resetPassword(new Request("https://oneshowseo.test/api/auth/password-reset", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "192.0.2.9" },
    body: JSON.stringify({ email, code, password: "NewPassword2026!" }),
  }));
  assert.equal(response.status, 200);
  const user = await database.prepare("SELECT password_hash AS passwordHash FROM users WHERE id = ?")
    .bind(userId).first<{ passwordHash: string }>();
  assert.equal(await verifyPassword("NewPassword2026!", user!.passwordHash), true);
  assert.equal((await database.prepare("SELECT COUNT(*) AS count FROM sessions WHERE user_id = ?").bind(userId).first<{ count: number }>())?.count, 0);
});
