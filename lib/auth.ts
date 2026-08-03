import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { database, type AppDatabase } from "./database";

export const SESSION_COOKIE = "osseo_session";
const SESSION_AGE_SECONDS = 60 * 60 * 24 * 30;

export type AppUser = {
  id: string;
  email: string;
  name: string;
  role: "user" | "admin";
  status: "active" | "suspended";
  plan: "trial" | "starter" | "pro" | "business";
  trialEndsAt: number | null;
  emailVerifiedAt: number | null;
  createdAt: number;
};

export function getDatabase(): AppDatabase { return database(); }

export async function ensureAuthSchema(database = getDatabase()): Promise<void> {
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','admin')),
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended')),
      plan TEXT NOT NULL DEFAULT 'trial' CHECK(plan IN ('trial','starter','pro','business')),
      trial_ends_at INTEGER,
      email_verified_at INTEGER,
      last_login_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions(expires_at);
    CREATE TABLE IF NOT EXISTS email_verification_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at INTEGER NOT NULL,
      consumed_at INTEGER,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS email_verification_user_idx ON email_verification_tokens(user_id, created_at);
    CREATE INDEX IF NOT EXISTS email_verification_expiry_idx ON email_verification_tokens(expires_at);
    CREATE TABLE IF NOT EXISTS rate_limits (
      key TEXT PRIMARY KEY,
      window_started_at INTEGER NOT NULL,
      attempts INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS email_outbox (
      id TEXT PRIMARY KEY,
      recipient TEXT NOT NULL,
      kind TEXT NOT NULL,
      subject TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS email_codes (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      purpose TEXT NOT NULL CHECK(purpose IN ('register','password_reset')),
      code_hash TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      consumed_at INTEGER,
      attempts INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS email_codes_lookup_idx ON email_codes(email, purpose, created_at);
    CREATE INDEX IF NOT EXISTS email_codes_expiry_idx ON email_codes(expires_at);
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      action TEXT NOT NULL,
      detail TEXT,
      ip TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS audit_action_idx ON audit_logs(action, created_at);
  `);
  const columns = await database.prepare("PRAGMA table_info(users)").all<{ name: string }>();
  if (!columns.results.some((column) => column.name === "email_verified_at")) {
    database.exec("ALTER TABLE users ADD COLUMN email_verified_at INTEGER");
    database.exec("UPDATE users SET email_verified_at = COALESCE(updated_at, created_at) WHERE email_verified_at IS NULL");
  }
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function hashAuthToken(token: string): Promise<string> {
  return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))));
}

export function createSessionToken(): string {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
}

export async function persistSession(userId: string, token: string): Promise<number> {
  const database = getDatabase();
  await ensureAuthSchema(database);
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + SESSION_AGE_SECONDS;
  await database.prepare("INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
    .bind(await hashAuthToken(token), userId, expiresAt, now).run();
  return expiresAt;
}

export async function setSessionCookie(token: string, expiresAt: number): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(expiresAt * 1000),
  });
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    const database = getDatabase();
    await ensureAuthSchema(database);
    await database.prepare("DELETE FROM sessions WHERE id = ?").bind(await hashAuthToken(token)).run();
  }
  store.delete(SESSION_COOKIE);
}

export async function getCurrentUser(): Promise<AppUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const database = getDatabase();
  await ensureAuthSchema(database);
  const now = Math.floor(Date.now() / 1000);
  const record = await database.prepare(`
    SELECT u.id, u.email, u.name, u.role, u.status, u.plan,
           u.trial_ends_at AS trialEndsAt, u.email_verified_at AS emailVerifiedAt,
           u.created_at AS createdAt
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.id = ? AND s.expires_at > ? LIMIT 1
  `).bind(await hashAuthToken(token), now).first<AppUser>();
  if (!record || record.status !== "active") return null;
  return record;
}

export async function requireUser(returnTo = "/workspace"): Promise<AppUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  return user;
}

export async function requireAdmin(): Promise<AppUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?returnTo=%2Fadmin");
  if (user.role !== "admin") redirect("/workspace");
  return user;
}

export function ownerEmail(): string {
  return (process.env.ADMIN_EMAIL || "1797358496@qq.com").toLowerCase();
}

export async function writeAudit(action: string, userId: string | null, request: Request, detail?: string): Promise<void> {
  const database = getDatabase();
  await ensureAuthSchema(database);
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local";
  await database.prepare("INSERT INTO audit_logs (id, user_id, action, detail, ip, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), userId, action, detail || null, ip, Math.floor(Date.now() / 1000)).run();
}

export async function tooManyAttempts(action: string, request: Request): Promise<boolean> {
  const database = getDatabase();
  await ensureAuthSchema(database);
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local";
  const since = Math.floor(Date.now() / 1000) - 15 * 60;
  const result = await database.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action = ? AND ip = ? AND created_at > ?")
    .bind(`${action}_failed`, ip, since).first<{ count: number }>();
  return Number(result?.count || 0) >= 8;
}

export async function consumeRateLimit(
  scope: string,
  subject: string,
  request: Request,
  maximum = 5,
  windowSeconds = 60 * 60,
): Promise<boolean> {
  const database = getDatabase();
  await ensureAuthSchema(database);
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local";
  const key = await hashAuthToken(`${scope}:${subject.toLowerCase()}:${ip}`);
  const now = Math.floor(Date.now() / 1000);
  const current = await database.prepare("SELECT window_started_at AS windowStartedAt, attempts FROM rate_limits WHERE key = ?")
    .bind(key).first<{ windowStartedAt: number; attempts: number }>();
  if (!current || current.windowStartedAt + windowSeconds <= now) {
    await database.prepare(`
      INSERT INTO rate_limits (key, window_started_at, attempts) VALUES (?, ?, 1)
      ON CONFLICT(key) DO UPDATE SET window_started_at = excluded.window_started_at, attempts = 1
    `).bind(key, now).run();
    return false;
  }
  if (current.attempts >= maximum) return true;
  await database.prepare("UPDATE rate_limits SET attempts = attempts + 1 WHERE key = ?").bind(key).run();
  return false;
}

export function safeReturnTo(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return "/workspace";
  return value.startsWith("/login") || value.startsWith("/register") ? "/workspace" : value;
}
