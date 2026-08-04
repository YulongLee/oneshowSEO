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

test("governed team repository scopes members, paginates, groups teams, and rejects stale updates",async()=>{
 const {ensureProductSchema}=await import("../lib/product");
 const {getDatabase}=await import("../lib/auth");
 const {SqliteProjectTeamRepository}=await import("../platform/adapters/sqlite/project-team-repository");
 const {TeamGovernanceError}=await import("../platform/modules/projects/team-governance");
 const db=getDatabase();const now=Math.floor(Date.now()/1000);
 for(const [id,email,name] of [["team-owner","team-owner@test.local","Team Owner"],["team-member","team-member@test.local","Team Member"],["outside-member","outside@test.local","Outside Member"]]){
  await db.prepare("INSERT INTO users (id,email,name,password_hash,role,status,plan,email_verified_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)").bind(id,email,name,"hash","user","active","pro",now,now,now).run();
 }
 await ensureProductSchema();
 const organizationId="org_team-owner",projectId="governed-project";
 await db.prepare("INSERT OR IGNORE INTO identity_roles (id,organization_id,role_key,name,permissions,is_system,created_at,updated_at) VALUES (?,?,?,?,?,1,?,?)").bind("role_editor_team",organizationId,"editor","Editor","[]",now,now).run();
 await db.prepare("INSERT INTO identity_memberships (id,organization_id,user_id,role_id,status,joined_at,project_scope,version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)").bind("membership-team-member",organizationId,"team-member","role_editor_team","active",now,JSON.stringify([projectId]),1,now,now).run();
 await db.prepare("INSERT INTO identity_memberships (id,organization_id,user_id,role_id,status,joined_at,project_scope,version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)").bind("membership-outside-member",organizationId,"outside-member","role_editor_team","active",now,JSON.stringify(["other-project"]),1,now,now).run();
 await db.prepare("INSERT INTO projects (id,user_id,organization_id,slug,status,name,site_url,host,market,language,timezone,business_goal,approval_mode,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(projectId,"team-owner",organizationId,"governed-project","active","Governed Project","https://governed.example/","governed.example","US","en-US","UTC","organic_growth","required",now,now).run();
 const repository=new SqliteProjectTeamRepository(db);
 const initial=repository.list({organizationId,projectId,query:"",role:"all",status:"active",teamId:"",page:1,pageSize:5,seatLimit:15});
 assert.equal(initial.pagination.total,2);assert.equal(initial.members.some(member=>member.email==="outside@test.local"),false);
 const team=repository.createTeam({organizationId,projectId,name:"SEO Team",description:"Technical SEO",actorUserId:"team-owner"});
 const updated=repository.updateMembership({organizationId,projectId,membershipId:"membership-team-member",actorUserId:"team-owner",role:"analyst",teamIds:[team.id],expectedVersion:1});
 assert.equal(updated.version,2);
 const filtered=repository.list({organizationId,projectId,query:"team member",role:"analyst",status:"active",teamId:team.id,page:1,pageSize:5,seatLimit:15});
 assert.equal(filtered.pagination.total,1);assert.equal(filtered.members[0].teams[0].name,"SEO Team");assert.equal(filtered.activities[0].action,"membership_updated");
 assert.throws(()=>repository.updateMembership({organizationId,projectId,membershipId:"membership-team-member",actorUserId:"team-owner",role:"viewer",expectedVersion:1}),(error:unknown)=>error instanceof TeamGovernanceError&&error.code==="VERSION_CONFLICT");
});
