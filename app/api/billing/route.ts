import { NextResponse } from "next/server";
import { getCurrentUser, getDatabase } from "../../../lib/auth";
import { billingPlans, billingProviderConfigured, ensureBillingSchema } from "../../../lib/billing";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({error:"请先登录"},{status:401});
  await ensureBillingSchema();
  const db = getDatabase();
  const now = new Date();
  const periodStart = Math.floor(new Date(now.getFullYear(),now.getMonth(),1).getTime()/1000);
  const periodEnd = Math.floor(new Date(now.getFullYear(),now.getMonth()+1,1).getTime()/1000)-1;
  const usageRows = db.prepare(`SELECT metric,COALESCE(SUM(quantity),0) AS quantity FROM usage_events WHERE user_id=? AND created_at>=? AND created_at<=? GROUP BY metric`).bind(user.id,periodStart,periodEnd).all().results as Array<{metric:string;quantity:number}>;
  const usage = Object.fromEntries(usageRows.map(row=>[row.metric,Number(row.quantity)]));
  const projects = db.prepare("SELECT COUNT(*) AS total FROM projects WHERE user_id=?").bind(user.id).first<{total:number}>()?.total||0;
  const team = db.prepare(`SELECT COUNT(*) AS total FROM project_members pm JOIN projects p ON p.id=pm.project_id WHERE p.user_id=? AND pm.status='active'`).bind(user.id).first<{total:number}>()?.total||0;
  const pendingInvites = db.prepare(`SELECT COUNT(*) AS total FROM project_invites pi JOIN projects p ON p.id=pi.project_id WHERE p.user_id=? AND pi.status='pending' AND pi.expires_at>?`).bind(user.id,Math.floor(Date.now()/1000)).first<{total:number}>()?.total||0;
  const invoices = db.prepare(`SELECT id,invoice_number AS invoiceNumber,period_start AS periodStart,period_end AS periodEnd,amount_cents AS amountCents,currency,status,download_url AS downloadUrl,created_at AS createdAt FROM billing_invoices WHERE user_id=? ORDER BY created_at DESC LIMIT 50`).bind(user.id).all().results;
  const paymentMethods = db.prepare(`SELECT id,provider,brand,last4,expiry_month AS expiryMonth,expiry_year AS expiryYear,is_default AS isDefault,created_at AS createdAt FROM billing_payment_methods WHERE user_id=? ORDER BY is_default DESC,created_at DESC`).bind(user.id).all().results;
  const history = db.prepare(`SELECT id,event_type AS eventType,description,created_at AS createdAt FROM billing_events WHERE user_id=? ORDER BY created_at DESC LIMIT 50`).bind(user.id).all().results;
  const plan = billingPlans[user.plan];
  const paidThisPeriod = (invoices as Array<{status:string;createdAt:number;amountCents:number}>).filter(row=>row.status==='paid'&&row.createdAt>=periodStart&&row.createdAt<=periodEnd).reduce((sum,row)=>sum+row.amountCents,0);
  return NextResponse.json({
    user:{name:user.name,email:user.email,plan:user.plan,trialEndsAt:user.trialEndsAt},
    plan,
    plans:Object.values(billingPlans),
    providerConfigured:billingProviderConfigured(),
    period:{start:periodStart,end:periodEnd,spendCents:paidThisPeriod,renewalAt:user.plan==='trial'?user.trialEndsAt:periodEnd+1,autoRenew:false},
    usage:{pagesCrawled:usage.pages_crawled||0,aiCredits:usage.ai_credits||0,contentGenerated:usage.content_generated||0,projects,teamMembers:1+team,pendingInvites},
    invoices,paymentMethods,history,
  });
}
