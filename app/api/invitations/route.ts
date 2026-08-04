import {NextResponse} from "next/server";
import {billingPlans} from "../../../lib/billing";
import {getCurrentUser,getDatabase,setSessionCookie,writeAudit} from "../../../lib/auth";
import {sendInvitationEmail} from "../../../lib/email";
import {currentSessionToken,identityService} from "../../../lib/identity";
import {SqliteInvitationRepository} from "../../../platform/adapters/sqlite/invitation-repository";
import {SqliteTenancyRepository} from "../../../platform/adapters/sqlite/tenancy-repository";
import {AuthorizationError,authorizeOrganization,permissions,type OrganizationRoleKey} from "../../../platform/modules/identity/authorization";
import {InvitationError,InvitationService} from "../../../platform/modules/identity/invitations";

const services=()=>{const database=getDatabase();const tenancy=new SqliteTenancyRepository(database);return{invitations:new InvitationService(new SqliteInvitationRepository(database),tenancy)};};
const failure=(error:unknown)=>{if(error instanceof InvitationError||error instanceof AuthorizationError)return NextResponse.json({error:error.message,code:error.code},{status:error.status});throw error;};
const authorize=(user:NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>,permission:typeof permissions.membersInvite|typeof permissions.membersManage)=>authorizeOrganization({role:user.organization.roleKey as OrganizationRoleKey,permission,activeOrganizationId:user.organization.organizationId,resourceOrganizationId:user.organization.organizationId});

export async function GET(){const user=await getCurrentUser();if(!user)return NextResponse.json({error:"请先登录"},{status:401});try{authorize(user,permissions.membersInvite);return NextResponse.json({invitations:await services().invitations.list(user.organization.organizationId)});}catch(error){return failure(error);}}

export async function POST(request:Request){const user=await getCurrentUser();if(!user)return NextResponse.json({error:"请先登录"},{status:401});try{
 authorize(user,permissions.membersInvite);const body=await request.json().catch(()=>null) as Record<string,unknown>|null;
 const created=await services().invitations.invite({organizationId:user.organization.organizationId,email:body?.email,role:body?.role,projectScope:body?.projectScope,invitedByUserId:user.id,seatLimit:billingPlans[user.plan].teamSeatLimit});
 try{await sendInvitationEmail({to:created.invitation.email,organizationName:user.organization.organizationName,inviterName:user.name,token:created.token,requestUrl:request.url});}catch(error){await services().invitations.cancel(user.organization.organizationId,created.invitation.id);throw error;}
 await writeAudit("organization_invitation_created",user.id,request,JSON.stringify({organizationId:user.organization.organizationId,invitationId:created.invitation.id,role:created.invitation.roleKey,projectScope:created.invitation.projectScope}));
 return NextResponse.json({invitation:created.invitation},{status:201});
 }catch(error){return failure(error);}}

export async function PUT(request:Request){const user=await getCurrentUser();if(!user)return NextResponse.json({error:"请先登录"},{status:401});try{
 const body=await request.json().catch(()=>null) as Record<string,unknown>|null;const accepted=await services().invitations.accept({token:body?.token,accountId:user.id,email:user.email});
 const session=await(await identityService(request)).switchOrganization({accountId:user.id,organizationId:accepted.organizationId,previousToken:await currentSessionToken()});await setSessionCookie(session.token,session.expiresAt);
 await writeAudit("organization_invitation_accepted",user.id,request,JSON.stringify({organizationId:accepted.organizationId,membershipId:accepted.membershipId}));return NextResponse.json({ok:true,activeOrganizationId:accepted.organizationId});
 }catch(error){return failure(error);}}

export async function PATCH(request:Request){const user=await getCurrentUser();if(!user)return NextResponse.json({error:"请先登录"},{status:401});try{
 authorize(user,permissions.membersManage);const body=await request.json().catch(()=>null) as Record<string,unknown>|null;const action=String(body?.action||"");
 if(action==="cancel"){await services().invitations.cancel(user.organization.organizationId,String(body?.invitationId||""));}
 else if(action==="suspend"||action==="revoke"){await services().invitations.changeMembership({organizationId:user.organization.organizationId,membershipId:String(body?.membershipId||""),status:action==="suspend"?"suspended":"revoked"});}
 else throw new InvitationError("INVALID_REQUEST","操作无效",400);
 await writeAudit(`organization_${action}`,user.id,request,JSON.stringify({organizationId:user.organization.organizationId,invitationId:body?.invitationId,membershipId:body?.membershipId}));return NextResponse.json({ok:true});
 }catch(error){return failure(error);}}
