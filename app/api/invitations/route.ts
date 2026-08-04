import {NextResponse} from "next/server";
import {billingPlans} from "../../../lib/billing";
import {getCurrentUser,getDatabase,setSessionCookie,writeAudit} from "../../../lib/auth";
import {sendInvitationEmail} from "../../../lib/email";
import {currentSessionToken,identityService} from "../../../lib/identity";
import {SqliteInvitationRepository} from "../../../platform/adapters/sqlite/invitation-repository";
import {SqliteTenancyRepository} from "../../../platform/adapters/sqlite/tenancy-repository";
import {AuthorizationError,authorizeOrganization,permissions,type OrganizationRoleKey} from "../../../platform/modules/identity/authorization";
import {InvitationError,InvitationService} from "../../../platform/modules/identity/invitations";
import {ensureProductSchema} from "../../../lib/product";
import {accessLevelForRole} from "../../../platform/modules/projects/team-governance";

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
 await ensureProductSchema();const database=getDatabase();const membership=database.prepare(`SELECT m.project_scope AS projectScope,r.role_key AS role FROM identity_memberships m JOIN identity_roles r ON r.id=m.role_id WHERE m.id=? AND m.organization_id=?`).bind(accepted.membershipId,accepted.organizationId).first<{projectScope:string;role:OrganizationRoleKey}>();const now=Math.floor(Date.now()/1000);let projectScope:string[]=[];try{projectScope=JSON.parse(membership?.projectScope||"[]");}catch{}
 for(const projectId of projectScope){const project=database.prepare("SELECT id FROM projects WHERE id=? AND organization_id=? AND status!='pending_deletion'").bind(projectId,accepted.organizationId).first();if(project)database.prepare(`INSERT INTO project_access (id,organization_id,project_id,membership_id,access_level,granted_by,version,created_at,updated_at) VALUES (?,?,?,?,?,?,1,?,?) ON CONFLICT(project_id,membership_id) DO UPDATE SET access_level=excluded.access_level,version=project_access.version+1,updated_at=excluded.updated_at`).bind(`access_${projectId}_${accepted.membershipId}`,accepted.organizationId,projectId,accepted.membershipId,accessLevelForRole(membership?.role||"viewer"),user.id,now,now).run();}
 database.prepare("INSERT INTO team_activity_events (id,organization_id,project_id,actor_user_id,action,target_type,target_id,metadata,created_at) VALUES (?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(),accepted.organizationId,projectScope[0]||null,user.id,"invitation_accepted","membership",accepted.membershipId,JSON.stringify({projectScope}),now).run();
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
