import { NextResponse } from "next/server";
import { getDatabase } from "../../../../lib/auth";
import { authenticateApiRequest, recordApiRequest } from "../../../../lib/api-access";
import { nextPageCursor, parsePage, publicFailure, publicResponseHeaders, publicSuccess, requestCorrelationId } from "../../../../platform/modules/developer/rest-contract";

export async function GET(request:Request){
  const correlationId=requestCorrelationId(request),headers=publicResponseHeaders(correlationId);
  const auth=await authenticateApiRequest(request);
  if(!auth)return NextResponse.json(publicFailure(correlationId,"UNAUTHENTICATED","Invalid API credential or access unavailable."),{status:401,headers});
  let page;try{page=parsePage(request.url);}catch{recordApiRequest(auth.user.id,auth.key.id,request,400);return NextResponse.json(publicFailure(correlationId,"VALIDATION_FAILED","The pagination cursor is invalid.",false,{fields:{cursor:"invalid"}}),{status:400,headers});}
  const projects=getDatabase().prepare("SELECT id,name,site_url AS siteUrl,host,market,language,status,version,created_at AS createdAt,updated_at AS updatedAt FROM projects WHERE organization_id=? AND status!='pending_deletion' ORDER BY updated_at DESC,id ASC LIMIT ? OFFSET ?").bind(auth.user.organization.organizationId,page.limit,page.offset).all().results;
  recordApiRequest(auth.user.id,auth.key.id,request,200);
  return NextResponse.json(publicSuccess(correlationId,projects,{count:projects.length,nextCursor:nextPageCursor(page.offset,page.limit,projects.length)}),{headers});
}
