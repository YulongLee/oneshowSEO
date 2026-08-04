import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import test from "node:test";
import {ensureAuthSchema} from "../lib/auth";
import {AppDatabase} from "../lib/database";
import {SqliteInvitationRepository} from "../platform/adapters/sqlite/invitation-repository";
import {SqliteTenancyRepository} from "../platform/adapters/sqlite/tenancy-repository";
import {InvitationError,InvitationService} from "../platform/modules/identity/invitations";

async function fixture(){
 const database=new AppDatabase(new DatabaseSync(":memory:"));await ensureAuthSchema(database);const now=Math.floor(Date.now()/1000);
 for(const [id,email,name] of [["owner","owner@oneshowseo.test","Owner"],["member","member@oneshowseo.test","Member"],["other","other@oneshowseo.test","Other"]])database.prepare(`INSERT INTO users (id,email,name,password_hash,role,status,plan,email_verified_at,created_at,updated_at) VALUES (?,?,?,'hash','user','active','pro',?,?,?)`).bind(id,email,name,now,now,now).run();
 await ensureAuthSchema(database);const tenancy=new SqliteTenancyRepository(database);const service=new InvitationService(new SqliteInvitationRepository(database),tenancy);const organization=(await tenancy.listOrganizations("owner"))[0];return{database,tenancy,service,organization,now};
}

test("organization invitations reserve seats, preserve project scopes, and accept only once",async()=>{
 const {database,service,organization}=await fixture();
 const created=await service.invite({organizationId:organization.organizationId,email:"member@oneshowseo.test",role:"editor",projectScope:["project-a","project-b","project-a"],invitedByUserId:"owner",seatLimit:2});
 assert.deepEqual(created.invitation.projectScope,["project-a","project-b"]);
 await assert.rejects(service.invite({organizationId:organization.organizationId,email:"other@oneshowseo.test",role:"viewer",projectScope:[],invitedByUserId:"owner",seatLimit:2}),(error:unknown)=>error instanceof InvitationError&&error.code==="SEAT_LIMIT");
 const accepted=await service.accept({token:created.token,accountId:"member",email:"member@oneshowseo.test"});
 const membership=database.prepare("SELECT status,project_scope AS projectScope FROM identity_memberships WHERE id=?").bind(accepted.membershipId).first<{status:string;projectScope:string}>();
 assert.equal(membership?.status,"active");assert.deepEqual(JSON.parse(membership!.projectScope),["project-a","project-b"]);
 await assert.rejects(service.accept({token:created.token,accountId:"member",email:"member@oneshowseo.test"}),(error:unknown)=>error instanceof InvitationError&&error.code==="INVITATION_INVALID");
});

test("cancelled and expired invitations cannot be accepted",async()=>{
 const {database,service,organization,now}=await fixture();
 const cancelled=await service.invite({organizationId:organization.organizationId,email:"member@oneshowseo.test",role:"viewer",projectScope:[],invitedByUserId:"owner",seatLimit:3});
 await service.cancel(organization.organizationId,cancelled.invitation.id);
 await assert.rejects(service.accept({token:cancelled.token,accountId:"member",email:"member@oneshowseo.test"}),InvitationError);
 const expired=await service.invite({organizationId:organization.organizationId,email:"other@oneshowseo.test",role:"viewer",projectScope:[],invitedByUserId:"owner",seatLimit:3});
 database.prepare("UPDATE identity_invitations SET expires_at=? WHERE id=?").bind(now-1,expired.invitation.id).run();
 const listed=await service.list(organization.organizationId);assert.equal(listed.find(item=>item.id===expired.invitation.id)?.status,"expired");
 await assert.rejects(service.accept({token:expired.token,accountId:"other",email:"other@oneshowseo.test"}),InvitationError);
});

test("membership suspension revokes organization sessions and sole owner revocation is blocked",async()=>{
 const {database,service,organization,now}=await fixture();
 const created=await service.invite({organizationId:organization.organizationId,email:"member@oneshowseo.test",role:"analyst",projectScope:[],invitedByUserId:"owner",seatLimit:3});
 const accepted=await service.accept({token:created.token,accountId:"member",email:"member@oneshowseo.test"});
 database.prepare(`INSERT INTO sessions (id,user_id,active_organization_id,membership_id,status,expires_at,created_at) VALUES ('member-session','member',?,?,'active',?,?)`).bind(organization.organizationId,accepted.membershipId,now+3600,now).run();
 await service.changeMembership({organizationId:organization.organizationId,membershipId:accepted.membershipId,status:"suspended"});
 assert.equal(database.prepare("SELECT status FROM sessions WHERE id='member-session'").first<{status:string}>()?.status,"revoked");
 await assert.rejects(service.changeMembership({organizationId:organization.organizationId,membershipId:organization.membershipId,status:"revoked"}),(error:unknown)=>error instanceof InvitationError&&error.code==="OWNER_REQUIRED");
});
