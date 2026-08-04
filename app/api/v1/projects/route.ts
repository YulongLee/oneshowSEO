import { NextResponse } from "next/server";
import { getDatabase } from "../../../../lib/auth";
import { authenticateApiRequest, recordApiRequest } from "../../../../lib/api-access";

export async function GET(request:Request){
  const auth=await authenticateApiRequest(request);
  if(!auth)return NextResponse.json({error:{code:"unauthorized",message:"Invalid API key or quota exceeded."}},{status:401});
  const projects=getDatabase().prepare("SELECT id,name,site_url AS siteUrl,host,market,language,created_at AS createdAt,updated_at AS updatedAt FROM projects WHERE user_id=? ORDER BY updated_at DESC").bind(auth.user.id).all().results;
  recordApiRequest(auth.user.id,auth.key.id,request,200);
  return NextResponse.json({data:projects,meta:{count:projects.length}});
}
