import { NextResponse } from "next/server";
import { getDatabase } from "../../../../lib/auth";
import { authenticateApiRequest, recordApiRequest } from "../../../../lib/api-access";
import { nextPageCursor, parsePage, publicFailure, publicResponseHeaders, publicSuccess, requestCorrelationId } from "../../../../platform/modules/developer/rest-contract";
import { enforceDeveloperRateLimit } from "../../../../lib/developer-rate-limit";

export async function GET(request:Request){
  const correlationId=requestCorrelationId(request),headers=publicResponseHeaders(correlationId);
  const auth=await authenticateApiRequest(request,{requiredScopes:["projects:read"]});
  if(!auth)return NextResponse.json(publicFailure(correlationId,"UNAUTHENTICATED","Invalid API credential or access unavailable."),{status:401,headers});
  try{const rate=await enforceDeveloperRateLimit(auth.key,{endpoint:"GET /api/v1/projects"});if(!rate.allowed)return NextResponse.json(publicFailure(correlationId,"RATE_LIMITED","Rate limit exceeded.",true,{retryAfterSeconds:rate.retryAfterSeconds??1}),{status:429,headers:{...headers,"retry-after":String(rate.retryAfterSeconds??1),"x-rate-limit-policy":rate.policyVersion,"x-rate-limit-reset":String(rate.resetsAt)}});}catch{return NextResponse.json(publicFailure(correlationId,"DEPENDENCY_UNAVAILABLE","Rate-limit service unavailable.",true,{retryAfterSeconds:5}),{status:503,headers:{...headers,"retry-after":"5"}});}
  let page;try{page=parsePage(request.url);}catch{recordApiRequest(auth.user.id,auth.key.id,request,400);return NextResponse.json(publicFailure(correlationId,"VALIDATION_FAILED","The pagination cursor is invalid.",false,{fields:{cursor:"invalid"}}),{status:400,headers});}
  const allProjects=getDatabase().prepare("SELECT id,name,site_url AS siteUrl,host,market,language,status,version,created_at AS createdAt,updated_at AS updatedAt FROM projects WHERE organization_id=? AND status!='pending_deletion' ORDER BY updated_at DESC,id ASC").bind(auth.user.organization.organizationId).all().results;
  const scoped=auth.key.projectIds==="*"?allProjects:allProjects.filter(project=>auth.key.projectIds!=="*"&&auth.key.projectIds.includes(String((project as {id:unknown}).id))),projects=scoped.slice(page.offset,page.offset+page.limit);
  recordApiRequest(auth.user.id,auth.key.id,request,200);
  return NextResponse.json(publicSuccess(correlationId,projects,{count:projects.length,nextCursor:nextPageCursor(page.offset,page.limit,projects.length)}),{headers});
}
