import test from "node:test";
import assert from "node:assert/strict";
import { activeApiKeyLimit, apiRequestLimit, authenticateApiRequest, createApiKey, ensureApiAccessSchema, hasApiAccess, recordApiRequest } from "../lib/api-access";
import { ensureAuthSchema, getDatabase, hashAuthToken, type AppUser } from "../lib/auth";

test("API access follows commercial plan limits",()=>{
  assert.equal(hasApiAccess("trial"),false);assert.equal(hasApiAccess("pro"),true);
  assert.equal(apiRequestLimit("pro"),15000);assert.equal(activeApiKeyLimit("business"),10);
});

test("API keys are stored as hashes and revealed once",async()=>{
  await ensureAuthSchema();await ensureApiAccessSchema();
  const user:AppUser={id:`api-test-${crypto.randomUUID()}`,email:`api-${crypto.randomUUID()}@example.com`,name:"API Test",role:"user",status:"active",plan:"pro",trialEndsAt:null,emailVerifiedAt:Math.floor(Date.now()/1000),createdAt:Math.floor(Date.now()/1000)};
  getDatabase().prepare("INSERT INTO users (id,email,name,password_hash,role,status,plan,email_verified_at,created_at,updated_at) VALUES (?,?,?,'test','user','active','pro',?,?,?)").bind(user.id,user.email,user.name,user.emailVerifiedAt,user.createdAt,user.createdAt).run();
  const created=await createApiKey(user,"Production");
  assert.match(created.plainTextKey,/^osseo_live_[a-f0-9]{8}_[a-f0-9]{48}$/);
  const stored=getDatabase().prepare("SELECT secret_hash AS hash,key_prefix AS prefix FROM api_access_keys WHERE id=?").bind(created.record.id).first<{hash:string;prefix:string}>();
  assert.equal(stored?.hash,await hashAuthToken(created.plainTextKey));assert.notEqual(stored?.hash,created.plainTextKey);assert.equal(stored?.prefix,created.record.keyPrefix);
  const request=new Request("https://oneshowseo.com/api/v1/projects",{headers:{authorization:`Bearer ${created.plainTextKey}`}});
  const authenticated=await authenticateApiRequest(request);
  assert.equal(authenticated?.user.id,user.id);assert.equal(authenticated?.key.id,created.record.id);
  recordApiRequest(user.id,created.record.id,request,200);
  const usage=getDatabase().prepare("SELECT COALESCE(SUM(quantity),0) AS total FROM api_request_events WHERE user_id=?").bind(user.id).first<{total:number}>();
  assert.equal(usage?.total,1);
  getDatabase().prepare("UPDATE api_access_keys SET status='revoked',revoked_at=? WHERE id=?").bind(Math.floor(Date.now()/1000),created.record.id).run();
  assert.equal(await authenticateApiRequest(request),null);
});
