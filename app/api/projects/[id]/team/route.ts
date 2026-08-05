import {NextResponse} from "next/server";
import {consumeRateLimit,getCurrentUser,getDatabase,writeAudit} from "../../../../../lib/auth";
import {commerceService,commercialSubject,ensureBillingSchema} from "../../../../../lib/billing";
import {sendInvitationEmail} from "../../../../../lib/email";
import {ensureProductSchema,ownedProject} from "../../../../../lib/product";
import {SqliteInvitationRepository} from "../../../../../platform/adapters/sqlite/invitation-repository";
import {SqliteProjectTeamRepository} from "../../../../../platform/adapters/sqlite/project-team-repository";
import {SqliteTenancyRepository} from "../../../../../platform/adapters/sqlite/tenancy-repository";
import {can,permissions,type OrganizationRoleKey,type Permission} from "../../../../../platform/modules/identity/authorization";
import {InvitationError,InvitationService} from "../../../../../platform/modules/identity/invitations";
import {isCustomerTeamRole,normalizeProjectScope,normalizeTeamName,parseTeamListQuery,TeamGovernanceError,type MembershipStatus} from "../../../../../platform/modules/projects/team-governance";
import {CommerceError} from "../../../../../platform/modules/commerce/service";

const fail=(error:unknown)=>{
 if(error instanceof TeamGovernanceError||error instanceof InvitationError||error instanceof CommerceError)return NextResponse.json({error:error.message,code:error.code},{status:error.status});
 console.error("team_api_error",error);return NextResponse.json({error:"团队数据暂时不可用，请稍后重试",code:"TEAM_UNAVAILABLE"},{status:500});
};
async function access(projectId:string,permission:Permission){
 const user=await getCurrentUser();if(!user)return null;
 if(!can(user.organization.roleKey as OrganizationRoleKey,permission))return null;
 const project=await ownedProject(user.organization.organizationId,projectId);if(!project||project.status==="pending_deletion")return null;
 const membership=getDatabase().prepare("SELECT project_scope AS projectScope FROM identity_memberships WHERE id=? AND organization_id=? AND status='active'").bind(user.organization.membershipId,user.organization.organizationId).first<{projectScope:string}>();let scope:string[]=[];try{scope=JSON.parse(membership?.projectScope||"[]");}catch{}if(scope.length&&!scope.includes(projectId))return null;
 return{user,project};
}
async function services(){await ensureProductSchema();const database=getDatabase();return{team:new SqliteProjectTeamRepository(database),invitations:new InvitationService(new SqliteInvitationRepository(database),new SqliteTenancyRepository(database))};}

export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
 try{const{id}=await params;const authorized=await access(id,permissions.membersRead);if(!authorized)return NextResponse.json({error:"项目不存在或无权访问",code:"PROJECT_NOT_FOUND"},{status:404});await ensureBillingSchema();const query=parseTeamListQuery(request.url);const {team}=await services();const seatLimit=commerceService().resolve(commercialSubject(authorized.user)).limits.seats;const data=team.list({organizationId:authorized.user.organization.organizationId,projectId:id,seatLimit,...query});const owner=data.members.find(member=>member.owner)||null;return NextResponse.json({...data,owner,members:data.members.filter(member=>!member.owner),permissions:{canInvite:can(authorized.user.organization.roleKey as OrganizationRoleKey,permissions.membersInvite),canManage:can(authorized.user.organization.roleKey as OrganizationRoleKey,permissions.membersManage)}});}catch(error){return fail(error);}
}

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 try{const{id}=await params;const body=await request.json().catch(()=>null) as Record<string,unknown>|null;const kind=String(body?.kind||"invite");const permission=kind==="team"?permissions.membersManage:permissions.membersInvite;const authorized=await access(id,permission);if(!authorized)return NextResponse.json({error:"项目不存在或无权访问",code:"PROJECT_NOT_FOUND"},{status:404});const {team,invitations}=await services();
  await ensureBillingSchema();commerceService().authorizeAccess(commercialSubject(authorized.user));
  if(kind==="team"){const created=team.createTeam({organizationId:authorized.user.organization.organizationId,projectId:id,name:normalizeTeamName(body?.name),description:typeof body?.description==="string"?body.description.trim():"",actorUserId:authorized.user.id});await writeAudit("project_team_created",authorized.user.id,request,JSON.stringify({organizationId:authorized.user.organization.organizationId,projectId:id,teamId:created.id}));return NextResponse.json({team:created},{status:201});}
  if(await consumeRateLimit("team_invite",authorized.user.email,request,10,60*60))return NextResponse.json({error:"邀请过于频繁，请稍后再试",code:"RATE_LIMITED"},{status:429});
  await ensureBillingSchema();const currentSeats=getDatabase().prepare("SELECT COUNT(*) AS total FROM identity_memberships WHERE organization_id=? AND status='active'").bind(authorized.user.organization.organizationId).first<{total:number}>()?.total??0;const pendingSeats=getDatabase().prepare("SELECT COUNT(*) AS total FROM identity_invitations WHERE organization_id=? AND status='pending' AND expires_at>?").bind(authorized.user.organization.organizationId,Math.floor(Date.now()/1000)).first<{total:number}>()?.total??0;const entitlement=commerceService().authorize(commercialSubject(authorized.user),"seats",1,currentSeats+pendingSeats);
  const projectScope=normalizeProjectScope(body?.projectScope,id);const created=await invitations.invite({organizationId:authorized.user.organization.organizationId,email:body?.email,role:body?.role,projectScope,invitedByUserId:authorized.user.id,seatLimit:entitlement.limits.seats});
  try{await sendInvitationEmail({to:created.invitation.email,organizationName:authorized.user.organization.organizationName,inviterName:authorized.user.name,token:created.token,requestUrl:request.url});}catch(error){await invitations.cancel(authorized.user.organization.organizationId,created.invitation.id);throw error;}
  team.recordInvitation({organizationId:authorized.user.organization.organizationId,projectId:id,actorUserId:authorized.user.id,invitationId:created.invitation.id,email:created.invitation.email,role:created.invitation.roleKey});await writeAudit("organization_invitation_created",authorized.user.id,request,JSON.stringify({organizationId:authorized.user.organization.organizationId,projectId:id,invitationId:created.invitation.id,role:created.invitation.roleKey,projectScope}));return NextResponse.json({invitation:{...created.invitation,role:created.invitation.roleKey}},{status:201});
 }catch(error){return fail(error);}
}

