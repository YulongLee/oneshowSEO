import { NextResponse } from "next/server";
import { getCurrentUser, writeAudit } from "../../../../../lib/auth";
import { commerceService, commercialSubject, ensureBillingSchema } from "../../../../../lib/billing";
import { atomicTaskCreationService } from "../../../../../lib/execution";
import { ownedProject } from "../../../../../lib/product";
import { permissions, type OrganizationRoleKey } from "../../../../../platform/modules/identity/authorization";
import { CommerceError } from "../../../../../platform/modules/commerce/service";
import { TaskCreationError } from "../../../../../platform/modules/execution/task-creation";

const AUDIT_CREDIT_COST=10;
export async function POST(request:Request,context:{params:Promise<{id:string}>}){
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:"请先登录"},{status:401});
  const{id}=await context.params,project=await ownedProject(user.organization.organizationId,id);if(!project)return NextResponse.json({error:"项目不存在"},{status:404});if(project.status!=="active")return NextResponse.json({error:"项目已归档或停用，不能运行诊断"},{status:409});
  try{
    await ensureBillingSchema();const commerce=commerceService(),subject=commercialSubject(user),effective=commerce.authorize(subject,"pagesPerAudit",1,0),usage=commerce.usageTotals(subject).find(row=>row.metric==="pages_crawled"),currentPages=Number(usage?.final??0)+Number(usage?.pending??0);commerce.authorize(subject,"pagesPerMonth",1,currentPages);const pageLimit=Math.min(effective.limits.pagesPerAudit,effective.limits.pagesPerMonth-currentPages);
    const requestedKey=request.headers.get("idempotency-key")?.trim(),idempotencyKey=requestedKey&&/^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/.test(requestedKey)?requestedKey:`audit:${id}:${crypto.randomUUID()}`,correlationId=request.headers.get("traceparent")||`audit:${crypto.randomUUID()}`;
    const created=(await atomicTaskCreationService()).create({activeOrganizationId:user.organization.organizationId,organizationId:user.organization.organizationId,projectId:id,requestedByAccountId:user.id,role:user.organization.roleKey as OrganizationRoleKey,permission:permissions.auditsRun,subject,triggerType:"manual",taskType:"seo_audit",capability:"audit.run",input:{projectId:id,siteUrl:project.siteUrl,pageLimit,title:`${project.name} 网站诊断`,description:`抓取 ${project.host} 并生成证据审计报告`},locale:project.language==="en"?"en":"zh-CN",idempotencyKey,correlationId,entitlements:[{key:"pagesPerAudit",quantity:1,currentUsage:0},{key:"pagesPerMonth",quantity:1,currentUsage:currentPages}],creditCost:AUDIT_CREDIT_COST,queue:"agents",jobType:"seo.audit",priority:80,maxAttempts:3,timeoutSeconds:900});
    await writeAudit("site_audit_queued",user.id,request,JSON.stringify({projectId:id,taskId:created.task.id,jobId:created.job.id,creditsReserved:AUDIT_CREDIT_COST}));
    return NextResponse.json({taskId:created.task.id,jobId:created.job.id,state:created.task.state,creditsReserved:AUDIT_CREDIT_COST,duplicate:created.duplicate,correlationId},{status:202});
  }catch(error){if(error instanceof CommerceError||error instanceof TaskCreationError)return NextResponse.json({error:error.message,code:error.code},{status:error.status});console.error("Failed to queue audit",error);return NextResponse.json({error:"诊断任务创建失败，请稍后重试"},{status:500});}
}
