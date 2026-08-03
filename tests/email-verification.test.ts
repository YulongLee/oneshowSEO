import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { POST as register } from "../app/api/auth/register/route";
import { GET as verify } from "../app/api/auth/verify/route";
import { ensureAuthSchema, getDatabase } from "../lib/auth";

test("registration requires the one-time email activation link", async () => {
  process.env.NODE_ENV = "test";
  process.env.EMAIL_PROVIDER = "outbox";
  process.env.APP_URL = "https://oneshowseo.test";
  process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), "oneshowseo-email-")), "test.sqlite");

  const email = "activation-test@oneshowseo.test";
  const response = await register(new Request("https://oneshowseo.test/api/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "192.0.2.8" },
    body: JSON.stringify({
      name: "Activation Test",
      email,
      password: "Commercial2026!",
      acceptedTerms: true,
    }),
  }));
  assert.equal(response.status, 202);
  assert.equal((await response.json()).verificationRequired, true);

  const database = getDatabase();
  await ensureAuthSchema(database);
  const pending = await database.prepare("SELECT email_verified_at AS verifiedAt FROM users WHERE email = ?")
    .bind(email).first<{ verifiedAt: number | null }>();
  assert.equal(pending?.verifiedAt, null);

  const mail = await database.prepare("SELECT text FROM email_outbox WHERE recipient = ? AND kind = 'verify'")
    .bind(email).first<{ text: string }>();
  assert.ok(mail?.text);
  const activationUrl = new URL(mail.text);
  const verified = await verify(new Request(activationUrl));
  assert.equal(verified.headers.get("location"), "https://oneshowseo.test/login?activation=verified");

  const active = await database.prepare("SELECT email_verified_at AS verifiedAt FROM users WHERE email = ?")
    .bind(email).first<{ verifiedAt: number | null }>();
  assert.ok(active?.verifiedAt);

  const reused = await verify(new Request(activationUrl));
  assert.equal(reused.headers.get("location"), "https://oneshowseo.test/login?activation=invalid");
});