export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
 try{const{id}=await params;const authorized=await access(id,permissions.membersManage);if(!authorized)return NextResponse.json({error:"项目不存在或无权访问",code:"PROJECT_NOT_FOUND"},{status:404});const body=await request.json().catch(()=>null) as Record<string,unknown>|null;const membershipId=String(body?.membershipId||body?.memberId||"");if(!membershipId)throw new TeamGovernanceError("INVALID_REQUEST","缺少成员 ID",400);
  const role=body?.role===undefined?undefined:body.role;if(role!==undefined&&!isCustomerTeamRole(role))throw new TeamGovernanceError("INVALID_REQUEST","角色无效",400);const status=body?.status===undefined?undefined:String(body.status) as MembershipStatus;if(status!==undefined&&!(["active","suspended","revoked"] as string[]).includes(status))throw new TeamGovernanceError("INVALID_REQUEST","状态无效",400);
  const projectScope=body?.projectScope===undefined?undefined:normalizeProjectScope(body.projectScope,id);const teamIds=body?.teamIds===undefined?undefined:Array.isArray(body.teamIds)?body.teamIds.filter((value):value is string=>typeof value==="string"):[];if(role===undefined&&status===undefined&&projectScope===undefined&&teamIds===undefined)throw new TeamGovernanceError("INVALID_REQUEST","没有可更新字段",400);
  if(role!==undefined||projectScope!==undefined||teamIds!==undefined||status==="active"){await ensureBillingSchema();commerceService().authorizeAccess(commercialSubject(authorized.user));}
  const {team}=await services();const result=team.updateMembership({organizationId:authorized.user.organization.organizationId,projectId:id,membershipId,actorUserId:authorized.user.id,role,status,projectScope,teamIds,expectedVersion:body?.version});await writeAudit("team_membership_updated",authorized.user.id,request,JSON.stringify({organizationId:authorized.user.organization.organizationId,projectId:id,membershipId,role,status,projectScope,teamIds}));return NextResponse.json({ok:true,version:result.version});
 }catch(error){return fail(error);}
}

export async function DELETE(request:Request,{params}:{params:Promise<{id:string}>}){
 try{const{id}=await params;const authorized=await access(id,permissions.membersManage);if(!authorized)return NextResponse.json({error:"项目不存在或无权访问",code:"PROJECT_NOT_FOUND"},{status:404});const body=await request.json().catch(()=>null) as Record<string,unknown>|null;const {team}=await services();let action:string,targetId:string;
  if(body?.invitationId||body?.inviteId){targetId=String(body.invitationId||body.inviteId);team.cancelInvitation({organizationId:authorized.user.organization.organizationId,projectId:id,invitationId:targetId,actorUserId:authorized.user.id});action="organization_invitation_cancelled";}
  else if(body?.teamId){targetId=String(body.teamId);team.archiveTeam({organizationId:authorized.user.organization.organizationId,projectId:id,teamId:targetId,actorUserId:authorized.user.id});action="project_team_archived";}
  else throw new TeamGovernanceError("INVALID_REQUEST","缺少待处理目标",400);
  await writeAudit(action,authorized.user.id,request,JSON.stringify({organizationId:authorized.user.organization.organizationId,projectId:id,targetId}));return NextResponse.json({ok:true});
 }catch(error){return fail(error);}
}
