import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { ensureAuthSchema } from "../lib/auth";
import { AppDatabase } from "../lib/database";
import { SqliteIdentityAuthRepository } from "../platform/adapters/sqlite/identity-auth-repository";
import { SqliteTenancyRepository } from "../platform/adapters/sqlite/tenancy-repository";
import {
  hashIdentityToken,
  IdentityAuthenticationService,
  IdentityError,
  safeReturnDestination,
  type IdentityAuditPort,
  type PasswordCodec,
} from "../platform/modules/identity/authentication";
import { TenancyError, TenancyService } from "../platform/modules/identity/tenancy";

const passwords: PasswordCodec = {
  hash: async (password) => `encoded:${password}`,
  verify: async (password, encoded) => encoded === `encoded:${password}`,
  validate: (password) => password.length >= 12 ? null : "密码至少需要 12 个字符",
};

function createFixture() {
  const database = new AppDatabase(new DatabaseSync(":memory:"));
  ensureAuthSchema(database);
  const repository = new SqliteIdentityAuthRepository(database);
  const auditEvents: Array<{ action: string; accountId: string | null; detail?: string }> = [];
  const audit: IdentityAuditPort = {
    record: async (action, accountId, detail) => { auditEvents.push({ action, accountId, detail }); },
  };
  const service = new IdentityAuthenticationService(
    repository,
    passwords,
    { verify: async () => null },
    audit,
    () => false,
  );
  return { database, repository, service, auditEvents };
}

function insertAccount(database: AppDatabase, overrides: { status?: "active" | "suspended"; verified?: boolean } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const id = crypto.randomUUID();
  const email = `${id}@oneshowseo.test`;
  database.prepare(`
    INSERT INTO users (id,email,name,password_hash,role,status,plan,email_verified_at,created_at,updated_at)
    VALUES (?,?,?,?,'user',?,'trial',?,?,?)
  `).bind(id, email, "Identity Test", "encoded:CorrectPassword2026!", overrides.status ?? "active", overrides.verified === false ? null : now, now, now).run();
  ensureAuthSchema(database);
  return { id, email };
}

test("safe return destinations only accept same-origin application paths", () => {
  assert.equal(safeReturnDestination("/workspace?project=1#tasks"), "/workspace?project=1#tasks");
  for (const unsafe of ["https://evil.test", "//evil.test", "/\\evil.test", "/login?returnTo=/admin", "/register", "/workspace\nSet-Cookie:x"]) {
    assert.equal(safeReturnDestination(unsafe), "/workspace");
  }
});

test("login rotates the previous session and logout preserves a revocation audit trail", async () => {
  const { database, repository, service, auditEvents } = createFixture();
  const account = insertAccount(database);

  const first = await service.login({ email: account.email, password: "CorrectPassword2026!", previousToken: null });
  const firstHash = await hashIdentityToken(first.session.token);
  assert.notEqual(first.session.token, firstHash);
  assert.equal((await repository.accountBySession(firstHash, Math.floor(Date.now() / 1000)))?.id, account.id);

  const second = await service.login({ email: account.email, password: "CorrectPassword2026!", previousToken: first.session.token });
  const secondHash = await hashIdentityToken(second.session.token);
  const firstState = database.prepare("SELECT status FROM sessions WHERE id=?").bind(firstHash).first<{ status: string }>();
  const secondState = database.prepare("SELECT status,rotated_from_id AS rotatedFromId FROM sessions WHERE id=?").bind(secondHash).first<{ status: string; rotatedFromId: string }>();
  assert.equal(firstState?.status, "rotated");
  assert.equal(secondState?.status, "active");
  assert.equal(secondState?.rotatedFromId, firstHash);
  assert.equal(await repository.accountBySession(firstHash, Math.floor(Date.now() / 1000)), null);

  await service.logout(second.session.token);
  assert.equal(database.prepare("SELECT status FROM sessions WHERE id=?").bind(secondHash).first<{ status: string }>()?.status, "revoked");
  assert.equal(await repository.accountBySession(secondHash, Math.floor(Date.now() / 1000)), null);
  assert.equal(auditEvents.filter((event) => event.action === "login_success").length, 2);
});

test("suspended and unverified accounts cannot create sessions", async () => {
  for (const state of [{ status: "suspended" as const, verified: true, code: "ACCOUNT_SUSPENDED" }, { status: "active" as const, verified: false, code: "EMAIL_UNVERIFIED" }]) {
    const { database, service } = createFixture();
    const account = insertAccount(database, state);
    await assert.rejects(
      service.login({ email: account.email, password: "CorrectPassword2026!", previousToken: null }),
      (error: unknown) => error instanceof IdentityError && error.code === state.code,
    );
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM sessions").first<{ count: number }>()?.count, 0);
  }
});

test("registration atomically creates a verified account, initial organization, owner membership, and scoped session", async () => {
  const database = new AppDatabase(new DatabaseSync(":memory:"));
  await ensureAuthSchema(database);
  const codeId = crypto.randomUUID();
  const now = Math.floor(Date.now()/1000);
  database.prepare(`INSERT INTO email_codes (id,email,purpose,code_hash,expires_at,created_at) VALUES (?,'new@oneshowseo.test','register','redacted',?,?)`)
    .bind(codeId,now+600,now).run();
  const repository = new SqliteIdentityAuthRepository(database);
  const service = new IdentityAuthenticationService(repository,passwords,{verify:async()=>({id:codeId})},{record:async()=>{}},()=>false);
  const result = await service.register({name:"New Customer",email:"new@oneshowseo.test",password:"StrongPassword2026!",code:"123456",acceptedTerms:true,previousToken:null});

  assert.equal(result.account.email,"new@oneshowseo.test");
  assert.equal(result.session.organization.roleKey,"owner");
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM identity_organizations WHERE owner_user_id=?").bind(result.account.id).first<{count:number}>()?.count,1);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM identity_memberships WHERE user_id=? AND status='active'").bind(result.account.id).first<{count:number}>()?.count,1);
  assert.ok(database.prepare("SELECT consumed_at AS consumedAt FROM email_codes WHERE id=?").bind(codeId).first<{consumedAt:number}>()?.consumedAt);
  const authenticated = await repository.accountBySession(await hashIdentityToken(result.session.token),now);
  assert.equal(authenticated?.organization.organizationId,result.session.organization.organizationId);
});

test("organization switching rotates the session and the sole owner safeguard prevents lockout", async () => {
  const { database, service } = createFixture();
  const account = insertAccount(database);
  const first = await service.login({email:account.email,password:"CorrectPassword2026!",previousToken:null});
  const tenancy = new TenancyService(new SqliteTenancyRepository(database));
  const secondOrganization = await tenancy.create({userId:account.id,name:"Second Workspace",locale:"en",timezone:"America/New_York"});
  const switched = await service.switchOrganization({accountId:account.id,organizationId:secondOrganization.organizationId,previousToken:first.session.token});

  assert.equal(switched.organization.organizationId,secondOrganization.organizationId);
  assert.equal(database.prepare("SELECT status FROM sessions WHERE id=?").bind(await hashIdentityToken(first.session.token)).first<{status:string}>()?.status,"rotated");
  await assert.rejects(tenancy.assertOwnerCanBeChanged(secondOrganization.membershipId),(error:unknown)=>error instanceof TenancyError&&error.code==="OWNER_REQUIRED");
});
