import { NextResponse } from "next/server";
import { consumeRateLimit, getCurrentUser, getDatabase, writeAudit } from "../../../lib/auth";
import { createApiKey, ensureApiAccessSchema } from "../../../lib/api-access";
import { billingPlans, commerceService, commercialSubject } from "../../../lib/billing";
import { CommerceError } from "../../../platform/modules/commerce/service";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({error:"请先登录"},{status:401});
  await ensureApiAccessSchema();
  const db=getDatabase(),effective=commerceService().resolve(commercialSubject(user)),periodStart=Math.floor(new Date(new Date().getFullYear(),new Date().getMonth(),1).getTime()/1000), periodEnd=Math.floor(new Date(new Date().getFullYear(),new Date().getMonth()+1,1).getTime()/1000);
  const keys=db.prepare("SELECT id,name,key_prefix AS keyPrefix,status,last_used_at AS lastUsedAt,created_at AS createdAt,revoked_at AS revokedAt FROM api_access_keys WHERE user_id=? ORDER BY created_at DESC").bind(user.id).all().results;
  const webhooks=db.prepare("SELECT id,url,event_types AS eventTypes,status,created_at AS createdAt,updated_at AS updatedAt FROM api_webhooks WHERE user_id=? ORDER BY created_at DESC").bind(user.id).all().results.map(row=>{const value=row as Record<string,unknown>&{eventTypes:string};return {...value,eventTypes:JSON.parse(value.eventTypes) as string[]}});
  const used=db.prepare("SELECT COALESCE(SUM(quantity),0) AS total FROM api_request_events WHERE user_id=? AND created_at>=? AND created_at<?").bind(user.id,periodStart,periodEnd).first<{total:number}>()?.total||0;
  const recent=db.prepare("SELECT route,method,status_code AS statusCode,created_at AS createdAt FROM api_request_events WHERE user_id=? ORDER BY created_at DESC LIMIT 8").bind(user.id).all().results;
  return NextResponse.json({access:effective.access!=="restricted"&&effective.access!=="suspended"&&effective.limits.apiAccess,plan:{id:user.plan,name:billingPlans[user.plan].name},limits:{requests:effective.limits.apiRequests,activeKeys:effective.limits.apiKeys},usage:{used,periodStart,periodEnd},keys,webhooks,recent,capabilities:{restApi:true,webhookDelivery:false,mcpServer:false}});
}

export async function POST(request:Request) {
  const user=await getCurrentUser();
  if(!user)return NextResponse.json({error:"请先登录"},{status:401});
  await ensureApiAccessSchema();
  const body=await request.json().catch(()=>null) as {action?:string;name?:string;id?:string;url?:string;events?:string[]} | null;
  if(!body?.action)return NextResponse.json({error:"请求无效"},{status:400});
  if(await consumeRateLimit("api_access",user.id,request,12,60))return NextResponse.json({error:"操作过于频繁，请稍后再试"},{status:429});
  if(body.action==="create_key"){
    try { const created=await createApiKey(user,body.name||"默认密钥"); await writeAudit("api_key_created",user.id,request,created.record.keyPrefix); return NextResponse.json(created,{status:201}); }
    catch(error){const code=error instanceof Error?error.message:"";return NextResponse.json({error:code==="PLAN_REQUIRED"?"当前套餐不包含 API 访问，请升级到 Pro 或 Business。":"已达到当前套餐的 API Key 上限。"},{status:code==="PLAN_REQUIRED"?403:409});}
  }
  if(body.action==="revoke_key"){
    const result=getDatabase().prepare("UPDATE api_access_keys SET status='revoked',revoked_at=? WHERE id=? AND user_id=? AND status='active'").bind(Math.floor(Date.now()/1000),body.id,user.id).run();
    if(!result.meta.changes)return NextResponse.json({error:"API Key 不存在或已撤销"},{status:404});
    await writeAudit("api_key_revoked",user.id,request,body.id); return NextResponse.json({ok:true});
  }
  if(body.action==="create_webhook"){
    try{commerceService().authorize(commercialSubject(user),"apiAccess");}catch(error){if(error instanceof CommerceError)return NextResponse.json({error:error.message,code:error.code},{status:error.status});throw error;}
    let url:URL;try{url=new URL(body.url||"");}catch{return NextResponse.json({error:"请输入有效的 HTTPS URL"},{status:400})}
    if(url.protocol!=="https:")return NextResponse.json({error:"Webhook 必须使用 HTTPS"},{status:400});
    const now=Math.floor(Date.now()/1000),id=crypto.randomUUID();
    getDatabase().prepare("INSERT INTO api_webhooks (id,user_id,url,event_types,status,created_at,updated_at) VALUES (?,?,?,?, 'paused',?,?)").bind(id,user.id,url.toString(),JSON.stringify(body.events?.slice(0,10)||["audit.completed"]),now,now).run();
    await writeAudit("webhook_created",user.id,request,url.host);return NextResponse.json({id,status:"paused"},{status:201});
  }
  if(body.action==="delete_webhook"){
    getDatabase().prepare("DELETE FROM api_webhooks WHERE id=? AND user_id=?").bind(body.id,user.id).run();return NextResponse.json({ok:true});
  }
  return NextResponse.json({error:"不支持的操作"},{status:400});
}
