import { createOpaqueToken, hashIdentityToken } from "./authentication";
import { permissionsForRole, type OrganizationRoleKey } from "./authorization";
import type { TenancyRepository } from "./tenancy";

export type InvitationRole = Exclude<OrganizationRoleKey,"owner">;
export type InvitationRecord = {id:string;organizationId:string;email:string;roleKey:InvitationRole;status:"pending"|"accepted"|"cancelled"|"expired";expiresAt:number;projectScope:string[];createdAt:number};

export interface InvitationRepository {
  list(organizationId:string,now:number):Promise<InvitationRecord[]>;
  create(input:{id:string;organizationId:string;email:string;roleKey:InvitationRole;rolePermissions:string[];tokenHash:string;invitedByUserId:string;expiresAt:number;projectScope:string[];seatLimit:number;now:number}):Promise<void>;
  accept(input:{tokenHash:string;accountId:string;email:string;now:number}):Promise<{organizationId:string;membershipId:string}|null>;
  cancel(organizationId:string,invitationId:string,now:number):Promise<boolean>;
  updateMembership(input:{organizationId:string;membershipId:string;status:"suspended"|"revoked";now:number}):Promise<boolean>;
}

export class InvitationError extends Error{
  constructor(readonly code:"INVALID_REQUEST"|"SEAT_LIMIT"|"CONFLICT"|"INVITATION_INVALID"|"OWNER_REQUIRED",message:string,readonly status:number){super(message);}
}

const roles = new Set<InvitationRole>(["admin","seo_manager","content_manager","editor","writer","analyst","viewer","support","finance","operations","security"]);

export class InvitationService{
  constructor(private readonly repository:InvitationRepository,private readonly tenancy:TenancyRepository){}

  list(organizationId:string){return this.repository.list(organizationId,Math.floor(Date.now()/1000));}

  async invite(input:{organizationId:string;email:unknown;role:unknown;projectScope:unknown;invitedByUserId:string;seatLimit:number}){
    const email=typeof input.email==="string"?input.email.trim().toLowerCase().slice(0,254):"";
    const role=typeof input.role==="string"?input.role as InvitationRole:"viewer";
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new InvitationError("INVALID_REQUEST","请输入有效邮箱",400);
    if(!roles.has(role)) throw new InvitationError("INVALID_REQUEST","邀请角色无效",400);
    const projectScope=Array.isArray(input.projectScope)?[...new Set(input.projectScope.filter((id):id is string=>typeof id==="string"&&id.length>0&&id.length<=100))].slice(0,50):[];
    const token=createOpaqueToken();const now=Math.floor(Date.now()/1000);const id=crypto.randomUUID();
    try{await this.repository.create({id,organizationId:input.organizationId,email,roleKey:role,rolePermissions:[...permissionsForRole(role)],tokenHash:await hashIdentityToken(token),invitedByUserId:input.invitedByUserId,expiresAt:now+7*24*60*60,projectScope,seatLimit:input.seatLimit,now});}
    catch(error){
      const message=error instanceof Error?error.message:"";
      if(message==="SEAT_LIMIT")throw new InvitationError("SEAT_LIMIT","团队席位已用完，请升级套餐或取消待处理邀请",403);
      throw new InvitationError("CONFLICT","该邮箱已是成员或已有待处理邀请",409);
    }
    return {invitation:{id,organizationId:input.organizationId,email,roleKey:role,status:"pending" as const,expiresAt:now+7*24*60*60,projectScope,createdAt:now},token};
  }

  async accept(input:{token:unknown;accountId:string;email:string}){
    const token=typeof input.token==="string"?input.token.trim():"";
    if(!token)throw new InvitationError("INVITATION_INVALID","邀请链接无效或已过期",400);
    const accepted=await this.repository.accept({tokenHash:await hashIdentityToken(token),accountId:input.accountId,email:input.email.toLowerCase(),now:Math.floor(Date.now()/1000)});
    if(!accepted)throw new InvitationError("INVITATION_INVALID","邀请链接无效、已过期或已使用",400);
    return accepted;
  }

  async cancel(organizationId:string,invitationId:string){if(!await this.repository.cancel(organizationId,invitationId,Math.floor(Date.now()/1000)))throw new InvitationError("INVITATION_INVALID","邀请不存在或已处理",404);}

  async changeMembership(input:{organizationId:string;membershipId:string;status:"suspended"|"revoked"}){
    const membership=await this.tenancy.membership(input.membershipId);
    if(!membership||membership.organizationId!==input.organizationId)throw new InvitationError("INVALID_REQUEST","成员不存在",404);
    if(membership.roleKey==="owner"&&membership.status==="active"&&await this.tenancy.activeOwnerCount(input.organizationId)<=1)throw new InvitationError("OWNER_REQUIRED","组织必须保留至少一位有效 Owner",409);
    if(!await this.repository.updateMembership({...input,now:Math.floor(Date.now()/1000)}))throw new InvitationError("INVALID_REQUEST","成员不存在或状态未变化",404);
  }
}
