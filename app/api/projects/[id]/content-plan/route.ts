import { accessibleContentProject } from "../../../../../lib/content-access";
import { NextResponse } from "next/server";
import { getCurrentUser, writeAudit } from "../../../../../lib/auth";
import { ensureProductSchema } from "../../../../../lib/product";
import { can, permissions, type OrganizationRoleKey } from "../../../../../platform/modules/identity/authorization";
import { CONTENT_OPPORTUNITY_STATES, CONTENT_PLAN_STATES, createContentBrief, readContentPlanning, setOpportunityStatus, updateContentPlan } from "../../../../../lib/content-planning";

const value=(input:unknown,max:number)=>typeof input==="string"?input.trim().slice(0,max):"";
const list=(input:unknown,maxItems=20)=>Array.isArray(input)?input.filter((item):item is string=>typeof item==="string").map(item=>item.trim()).filter(Boolean).slice(0,maxItems):[];

export async function GET(_:Request,context:{params:Promise<{id:string}>}) {
  const user=await getCurrentUser(); if(!user) return NextResponse.json({error:"请先登录"},{status:401});
  await ensureProductSchema(); const {id}=await context.params;
  if(!await accessibleContentProject(user,id)) return NextResponse.json({error:"项目不存在"},{status:404});
  return NextResponse.json(readContentPlanning(user.organization.organizationId,id),{headers:{"cache-control":"private, no-store"}});
}

export async function POST(request:Request,context:{params:Promise<{id:string}>}) {
  const user=await getCurrentUser(); if(!user) return NextResponse.json({error:"请先登录"},{status:401});
  await ensureProductSchema(); const {id}=await context.params,project=await accessibleContentProject(user,id);
  if(!project||project.status!=="active") return NextResponse.json({error:"项目不存在或已停用"},{status:404});
  if(!can(user.organization.roleKey as OrganizationRoleKey,permissions.contentCreate)) return NextResponse.json({error:"没有创建内容计划的权限"},{status:403});
  const raw=await request.json().catch(()=>({})) as Record<string,unknown>;
  if(raw.action==="set_opportunity_status") {
    const opportunityId=value(raw.opportunityId,128),status=value(raw.status,32);
    if(!opportunityId||!CONTENT_OPPORTUNITY_STATES.includes(status as never)) return NextResponse.json({error:"机会状态无效"},{status:400});
    try { setOpportunityStatus({organizationId:user.organization.organizationId,projectId:id,opportunityId,accountId:user.id,status:status as never}); }
    catch { return NextResponse.json({error:"内容机会不存在"},{status:404}); }
    await writeAudit("content_opportunity_status_changed",user.id,request,JSON.stringify({projectId:id,opportunityId,status}));
    return NextResponse.json({opportunityId,status});
  }
  if(raw.action==="update_plan") {
    const planId=value(raw.planId,128),status=value(raw.status,32),priority=Math.max(0,Math.min(100,Number(raw.priority))),scheduledAt=raw.scheduledAt?Math.floor(new Date(String(raw.scheduledAt)).getTime()/1000):null;
    if(!planId||!CONTENT_PLAN_STATES.includes(status as never)||!Number.isFinite(priority)||scheduledAt!==null&&!Number.isFinite(scheduledAt)) return NextResponse.json({error:"内容计划更新参数无效"},{status:400});
    if(!["UNSCHEDULED","SCHEDULED"].includes(status))return NextResponse.json({error:"生成和发布状态由执行结果更新，不能手工标为完成"},{status:409});
    try { const updated=updateContentPlan({organizationId:user.organization.organizationId,projectId:id,planId,scheduledAt,priority,status:status as never});await writeAudit("content_plan_updated",user.id,request,JSON.stringify({projectId:id,...updated}));return NextResponse.json(updated); }
    catch(error) { if(error instanceof Error&&error.message==="CONTENT_PLAN_IN_EXECUTION")return NextResponse.json({error:"该计划已开始执行，不能修改排期或完成状态"},{status:409});if(error instanceof Error&&error.message==="CONTENT_PLAN_NOT_FOUND") return NextResponse.json({error:"内容计划不存在"},{status:404});throw error; }
  }
  const opportunityId=value(raw.opportunityId,128)||null,topic=value(raw.topic,180),primaryKeyword=value(raw.primaryKeyword,160),audience=value(raw.audience,300),searchIntent=value(raw.searchIntent,80),contentGoal=value(raw.contentGoal,300),contentType=value(raw.contentType,60),suggestedWordCount=Number(raw.suggestedWordCount),targetPlatforms=list(raw.targetPlatforms,12),secondaryKeywords=list(raw.secondaryKeywords),outline=list(raw.outline,30),priority=Math.max(0,Math.min(100,Number(raw.priority)||50)),scheduledAt=raw.scheduledAt?Math.floor(new Date(String(raw.scheduledAt)).getTime()/1000):null;
  if(!topic||!primaryKeyword||!audience||!searchIntent||!contentGoal||!contentType||!Number.isInteger(suggestedWordCount)||suggestedWordCount<100||suggestedWordCount>20000||!targetPlatforms.length||!outline.length||scheduledAt!==null&&!Number.isFinite(scheduledAt)) return NextResponse.json({error:"请完整填写内容简报、结构和目标平台",code:"CONTENT_PLAN_BRIEF_INVALID"},{status:400});
  let created;
  try { created=createContentBrief({organizationId:user.organization.organizationId,accountId:user.id,projectId:id,opportunityId,topic,primaryKeyword,secondaryKeywords,audience,searchIntent,contentGoal,contentType,suggestedWordCount,outline,targetPlatforms,priority,scheduledAt}); }
  catch(error) { if(error instanceof Error&&error.message==="CONTENT_OPPORTUNITY_NOT_FOUND") return NextResponse.json({error:"内容机会不存在"},{status:404}); throw error; }
  await writeAudit("content_brief_created",user.id,request,JSON.stringify({projectId:id,opportunityId,briefId:created.briefId,planId:created.planId,scheduled:Boolean(scheduledAt)}));
  return NextResponse.json(created,{status:201});
}
