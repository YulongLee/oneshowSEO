import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { database, type AppDatabase } from "./database";
import { SqliteIdentityAuthRepository } from "../platform/adapters/sqlite/identity-auth-repository";
import { createOpaqueToken, hashIdentityToken, safeReturnDestination } from "../platform/modules/identity/authentication";

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
  organization: {
    organizationId: string;
    organizationName: string;
    organizationSlug: string;
    organizationStatus: "trial" | "active" | "past_due" | "restricted" | "suspended";
    membershipId: string;
    membershipStatus: "active" | "suspended" | "revoked";
    roleKey: string;
  };
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
    CREATE TABLE IF NOT EXISTS identity_organizations (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE COLLATE NOCASE,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'trial' CHECK(status IN ('trial','active','past_due','restricted','suspended')),
      default_locale TEXT NOT NULL DEFAULT 'zh-CN' CHECK(default_locale IN ('zh-CN','en')),
      timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai',
      owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS identity_organizations_owner_idx ON identity_organizations(owner_user_id);
    CREATE TABLE IF NOT EXISTS identity_roles (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES identity_organizations(id) ON DELETE CASCADE,
      role_key TEXT NOT NULL,
      name TEXT NOT NULL,
      permissions TEXT NOT NULL DEFAULT '[]',
      is_system INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(organization_id,role_key)
    );
    CREATE TABLE IF NOT EXISTS identity_memberships (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES identity_organizations(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role_id TEXT NOT NULL REFERENCES identity_roles(id) ON DELETE RESTRICT,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended','revoked')),
      joined_at INTEGER,
      suspended_at INTEGER,
      revoked_at INTEGER,
      project_scope TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(organization_id,user_id)
    );
    CREATE INDEX IF NOT EXISTS identity_memberships_user_status_idx ON identity_memberships(user_id,status);
    CREATE INDEX IF NOT EXISTS identity_memberships_org_status_idx ON identity_memberships(organization_id,status);
    CREATE TABLE IF NOT EXISTS identity_invitations (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES identity_organizations(id) ON DELETE CASCADE,
      email TEXT NOT NULL COLLATE NOCASE,
      role_key TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','cancelled','expired')),
      invited_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      expires_at INTEGER NOT NULL,
      accepted_at INTEGER,
      cancelled_at INTEGER,
      project_scope TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS identity_invitations_pending_email_idx ON identity_invitations(organization_id,email) WHERE status='pending';
    CREATE INDEX IF NOT EXISTS identity_invitations_org_status_idx ON identity_invitations(organization_id,status,expires_at);
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      active_organization_id TEXT REFERENCES identity_organizations(id) ON DELETE CASCADE,
      membership_id TEXT REFERENCES identity_memberships(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','rotated','revoked','expired')),
      expires_at INTEGER NOT NULL,
      rotated_from_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
      revoked_at INTEGER,
      last_seen_at INTEGER,
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
  const sessionColumns = await database.prepare("PRAGMA table_info(sessions)").all<{ name: string }>();
  const membershipColumns = await database.prepare("PRAGMA table_info(identity_memberships)").all<{ name: string }>();
  if (!membershipColumns.results.some((column) => column.name === "project_scope")) database.exec("ALTER TABLE identity_memberships ADD COLUMN project_scope TEXT NOT NULL DEFAULT '[]'");
  if (!sessionColumns.results.some((column) => column.name === "status")) database.exec("ALTER TABLE sessions ADD COLUMN status TEXT NOT NULL DEFAULT 'active'");
  if (!sessionColumns.results.some((column) => column.name === "rotated_from_id")) database.exec("ALTER TABLE sessions ADD COLUMN rotated_from_id TEXT");
  if (!sessionColumns.results.some((column) => column.name === "revoked_at")) database.exec("ALTER TABLE sessions ADD COLUMN revoked_at INTEGER");
  if (!sessionColumns.results.some((column) => column.name === "last_seen_at")) database.exec("ALTER TABLE sessions ADD COLUMN last_seen_at INTEGER");
  if (!sessionColumns.results.some((column) => column.name === "active_organization_id")) database.exec("ALTER TABLE sessions ADD COLUMN active_organization_id TEXT");
  if (!sessionColumns.results.some((column) => column.name === "membership_id")) database.exec("ALTER TABLE sessions ADD COLUMN membership_id TEXT");
  database.exec(`
    INSERT OR IGNORE INTO identity_organizations (id,slug,name,status,owner_user_id,created_at,updated_at)
    SELECT 'org_'||id,'workspace-'||substr(lower(replace(id,'-','')),1,12),name||' Workspace',CASE WHEN plan='trial' THEN 'trial' ELSE 'active' END,id,created_at,updated_at FROM users;
    INSERT OR IGNORE INTO identity_roles (id,organization_id,role_key,name,permissions,is_system,created_at,updated_at)
    SELECT 'role_owner_'||id,'org_'||id,'owner','Owner','["*"]',1,created_at,updated_at FROM users;
    INSERT OR IGNORE INTO identity_memberships (id,organization_id,user_id,role_id,status,joined_at,created_at,updated_at)
    SELECT 'membership_owner_'||id,'org_'||id,id,'role_owner_'||id,'active',created_at,created_at,updated_at FROM users;
    UPDATE sessions SET active_organization_id='org_'||user_id,membership_id='membership_owner_'||user_id
    WHERE active_organization_id IS NULL OR membership_id IS NULL;
  `);
  database.exec("CREATE INDEX IF NOT EXISTS sessions_status_expiry_idx ON sessions(status,expires_at)");
  database.exec("CREATE INDEX IF NOT EXISTS sessions_org_status_expiry_idx ON sessions(active_organization_id,status,expires_at)");
}

export async function hashAuthToken(token: string): Promise<string> {
  return hashIdentityToken(token);
}

export function createSessionToken(): string {
  return createOpaqueToken();
}

export async function persistSession(userId: string, token: string): Promise<number> {
  const database = getDatabase();
  await ensureAuthSchema(database);
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + SESSION_AGE_SECONDS;
  const repository = new SqliteIdentityAuthRepository(database);
  const organization = await repository.activeOrganization(userId,null,null);
  if (!organization) throw new Error("ACTIVE_ORGANIZATION_REQUIRED");
  await repository.rotateSession({accountId:userId,organizationId:organization.organizationId,membershipId:organization.membershipId,tokenHash:await hashAuthToken(token),previousTokenHash:null,expiresAt,now});
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
    await new SqliteIdentityAuthRepository(database).revokeSession(await hashAuthToken(token),Math.floor(Date.now()/1000));
  }
  store.delete(SESSION_COOKIE);
}

export async function getCurrentUser(): Promise<AppUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const database = getDatabase();
  await ensureAuthSchema(database);
  const now = Math.floor(Date.now() / 1000);
  const record = await new SqliteIdentityAuthRepository(database).accountBySession(await hashAuthToken(token),now) as AppUser | null;
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
  return adminEmails()[0];
}

export function adminEmails(): string[] {
  const configured = process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || "1797358496@qq.com";
  return [...new Set(configured.split(",").map((email) => email.trim().toLowerCase()).filter(Boolean))];
}

export function isAdminEmail(email: string): boolean {
  return adminEmails().includes(email.trim().toLowerCase());
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
  return safeReturnDestination(value);
}
