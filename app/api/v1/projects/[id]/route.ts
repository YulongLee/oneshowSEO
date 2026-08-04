import { NextResponse } from "next/server";
import { getDatabase } from "../../../../../lib/auth";
import { authenticateApiRequest, recordApiRequest } from "../../../../../lib/api-access";

export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
  const auth=await authenticateApiRequest(request);
  if(!auth)return NextResponse.json({error:{code:"unauthorized",message:"Invalid API key or quota exceeded."}},{status:401});
  const {id}=await params;
  const project=getDatabase().prepare("SELECT id,name,site_url AS siteUrl,host,market,language,timezone,business_goal AS businessGoal,created_at AS createdAt,updated_at AS updatedAt FROM projects WHERE id=? AND user_id=?").bind(id,auth.user.id).first();
  const status=project?200:404;recordApiRequest(auth.user.id,auth.key.id,request,status);
  return project?NextResponse.json({data:project}):NextResponse.json({error:{code:"not_found",message:"Project not found."}},{status:404});
}
