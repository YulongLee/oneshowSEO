import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

process.env.DATABASE_PATH=join(mkdtempSync(join(tmpdir(),"oneshowseo-team-")),"test.sqlite");

test("team schema stores project members and prevents duplicate pending invitations",async()=>{
 const {ensureProductSchema,teamSeatLimit}=await import("../lib/product");
 const {getDatabase}=await import("../lib/auth");
 await ensureProductSchema();const db=getDatabase();const now=Math.floor(Date.now()/1000);
 await db.prepare("INSERT INTO users (id,email,name,password_hash,role,status,plan,email_verified_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)").bind("owner","owner@test.local","Owner","hash","user","active","pro",now,now,now).run();
 await db.prepare("INSERT INTO users (id,email,name,password_hash,role,status,plan,email_verified_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)").bind("member","member@test.local","Member","hash","user","active","starter",now,now,now).run();
 await db.prepare("INSERT INTO projects (id,user_id,name,site_url,host,market,language,timezone,business_goal,approval_mode,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").bind("project","owner","Project","https://example.com/","example.com","US","en-US","UTC","organic_growth","required",now,now).run();
 await db.prepare("INSERT INTO project_members (project_id,user_id,role,status,created_at,updated_at) VALUES (?,?,?,?,?,?)").bind("project","member","editor","active",now,now).run();
 await db.prepare("INSERT INTO project_invites (id,project_id,email,role,status,invited_by,expires_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)").bind("invite-1","project","new@test.local","viewer","pending","owner",now+3600,now,now).run();
 const count=db.prepare("SELECT COUNT(*) AS count FROM project_members WHERE project_id=?").bind("project").first<{count:number}>()?.count;
 assert.equal(count,1);
 assert.equal(teamSeatLimit({plan:"pro"} as Parameters<typeof teamSeatLimit>[0]),15);
 assert.throws(()=>db.prepare("INSERT INTO project_invites (id,project_id,email,role,status,invited_by,expires_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)").bind("invite-2","project","new@test.local","viewer","pending","owner",now+3600,now,now).run());
});
