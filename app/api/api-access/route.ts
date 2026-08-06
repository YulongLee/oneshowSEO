import { NextResponse } from "next/server";
import { consumeRateLimit, getCurrentUser, getDatabase, writeAudit } from "../../../lib/auth";
import { createApiKey, ensureApiAccessSchema, revokeApiKey, rotateApiKey } from "../../../lib/api-access";
import { billingPlans, commerceService, commercialSubject } from "../../../lib/billing";
import { CommerceError } from "../../../platform/modules/commerce/service";
import { can, permissions, type OrganizationRoleKey } from "../../../platform/modules/identity/authorization";
import type { DeveloperScope } from "../../../platform/modules/developer/rest-contract";
import { createWebhookSubscription, disableWebhookSubscription, retryWebhookDelivery } from "../../../lib/developer-webhooks";
import { ownedProject } from "../../../lib/product";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({error:"请先登录"},{status:401});
  if(!can(user.organization.roleKey as OrganizationRoleKey,permissions.apiRead))return NextResponse.json({error:"没有查看 API 配置的权限"},{status:403});
  await ensureApiAccessSchema();
  const db=getDatabase(),effective=commerceService().resolve(commercialSubject(user)),periodStart=Math.floor(new Date(new Date().getFullYear(),new Date().getMonth(),1).getTime()/1000), periodEnd=Math.floor(new Date(new Date().getFullYear(),new Date().getMonth()+1,1).getTime()/1000);
  const keys=db.prepare("SELECT id,name,key_prefix AS keyPrefix,status,scopes,project_scopes AS projectScopes,expires_at AS expiresAt,last_used_at AS lastUsedAt,created_at AS createdAt,revoked_at AS revokedAt,rotated_from_id AS rotatedFromId,created_by_account_id AS createdByAccountId,rate_limit_policy AS rateLimitPolicy FROM api_access_keys WHERE organization_id=? ORDER BY created_at DESC").bind(user.organization.organizationId).all().results.map(row=>{const value=row as Record<string,unknown>;return{...value,scopes:JSON.parse(String(value.scopes)),projectIds:JSON.parse(String(value.projectScopes)),rateLimitPolicy:JSON.parse(String(value.rateLimitPolicy)),projectScopes:undefined}});
  const webhooks=db.prepare("SELECT id,url,event_types AS eventTypes,status,project_id AS projectId,secret_prefix AS secretPrefix,created_at AS createdAt,updated_at AS updatedAt FROM api_webhooks WHERE organization_id=? AND deleted_at IS NULL ORDER BY created_at DESC").bind(user.organization.organizationId).all().results.map(row=>{const value=row as Record<string,unknown>&{eventTypes:string};return {...value,eventTypes:JSON.parse(value.eventTypes) as string[]}});
  const deliveries=db.prepare("SELECT id,subscription_id AS subscriptionId,event_id AS eventId,event_type AS eventType,state,attempt_count AS attemptCount,available_at AS availableAt,delivered_at AS deliveredAt,last_status AS lastStatus,last_error_code AS lastErrorCode,created_at AS createdAt FROM webhook_outbox WHERE organization_id=? ORDER BY created_at DESC LIMIT 50").bind(user.organization.organizationId).all().results;
  const used=db.prepare("SELECT COALESCE(SUM(quantity),0) AS total FROM api_request_events WHERE user_id=? AND created_at>=? AND created_at<?").bind(user.id,periodStart,periodEnd).first<{total:number}>()?.total||0;
  const recent=db.prepare("SELECT route,method,status_code AS statusCode,created_at AS createdAt FROM api_request_events WHERE user_id=? ORDER BY created_at DESC LIMIT 8").bind(user.id).all().results;
  return NextResponse.json({access:effective.access!=="restricted"&&effective.access!=="suspended"&&effective.limits.apiAccess,plan:{id:user.plan,name:billingPlans[user.plan].name},limits:{requests:effective.limits.apiRequests,activeKeys:effective.limits.apiKeys},usage:{used,periodStart,periodEnd},keys,webhooks,deliveries,recent,capabilities:{restApi:true,webhookDelivery:true,mcpServer:true}});
}

