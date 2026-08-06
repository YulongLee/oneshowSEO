import { NextResponse } from "next/server";
import { getCurrentUser, getDatabase } from "../../../lib/auth";
import { billingPaymentState, billingPlans, commerceRepository, commerceService, commercialSubject, ensureBillingSchema } from "../../../lib/billing";
import {can,permissions,type OrganizationRoleKey} from "../../../platform/modules/identity/authorization";

export async function GET(){
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:"请先登录"},{status:401});if(!can(user.organization.roleKey as OrganizationRoleKey,permissions.billingRead))return NextResponse.json({error:"没有查看计费数据的权限"},{status:403});
  await ensureBillingSchema();const db=getDatabase(),subject=commercialSubject(user),commerce=commerceService();
  const effective=commerce.resolve(subject),credits=commerce.balance(subject),subscription=commerceRepository().subscription(subject.organizationId);
  if(!subscription)return NextResponse.json({error:"订阅状态暂时不可用"},{status:503});
  const commercialUsage=Object.fromEntries(commerce.usageSummary(subject).map(row=>[row.metric,{final:row.final,pending:row.pending}])) as Record<string,{final:number;pending:number}>;
  const legacyRows=db.prepare(`SELECT metric,COALESCE(SUM(quantity),0) AS quantity FROM usage_events WHERE user_id=? AND created_at>=? AND created_at<=? GROUP BY metric`).bind(user.id,subscription.currentPeriodStart,subscription.currentPeriodEnd).all<{metric:string;quantity:number}>().results;
  const legacy=Object.fromEntries(legacyRows.map(row=>[row.metric,Number(row.quantity)]));
  const metric=(key:string)=>({final:Number(commercialUsage[key]?.final??0)+Number(legacy[key]??0),pending:Number(commercialUsage[key]?.pending??0)});
  const projects=db.prepare("SELECT COUNT(*) AS total FROM projects WHERE organization_id=? AND status!='pending_deletion'").bind(subject.organizationId).first<{total:number}>()?.total??0;
  const members=db.prepare("SELECT COUNT(*) AS total FROM identity_memberships WHERE organization_id=? AND status='active'").bind(subject.organizationId).first<{total:number}>()?.total??0;
  const pendingInvites=db.prepare("SELECT COUNT(*) AS total FROM identity_invitations WHERE organization_id=? AND status='pending' AND expires_at>?").bind(subject.organizationId,Math.floor(Date.now()/1000)).first<{total:number}>()?.total??0;
  const invoices=db.prepare(`SELECT * FROM (
    SELECT id,invoice_number AS invoiceNumber,period_start AS periodStart,period_end AS periodEnd,amount_cents AS amountCents,currency,state AS status,hosted_url AS downloadUrl,provider_created_at AS createdAt FROM commerce_provider_invoices WHERE organization_id=?
    UNION ALL
    SELECT id,invoice_number AS invoiceNumber,period_start AS periodStart,period_end AS periodEnd,amount_cents AS amountCents,currency,status,download_url AS downloadUrl,created_at AS createdAt FROM billing_invoices legacy WHERE organization_id=? AND (provider_invoice_id IS NULL OR NOT EXISTS(SELECT 1 FROM commerce_provider_invoices provider WHERE provider.invoice_ref=legacy.provider_invoice_id))
  ) ORDER BY createdAt DESC LIMIT 50`).bind(subject.organizationId,subject.organizationId).all().results;
  const paymentMethods=db.prepare(`SELECT id,provider,brand,last4,expiry_month AS expiryMonth,expiry_year AS expiryYear,is_default AS isDefault,created_at AS createdAt FROM billing_payment_methods WHERE organization_id=? ORDER BY is_default DESC,created_at DESC`).bind(subject.organizationId).all().results;
  const history=db.prepare(`SELECT id,event_type AS eventType,description,created_at AS createdAt FROM billing_events WHERE organization_id=? ORDER BY created_at DESC LIMIT 50`).bind(subject.organizationId).all().results;
  const catalogPlan=billingPlans[effective.planKey],limits=effective.limits;
  const plan={...catalogPlan,projectLimit:limits.projects,monthlyPageLimit:limits.pagesPerMonth,pageLimit:limits.pagesPerAudit,keywordLimit:limits.keywords,aiCreditLimit:limits.monthlyCredits,contentLimit:limits.contentItems,teamSeatLimit:limits.seats,agents:limits.agents,retentionDays:limits.retentionDays,storageBytes:limits.storageBytes,apiRequestLimit:limits.apiRequests,apiAccess:limits.apiAccess,integrations:limits.integrations,support:limits.support};
  const paidThisPeriod=(invoices as Array<{status:string;createdAt:number;amountCents:number}>).filter(row=>row.status==="paid"&&row.createdAt>=subscription.currentPeriodStart&&row.createdAt<=subscription.currentPeriodEnd).reduce((sum,row)=>sum+row.amountCents,0);
  const payment=billingPaymentState();
  const recentCredits=commerceRepository().recentLedger(subject.organizationId,25).map(({id,entryType,amount,taskId,priceVersion,createdAt})=>({id,entryType,amount,taskId,priceVersion,createdAt}));
  const alert=(key:string,label:string,used:number,pending:number,limit:number|null)=>{if(limit===null)return null;const percent=limit===0?(used+pending>0?100:0):Math.min(100,Math.round((used+pending)/limit*100));return percent<80?null:{key,label,used,pending,limit,percent,level:percent>=100?"critical":"warning"};};
  const usageAlerts=[alert("pages_crawled","每月页面抓取",metric("pages_crawled").final,metric("pages_crawled").pending,limits.pagesPerMonth),alert("ai_credits","AI Credits",credits.committed,credits.reserved,limits.monthlyCredits),alert("content_generated","内容生成",metric("content_generated").final,metric("content_generated").pending,limits.contentItems),alert("projects","项目",projects,0,limits.projects),alert("seats","团队席位",members,pendingInvites,limits.seats)].filter(Boolean);
  return NextResponse.json({
    user:{name:user.name,email:user.email,plan:user.plan,trialEndsAt:user.trialEndsAt},plan,plans:Object.values(billingPlans),
    catalog:{version:effective.catalogVersion,priceVersion:effective.priceVersion,currency:effective.currency,capturedAt:credits.capturedAt},
    subscription:{state:effective.subscriptionState,access:effective.access,version:effective.version,validUntil:effective.validUntil,scheduledPlanKey:effective.scheduledPlanKey,scheduledChangeAt:effective.scheduledChangeAt},
    entitlements:effective.limits,payment,providerConfigured:payment.enabled,
    period:{start:subscription.currentPeriodStart,end:subscription.currentPeriodEnd,spendCents:paidThisPeriod,renewalAt:effective.planKey==="trial"?user.trialEndsAt:subscription.currentPeriodEnd+1,autoRenew:false},
    credits:{...credits,limit:limits.monthlyCredits,priceVersion:effective.priceVersion,recent:recentCredits},
    usage:{pagesCrawled:metric("pages_crawled").final,aiCredits:credits.committed,contentGenerated:metric("content_generated").final,projects,teamMembers:members,pendingInvites,pending:{pagesCrawled:metric("pages_crawled").pending,aiCredits:credits.reserved,contentGenerated:metric("content_generated").pending},alerts:usageAlerts,capturedAt:credits.capturedAt,state:credits.state},
    invoices,paymentMethods,history,
  });
}

export async function POST(){
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:"请先登录"},{status:401});if(!can(user.organization.roleKey as OrganizationRoleKey,permissions.billingManage))return NextResponse.json({error:"没有管理计费的权限"},{status:403});
  return NextResponse.json({error:"支付资质审批中，在线结算和 Credits 购买尚未开放",code:"PAYMENT_APPROVAL_PENDING",retryable:false},{status:503});
}
