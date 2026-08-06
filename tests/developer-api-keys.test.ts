import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { authenticateApiRequest, createApiKey, revokeApiKey, rotateApiKey } from "../lib/api-access";
import { ensureAuthSchema, getDatabase, hashAuthToken, type AppUser } from "../lib/auth";

process.env.DATABASE_PATH=join(mkdtempSync(join(tmpdir(),"oneshowseo-developer-keys-")),"test.sqlite");

async function userFixture(label:string):Promise<AppUser>{
 await ensureAuthSchema();const id=`account_${label}_${crypto.randomUUID()}`,email=`${label}-${crypto.randomUUID()}@example.com`,now=Math.floor(Date.now()/1000);getDatabase().prepare("INSERT INTO users(id,email,name,password_hash,role,status,plan,email_verified_at,created_at,updated_at) VALUES(?,?,?,'hash','user','active','business',?,?,?)").bind(id,email,label,now,now,now).run();await ensureAuthSchema();const organization=getDatabase().prepare(`SELECT o.id organizationId,o.name organizationName,o.slug organizationSlug,o.status organizationStatus,m.id membershipId,m.status membershipStatus,r.role_key roleKey FROM identity_organizations o JOIN identity_memberships m ON m.organization_id=o.id JOIN identity_roles r ON r.id=m.role_id WHERE m.user_id=?`).bind(id).first<AppUser["organization"]>()!;return{id,email,name:label,role:"user",status:"active",plan:"business",trialEndsAt:null,emailVerifiedAt:now,createdAt:now,organization};
}
const request=(key:string)=>new Request("https://oneshowseo.com/api/v1/projects",{headers:{authorization:`Bearer ${key}`}});

test("organization API keys expose plaintext once and persist only scoped hash metadata",async()=>{
 const user=await userFixture("owner"),expiresAt=Math.floor(Date.now()/1000)+86400,created=await createApiKey(user,{name:"Automation",scopes:["projects:read","tasks:write"],projectIds:"*",expiresAt,rateLimitPolicy:{requestsPerMinute:20,monthlyRequests:1000,costUnitsPerMinute:40}});assert.match(created.plainTextKey,/^osseo_live_[a-f0-9]{8}_[a-f0-9]{48}$/);assert.equal(created.record.organizationId,user.organization.organizationId);assert.deepEqual(created.record.scopes,["projects:read","tasks:write"]);assert.equal(created.record.createdByAccountId,user.id);assert.equal(created.record.expiresAt,expiresAt);const stored=getDatabase().prepare("SELECT secret_hash hash,scopes,project_scopes projectScopes,rate_limit_policy policy FROM api_access_keys WHERE id=?").bind(created.record.id).first<{hash:string;scopes:string;projectScopes:string;policy:string}>()!;assert.equal(stored.hash,await hashAuthToken(created.plainTextKey));assert.equal(JSON.stringify(stored).includes(created.plainTextKey),false);assert.deepEqual(JSON.parse(stored.scopes),created.record.scopes);assert.equal(JSON.parse(stored.projectScopes),"*");assert.equal(JSON.parse(stored.policy).requestsPerMinute,20);assert.equal(await authenticateApiRequest(request(created.plainTextKey),{requiredScopes:["projects:read"]})!==null,true);assert.equal(await authenticateApiRequest(request(created.plainTextKey),{requiredScopes:["approvals:write"]}),null);
});

test("expiry, organization ownership, rotation, revocation, and last-used fail closed",async()=>{
 const owner=await userFixture("rotate"),other=await userFixture("other"),created=await createApiKey(owner,"Primary"),authenticated=await authenticateApiRequest(request(created.plainTextKey),{projectId:"any_project"});assert.equal(authenticated?.key.lastUsedAt!==null,true);await assert.rejects(revokeApiKey(other,created.record.id),/KEY_NOT_FOUND/);const rotated=await rotateApiKey(owner,created.record.id);assert.equal(rotated.record.rotatedFromId,created.record.id);assert.equal(await authenticateApiRequest(request(created.plainTextKey)),null);assert.equal(await authenticateApiRequest(request(rotated.plainTextKey))!==null,true);await revokeApiKey(owner,rotated.record.id);assert.equal(await authenticateApiRequest(request(rotated.plainTextKey)),null);assert.equal(getDatabase().prepare("SELECT COUNT(*) total FROM api_key_events WHERE organization_id=?").bind(owner.organization.organizationId).first<{total:number}>()?.total,4);assert.throws(()=>getDatabase().prepare("DELETE FROM api_key_events WHERE organization_id=?").bind(owner.organization.organizationId).run(),/APPEND_ONLY/);
 const expired=await createApiKey(owner,"Expiring");getDatabase().prepare("UPDATE api_access_keys SET expires_at=? WHERE id=?").bind(Math.floor(Date.now()/1000)-1,expired.record.id).run();assert.equal(await authenticateApiRequest(request(expired.plainTextKey)),null);
});

test("project-scoped credentials conceal guessed identifiers and serialized records never expose hashes",async()=>{
 const owner=await userFixture("scoped"),createdAt=Math.floor(Date.now()/1000),projectId=`project_${crypto.randomUUID()}`;
 getDatabase().prepare("INSERT INTO projects(id,user_id,name,site_url,host,created_at,updated_at,organization_id,slug,status) VALUES(?,?,?,?,?,?,?,?,?,'active')").bind(projectId,owner.id,"Scoped project","https://scoped.example","scoped.example",createdAt,createdAt,owner.organization.organizationId,`scoped-${projectId.slice(-8)}`).run();
 const created=await createApiKey(owner,{name:"Scoped",scopes:["projects:read"],projectIds:[projectId]});
 assert.ok(await authenticateApiRequest(request(created.plainTextKey),{requiredScopes:["projects:read"],projectId}));
 assert.equal(await authenticateApiRequest(request(created.plainTextKey),{requiredScopes:["projects:read"],projectId:"guessed-project-id"}),null);
 assert.equal(JSON.stringify(created.record).includes(created.plainTextKey),false);
 assert.equal(/secret|hash/i.test(Object.keys(created.record).join(" ")),false);
});

test("PostgreSQL developer credential migration preserves least privilege and immutable evidence",()=>{const sql=readFileSync("platform/adapters/postgres/migrations/0019_expand_developer_credentials.sql","utf8");for(const pattern of [/CREATE SCHEMA IF NOT EXISTS developer/,/secret_hash text NOT NULL UNIQUE/,/project_scopes jsonb NOT NULL/,/expires_at timestamptz/,/rotated_from_id/,/created_by_account_id/,/rate_limit_policy jsonb/,/API_KEY_EVENTS_APPEND_ONLY/,/REVOKE DELETE/])assert.match(sql,pattern);});
