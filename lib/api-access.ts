import { billingPlans, commerceService, commercialSubject, ensureBillingSchema } from "./billing";
import { getDatabase, hashAuthToken, type AppUser } from "./auth";

export type ApiKeyRecord = {
  id: string;
  name: string;
  keyPrefix: string;
  status: "active" | "revoked";
  lastUsedAt: number | null;
  createdAt: number;
  revokedAt: number | null;
};

export function apiRequestLimit(plan: AppUser["plan"]): number {
  return billingPlans[plan].apiRequestLimit;
}

export function activeApiKeyLimit(plan: AppUser["plan"]): number {
  return billingPlans[plan].apiKeyLimit;
}

export function hasApiAccess(plan: AppUser["plan"]): boolean {
  return billingPlans[plan].apiAccess;
}

export async function ensureApiAccessSchema(): Promise<void> {
  await ensureBillingSchema();
  getDatabase().exec(`
    CREATE TABLE IF NOT EXISTS api_access_keys (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      organization_id TEXT REFERENCES identity_organizations(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      key_prefix TEXT NOT NULL UNIQUE,
      secret_hash TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','revoked')),
      last_used_at INTEGER,
      created_at INTEGER NOT NULL,
      revoked_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS api_access_keys_user_idx ON api_access_keys(user_id,status,created_at);
    CREATE TABLE IF NOT EXISTS api_request_events (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      key_id TEXT NOT NULL REFERENCES api_access_keys(id) ON DELETE CASCADE,
      route TEXT NOT NULL,
      method TEXT NOT NULL,
      status_code INTEGER NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS api_request_events_user_idx ON api_request_events(user_id,created_at);
    CREATE TABLE IF NOT EXISTS api_webhooks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      url TEXT NOT NULL,
      event_types TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'paused' CHECK(status IN ('paused','active','disabled')),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS api_webhooks_user_idx ON api_webhooks(user_id,status,created_at);
  `);
  const keyColumns=getDatabase().prepare("PRAGMA table_info(api_access_keys)").all<{name:string}>().results;
  if(!keyColumns.some(column=>column.name==="organization_id"))getDatabase().exec("ALTER TABLE api_access_keys ADD COLUMN organization_id TEXT");
  getDatabase().exec("UPDATE api_access_keys SET organization_id=COALESCE(organization_id,(SELECT organization_id FROM identity_memberships WHERE user_id=api_access_keys.user_id AND status='active' ORDER BY created_at LIMIT 1))");
}

function randomHex(size: number): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(size)), byte => byte.toString(16).padStart(2,"0")).join("");
}

export async function createApiKey(user: AppUser, name: string): Promise<{record:ApiKeyRecord;plainTextKey:string}> {
  await ensureApiAccessSchema();
  try{commerceService().authorize(commercialSubject(user),"apiAccess");}catch{throw new Error("PLAN_REQUIRED");}
  const db = getDatabase();
  const active = db.prepare("SELECT COUNT(*) AS total FROM api_access_keys WHERE user_id=? AND status='active'").bind(user.id).first<{total:number}>()?.total || 0;
  try{commerceService().authorize(commercialSubject(user),"apiKeys",1,active);}catch{throw new Error("KEY_LIMIT_REACHED");}
  const prefix = randomHex(4);
  const secret = randomHex(24);
  const plainTextKey = `osseo_live_${prefix}_${secret}`;
  const record: ApiKeyRecord = {id:crypto.randomUUID(),name:name.trim().slice(0,60)||"默认密钥",keyPrefix:prefix,status:"active",lastUsedAt:null,createdAt:Math.floor(Date.now()/1000),revokedAt:null};
  db.prepare("INSERT INTO api_access_keys (id,user_id,organization_id,name,key_prefix,secret_hash,status,created_at) VALUES (?,?,?,?,?,?,'active',?)")
    .bind(record.id,user.id,user.organization.organizationId,record.name,record.keyPrefix,await hashAuthToken(plainTextKey),record.createdAt).run();
  return {record,plainTextKey};
}

export async function authenticateApiRequest(request: Request): Promise<{user:AppUser;key:ApiKeyRecord}|null> {
  await ensureApiAccessSchema();
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token || !token.startsWith("osseo_live_")) return null;
  const now = Math.floor(Date.now()/1000);
  const row = getDatabase().prepare(`
    SELECT k.id,k.name,k.key_prefix AS keyPrefix,k.status,k.last_used_at AS lastUsedAt,k.created_at AS createdAt,k.revoked_at AS revokedAt,
      u.id AS userId,u.email,u.name AS userName,u.role,u.status AS userStatus,u.plan,u.trial_ends_at AS trialEndsAt,u.email_verified_at AS emailVerifiedAt,u.created_at AS userCreatedAt,
      o.id AS organizationId,o.name AS organizationName,o.slug AS organizationSlug,o.status AS organizationStatus,
      m.id AS membershipId,m.status AS membershipStatus,r.role_key AS roleKey
    FROM api_access_keys k JOIN users u ON u.id=k.user_id
    JOIN identity_organizations o ON o.id=k.organization_id
    JOIN identity_memberships m ON m.organization_id=o.id AND m.user_id=u.id AND m.status='active'
    JOIN identity_roles r ON r.id=m.role_id
    WHERE k.secret_hash=? AND k.status='active' AND u.status='active' AND o.status IN ('trial','active') LIMIT 1
  `).bind(await hashAuthToken(token)).first<Record<string,unknown>>();
  if (!row || !hasApiAccess(row.plan as AppUser["plan"])) return null;
  const authenticatedUser:AppUser={id:String(row.userId),email:String(row.email),name:String(row.userName),role:row.role as AppUser["role"],status:row.userStatus as AppUser["status"],plan:row.plan as AppUser["plan"],trialEndsAt:row.trialEndsAt as number|null,emailVerifiedAt:row.emailVerifiedAt as number|null,createdAt:Number(row.userCreatedAt),organization:{organizationId:String(row.organizationId),organizationName:String(row.organizationName),organizationSlug:String(row.organizationSlug),organizationStatus:row.organizationStatus as AppUser["organization"]["organizationStatus"],membershipId:String(row.membershipId),membershipStatus:row.membershipStatus as AppUser["organization"]["membershipStatus"],roleKey:String(row.roleKey)}};
  let effective;try{effective=commerceService().authorize(commercialSubject(authenticatedUser),"apiAccess");}catch{return null;}
  const used = getDatabase().prepare("SELECT COALESCE(SUM(quantity),0) AS total FROM api_request_events WHERE user_id=? AND created_at>=?")
    .bind(row.userId,Math.floor(new Date(new Date().getFullYear(),new Date().getMonth(),1).getTime()/1000)).first<{total:number}>()?.total || 0;
  if (used >= effective.limits.apiRequests) return null;
  getDatabase().prepare("UPDATE api_access_keys SET last_used_at=? WHERE id=?").bind(now,row.id).run();
  return {
    user:authenticatedUser,
    key:{id:String(row.id),name:String(row.name),keyPrefix:String(row.keyPrefix),status:"active",lastUsedAt:row.lastUsedAt as number|null,createdAt:Number(row.createdAt),revokedAt:row.revokedAt as number|null},
  };
}

export function recordApiRequest(userId:string,keyId:string,request:Request,statusCode:number): void {
  getDatabase().prepare("INSERT INTO api_request_events (id,user_id,key_id,route,method,status_code,quantity,created_at) VALUES (?,?,?,?,?,?,1,?)")
    .bind(crypto.randomUUID(),userId,keyId,new URL(request.url).pathname,request.method,statusCode,Math.floor(Date.now()/1000)).run();
}
