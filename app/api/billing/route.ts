import { NextResponse } from "next/server";
import { getCurrentUser, getDatabase } from "../../../lib/auth";
import { billingPaymentState, billingPlans, commerceRepository, commerceService, commercialSubject, ensureBillingSchema } from "../../../lib/billing";

export async function GET(){
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:"请先登录"},{status:401});
  await ensureBillingSchema();const db=getDatabase(),subject=commercialSubject(user),commerce=commerceService();
  const effective=commerce.resolve(subject),credits=commerce.balance(subject),subscription=commerceRepository().subscription(subject.organizationId);
  if(!subscription)return NextResponse.json({error:"订阅状态暂时不可用"},{status:503});
  const commercialUsage=Object.fromEntries(commerce.usageTotals(subject).map(row=>[row.metric,{final:Number(row.final),pending:Number(row.pending)}])) as Record<string,{final:number;pending:number}>;
  const legacyRows=db.prepare(`SELECT metric,COALESCE(SUM(quantity),0) AS quantity FROM usage_events WHERE user_id=? AND created_at>=? AND created_at<=? GROUP BY metric`).bind(user.id,subscription.currentPeriodStart,subscription.currentPeriodEnd).all<{metric:string;quantity:number}>().results;
  const legacy=Object.fromEntries(legacyRows.map(row=>[row.metric,Number(row.quantity)]));
  const metric=(key:string)=>({final:Number(commercialUsage[key]?.final??0)+Number(legacy[key]??0),pending:Number(commercialUsage[key]?.pending??0)});
  const projects=db.prepare("SELECT COUNT(*) AS total FROM projects WHERE organization_id=? AND status!='pending_deletion'").bind(subject.organizationId).first<{total:number}>()?.total??0;
  const members=db.prepare("SELECT COUNT(*) AS total FROM identity_memberships WHERE organization_id=? AND status='active'").bind(subject.organizationId).first<{total:number}>()?.total??0;
  const pendingInvites=db.prepare("SELECT COUNT(*) AS total FROM identity_invitations WHERE organization_id=? AND status='pending' AND expires_at>?").bind(subject.organizationId,Math.floor(Date.now()/1000)).first<{total:number}>()?.total??0;
  const invoices=db.prepare(`SELECT id,invoice_number AS invoiceNumber,period_start AS periodStart,period_end AS periodEnd,amount_cents AS amountCents,currency,status,download_url AS downloadUrl,created_at AS createdAt FROM billing_invoices WHERE organization_id=? ORDER BY created_at DESC LIMIT 50`).bind(subject.organizationId).all().results;
  const paymentMethods=db.prepare(`SELECT id,provider,brand,last4,expiry_month AS expiryMonth,expiry_year AS expiryYear,is_default AS isDefault,created_at AS createdAt FROM billing_payment_methods WHERE organization_id=? ORDER BY is_default DESC,created_at DESC`).bind(subject.organizationId).all().results;
  const history=db.prepare(`SELECT id,event_type AS eventType,description,created_at AS createdAt FROM billing_events WHERE organization_id=? ORDER BY created_at DESC LIMIT 50`).bind(subject.organizationId).all().results;
  const catalogPlan=billingPlans[effective.planKey],limits=effective.limits;
  const plan={...catalogPlan,projectLimit:limits.projects,monthlyPageLimit:limits.pagesPerMonth,pageLimit:limits.pagesPerAudit,keywordLimit:limits.keywords,aiCreditLimit:limits.monthlyCredits,contentLimit:limits.contentItems,teamSeatLimit:limits.seats,agents:limits.agents,retentionDays:limits.retentionDays,storageBytes:limits.storageBytes,apiRequestLimit:limits.apiRequests,apiAccess:limits.apiAccess,integrations:limits.integrations,support:limits.support};
  const paidThisPeriod=(invoices as Array<{status:string;createdAt:number;amountCents:number}>).filter(row=>row.status==="paid"&&row.createdAt>=subscription.currentPeriodStart&&row.createdAt<=subscription.currentPeriodEnd).reduce((sum,row)=>sum+row.amountCents,0);
  const payment=billingPaymentState();
  const recentCredits=commerceRepository().recentLedger(subject.organizationId,25).map(({id,entryType,amount,taskId,priceVersion,createdAt})=>({id,entryType,amount,taskId,priceVersion,createdAt}));
  return NextResponse.json({
    user:{name:user.name,email:user.email,plan:user.plan,trialEndsAt:user.trialEndsAt},plan,plans:Object.values(billingPlans),
    catalog:{version:effective.catalogVersion,priceVersion:effective.priceVersion,currency:effective.currency,capturedAt:credits.capturedAt},
    subscription:{state:effective.subscriptionState,access:effective.access,version:effective.version,validUntil:effective.validUntil,scheduledPlanKey:effective.scheduledPlanKey,scheduledChangeAt:effective.scheduledChangeAt},
    entitlements:effective.limits,payment,providerConfigured:payment.enabled,
    period:{start:subscription.currentPeriodStart,end:subscription.currentPeriodEnd,spendCents:paidThisPeriod,renewalAt:effective.planKey==="trial"?user.trialEndsAt:subscription.currentPeriodEnd+1,autoRenew:false},
    credits:{...credits,limit:limits.monthlyCredits,priceVersion:effective.priceVersion,recent:recentCredits},
    usage:{pagesCrawled:metric("pages_crawled").final,aiCredits:credits.committed,contentGenerated:metric("content_generated").final,projects,teamMembers:members,pendingInvites,pending:{pagesCrawled:metric("pages_crawled").pending,contentGenerated:metric("content_generated").pending},capturedAt:credits.capturedAt,state:credits.state},
    invoices,paymentMethods,history,
  });
}

export async function POST(){
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:"请先登录"},{status:401});
  return NextResponse.json({error:"支付资质审批中，在线结算和 Credits 购买尚未开放",code:"PAYMENT_APPROVAL_PENDING",retryable:false},{status:503});
}
