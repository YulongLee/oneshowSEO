import { NextResponse } from "next/server";
import { getCurrentUser, writeAudit } from "../../../../../lib/auth";
import { artifactObjectService } from "../../../../../lib/execution";
import { ownedProject } from "../../../../../lib/product";
import { can, permissions, type OrganizationRoleKey } from "../../../../../platform/modules/identity/authorization";
import { ObjectStorageError } from "../../../../../platform/modules/execution/object-storage";

export async function GET(request:Request,context:{params:Promise<{id:string}>}){const user=await getCurrentUser();if(!user)return NextResponse.json({error:"请先登录"},{status:401});if(!can(user.organization.roleKey as OrganizationRoleKey,permissions.reportsRead))return NextResponse.json({error:"没有查看产物的权限"},{status:403});const{id}=await context.params,projectId=new URL(request.url).searchParams.get("projectId")??"";if(!projectId||!await ownedProject(user.organization.organizationId,projectId))return NextResponse.json({error:"项目不存在"},{status:404});try{const access=(await artifactObjectService()).authorizeAccess({activeOrganizationId:user.organization.organizationId,organizationId:user.organization.organizationId,activeProjectId:projectId,artifactId:id});await writeAudit("artifact_access_issued",user.id,request,JSON.stringify({artifactId:id,projectId,expiresAt:access.expiresAt}));return NextResponse.json(access,{headers:{"cache-control":"private, no-store"}});}catch(error){if(error instanceof ObjectStorageError)return NextResponse.json({error:error.message,code:error.code},{status:error.status});throw error;}}
