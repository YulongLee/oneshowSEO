import { NextResponse } from "next/server";
import { getCurrentUser,getDatabase,writeAudit } from "../../../lib/auth";
import { ensureProductSchema } from "../../../lib/product";
export async function PATCH(request:Request){
 const user=await getCurrentUser(); if(!user)return NextResponse.json({error:"请先登录"},{status:401});
 const body=await request.json().catch(()=>null) as {id?:string;status?:string}|null; if(!body?.id||!["approved","dismissed"].includes(body.status||""))return NextResponse.json({error:"参数无效"},{status:400});
 await ensureProductSchema(); const db=getDatabase(); const now=Math.floor(Date.now()/1000);
 const result=db.prepare(`UPDATE seo_tasks SET status=?,updated_at=? WHERE id=? AND status='proposed' AND project_id IN (SELECT id FROM projects WHERE user_id=?)`).bind(body.status,now,body.id,user.id).run();
 if(!result.meta.changes)return NextResponse.json({error:"任务不存在或状态已变化"},{status:409});
 await writeAudit("seo_task_decision",user.id,request,JSON.stringify(body)); return NextResponse.json({ok:true});
}
