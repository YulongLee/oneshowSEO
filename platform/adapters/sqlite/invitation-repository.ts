import type {AppDatabase} from "../../../lib/database";
import type {InvitationRecord,InvitationRepository} from "../../modules/identity/invitations";

export class SqliteInvitationRepository implements InvitationRepository{
 constructor(private readonly database:AppDatabase){}
 async list(organizationId:string,now:number){
  this.database.prepare("UPDATE identity_invitations SET status='expired',updated_at=? WHERE organization_id=? AND status='pending' AND expires_at<=?").bind(now,organizationId,now).run();
  const rows=this.database.prepare(`SELECT id,organization_id AS organizationId,email,role_key AS roleKey,status,expires_at AS expiresAt,project_scope AS projectScope,created_at AS createdAt FROM identity_invitations WHERE organization_id=? ORDER BY created_at DESC`).bind(organizationId).all<Omit<InvitationRecord,"projectScope">&{projectScope:string}>().results;
  return rows.map(row=>({...row,projectScope:JSON.parse(row.projectScope) as string[]}));
 }
 async create(input:Parameters<InvitationRepository["create"]>[0]){
  this.database.exec("BEGIN IMMEDIATE");
  try{
   this.database.prepare("UPDATE identity_invitations SET status='expired',updated_at=? WHERE organization_id=? AND status='pending' AND expires_at<=?").bind(input.now,input.organizationId,input.now).run();
   const usage=this.database.prepare(`SELECT (SELECT COUNT(*) FROM identity_memberships WHERE organization_id=? AND status='active')+(SELECT COUNT(*) FROM identity_invitations WHERE organization_id=? AND status='pending' AND expires_at>?) AS count`).bind(input.organizationId,input.organizationId,input.now).first<{count:number}>()?.count||0;
   if(Number(usage)>=input.seatLimit)throw new Error("SEAT_LIMIT");
   if(this.database.prepare(`SELECT 1 AS found FROM identity_memberships m JOIN users u ON u.id=m.user_id WHERE m.organization_id=? AND lower(u.email)=? AND m.status!='revoked' LIMIT 1`).bind(input.organizationId,input.email).first())throw new Error("MEMBER_EXISTS");
   const roleId=`role_${input.roleKey}_${input.organizationId}`;
   this.database.prepare(`INSERT OR IGNORE INTO identity_roles (id,organization_id,role_key,name,permissions,is_system,created_at,updated_at) VALUES (?,?,?,?,?,1,?,?)`).bind(roleId,input.organizationId,input.roleKey,input.roleKey,JSON.stringify(input.rolePermissions),input.now,input.now).run();
   this.database.prepare(`INSERT INTO identity_invitations (id,organization_id,email,role_key,token_hash,status,invited_by_user_id,expires_at,project_scope,created_at,updated_at) VALUES (?,?,?,?,?,'pending',?,?,?,?,?)`).bind(input.id,input.organizationId,input.email,input.roleKey,input.tokenHash,input.invitedByUserId,input.expiresAt,JSON.stringify(input.projectScope),input.now,input.now).run();
   this.database.exec("COMMIT");
  }catch(error){this.database.exec("ROLLBACK");throw error;}
 }
 async accept(input:Parameters<InvitationRepository["accept"]>[0]){
  this.database.exec("BEGIN IMMEDIATE");
  try{
   const invitation=this.database.prepare(`SELECT id,organization_id AS organizationId,role_key AS roleKey,project_scope AS projectScope FROM identity_invitations WHERE token_hash=? AND lower(email)=? AND status='pending' AND expires_at>? LIMIT 1`).bind(input.tokenHash,input.email,input.now).first<{id:string;organizationId:string;roleKey:string;projectScope:string}>();
   if(!invitation){this.database.exec("ROLLBACK");return null;}
   const changed=this.database.prepare("UPDATE identity_invitations SET status='accepted',accepted_at=?,updated_at=? WHERE id=? AND status='pending'").bind(input.now,input.now,invitation.id).run();
   if(!changed.meta.changes)throw new Error("INVITATION_USED");
   const role=this.database.prepare("SELECT id FROM identity_roles WHERE organization_id=? AND role_key=? LIMIT 1").bind(invitation.organizationId,invitation.roleKey).first<{id:string}>();
   if(!role)throw new Error("ROLE_MISSING");
   const existing=this.database.prepare("SELECT id FROM identity_memberships WHERE organization_id=? AND user_id=? LIMIT 1").bind(invitation.organizationId,input.accountId).first<{id:string}>();
   const membershipId=existing?.id||crypto.randomUUID();
   if(existing)this.database.prepare("UPDATE identity_memberships SET role_id=?,status='active',joined_at=?,suspended_at=NULL,revoked_at=NULL,project_scope=?,updated_at=? WHERE id=?").bind(role.id,input.now,invitation.projectScope,input.now,membershipId).run();
   else this.database.prepare(`INSERT INTO identity_memberships (id,organization_id,user_id,role_id,status,joined_at,project_scope,created_at,updated_at) VALUES (?,?,?,?,'active',?,?,?,?)`).bind(membershipId,invitation.organizationId,input.accountId,role.id,input.now,invitation.projectScope,input.now,input.now).run();
   this.database.exec("COMMIT");return{organizationId:invitation.organizationId,membershipId};
  }catch(error){try{this.database.exec("ROLLBACK");}catch{}throw error;}
 }
 async cancel(organizationId:string,invitationId:string,now:number){return Boolean(this.database.prepare("UPDATE identity_invitations SET status='cancelled',cancelled_at=?,updated_at=? WHERE id=? AND organization_id=? AND status='pending'").bind(now,now,invitationId,organizationId).run().meta.changes);}
 async updateMembership(input:Parameters<InvitationRepository["updateMembership"]>[0]){
  this.database.exec("BEGIN IMMEDIATE");
  try{
   const changed=this.database.prepare(`UPDATE identity_memberships SET status=?,suspended_at=CASE WHEN ?='suspended' THEN ? ELSE suspended_at END,revoked_at=CASE WHEN ?='revoked' THEN ? ELSE revoked_at END,updated_at=? WHERE id=? AND organization_id=? AND status='active'`).bind(input.status,input.status,input.now,input.status,input.now,input.now,input.membershipId,input.organizationId).run();
   if(changed.meta.changes)this.database.prepare("UPDATE sessions SET status='revoked',revoked_at=? WHERE membership_id=? AND status='active'").bind(input.now,input.membershipId).run();
   this.database.exec("COMMIT");return Boolean(changed.meta.changes);
  }catch(error){this.database.exec("ROLLBACK");throw error;}
 }
}
