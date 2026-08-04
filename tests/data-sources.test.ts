import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

process.env.DATABASE_PATH=join(mkdtempSync(join(tmpdir(),"oneshowseo-sources-")),"test.sqlite");
process.env.DATA_SOURCE_ENCRYPTION_KEY="commercial-test-encryption-key-2026";

test("platform data source secrets are encrypted and never returned by listings",async()=>{
 const {decryptDataSourceConfig,encryptDataSourceConfig,listDataSources,saveDataSource,getEnabledDataSourceConfig}=await import("../lib/data-sources");
 const encrypted=await encryptDataSourceConfig({apiKey:"secret-pagespeed-key"});
 assert.equal(encrypted.includes("secret-pagespeed-key"),false);
 assert.deepEqual(await decryptDataSourceConfig(encrypted),{apiKey:"secret-pagespeed-key"});
 const {ensureAuthSchema,getDatabase}=await import("../lib/auth");await ensureAuthSchema();const now=Math.floor(Date.now()/1000);getDatabase().prepare("INSERT OR IGNORE INTO users (id,email,name,password_hash,role,status,plan,email_verified_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)").bind("admin-test","admin@test.local","Admin","test","admin","active","business",now,now,now).run();
 await saveDataSource("pagespeed",{apiKey:"secret-pagespeed-key"},true,"admin-test");
 const sources=await listDataSources();const source=sources.find(item=>item.provider==="pagespeed");
 assert.equal(source?.enabled,true);assert.equal(source?.configured,true);
 assert.equal(JSON.stringify(sources).includes("secret-pagespeed-key"),false);
 assert.deepEqual(await getEnabledDataSourceConfig("pagespeed"),{apiKey:"secret-pagespeed-key"});
});

test("a provider cannot be enabled without required fields",async()=>{
 const {saveDataSource}=await import("../lib/data-sources");
 await assert.rejects(()=>saveDataSource("backlinks",{},true,"admin-test"),/DATA_SOURCE_REQUIRED_FIELDS_MISSING/);
});
