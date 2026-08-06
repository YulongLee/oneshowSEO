import { NextResponse } from "next/server";
import { getDatabase } from "../../../../../lib/auth";
import { authenticateApiRequest, recordApiRequest } from "../../../../../lib/api-access";
import { publicFailure, publicResponseHeaders, publicSuccess, requestCorrelationId } from "../../../../../platform/modules/developer/rest-contract";

export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
  const correlationId=requestCorrelationId(request),headers=publicResponseHeaders(correlationId);
  const {id}=await params,auth=await authenticateApiRequest(request,{requiredScopes:["projects:read"],projectId:id});
  if(!auth)return NextResponse.json(publicFailure(correlationId,"UNAUTHENTICATED","Invalid API credential or access unavailable."),{status:401,headers});
  const project=getDatabase().prepare("SELECT id,name,site_url AS siteUrl,host,market,language,timezone,business_goal AS businessGoal,status,version,created_at AS createdAt,updated_at AS updatedAt FROM projects WHERE id=? AND organization_id=? AND status!='pending_deletion'").bind(id,auth.user.organization.organizationId).first();
  const status=project?200:404;recordApiRequest(auth.user.id,auth.key.id,request,status);
  return project?NextResponse.json(publicSuccess(correlationId,project),{headers}):NextResponse.json(publicFailure(correlationId,"NOT_FOUND","Project not found."),{status:404,headers});
}