export async function POST(request:Request) {
  const user=await getCurrentUser();
  if(!user)return NextResponse.json({error:"请先登录"},{status:401});
  await ensureApiAccessSchema();
  if(!can(user.organization.roleKey as OrganizationRoleKey,permissions.apiManage))return NextResponse.json({error:"没有管理 API 配置的权限"},{status:403});
  const body=await request.json().catch(()=>null) as {action?:string;name?:string;id?:string;url?:string;events?:string[];projectId?:string|null;scopes?:DeveloperScope[];projectIds?:"*"|string[];expiresAt?:number|null;rateLimitPolicy?:Record<string,number>} | null;
  if(!body?.action)return NextResponse.json({error:"请求无效"},{status:400});
  if(await consumeRateLimit("api_access",user.id,request,12,60))return NextResponse.json({error:"操作过于频繁，请稍后再试"},{status:429});
  if(body.action==="create_key"){
    try { const created=await createApiKey(user,{name:body.name||"默认密钥",scopes:Array.isArray(body.scopes)?body.scopes:undefined,projectIds:body.projectIds,expiresAt:body.expiresAt,rateLimitPolicy:body.rateLimitPolicy}); await writeAudit("api_key_created",user.id,request,JSON.stringify({keyId:created.record.id,scopes:created.record.scopes,projectIds:created.record.projectIds,expiresAt:created.record.expiresAt})); return NextResponse.json(created,{status:201}); }
    catch(error){const code=error instanceof Error?error.message:"";return NextResponse.json({error:code==="PLAN_REQUIRED"?"当前套餐不包含 API 访问，请升级到 Pro 或 Business。":"已达到当前套餐的 API Key 上限。"},{status:code==="PLAN_REQUIRED"?403:409});}
  }
  if(body.action==="revoke_key"){
    try{const record=await revokeApiKey(user,body.id||"");await writeAudit("api_key_revoked",user.id,request,record.id);return NextResponse.json({ok:true});}catch{return NextResponse.json({error:"API Key 不存在或已撤销"},{status:404});}
  }
  if(body.action==="rotate_key"){
    try{const created=await rotateApiKey(user,body.id||"");await writeAudit("api_key_rotated",user.id,request,JSON.stringify({oldKeyId:body.id,newKeyId:created.record.id}));return NextResponse.json(created,{status:201});}catch{return NextResponse.json({error:"API Key 不存在或无法轮换"},{status:404});}
  }
  if(body.action==="create_webhook"){
    try{commerceService().authorize(commercialSubject(user),"apiAccess");}catch(error){if(error instanceof CommerceError)return NextResponse.json({error:error.message,code:error.code},{status:error.status});throw error;}
    if(body.projectId&&!await ownedProject(user.organization.organizationId,body.projectId))return NextResponse.json({error:"项目不存在"},{status:404});
    try{const created=await createWebhookSubscription(user,{url:body.url||"",events:body.events?.length?body.events:["audit.completed"],projectId:body.projectId});await writeAudit("webhook_created",user.id,request,JSON.stringify({subscriptionId:created.subscription.id,projectId:created.subscription.projectId,eventTypes:created.subscription.eventTypes}));return NextResponse.json(created,{status:201});}catch(error){return NextResponse.json({error:error instanceof Error&&error.message==="INVALID_WEBHOOK_EVENTS"?"Webhook 事件类型无效":"请输入安全有效的 HTTPS URL"},{status:400});}
  }
  if(body.action==="delete_webhook"){
    try{await disableWebhookSubscription(user,body.id||"");await writeAudit("webhook_disabled",user.id,request,body.id);return NextResponse.json({ok:true});}catch{return NextResponse.json({error:"Webhook 不存在"},{status:404});}
  }
  if(body.action==="retry_webhook"){
    try{await retryWebhookDelivery(user,body.id||"");await writeAudit("webhook_delivery_retried",user.id,request,body.id);return NextResponse.json({ok:true});}catch{return NextResponse.json({error:"该投递当前不可重试"},{status:409});}
  }
  return NextResponse.json({error:"不支持的操作"},{status:400});
}
