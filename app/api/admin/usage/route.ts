import { NextResponse } from "next/server";
import { commerceService, ensureBillingSchema } from "../../../../lib/billing";
import { getCurrentUser, getDatabase, writeAudit } from "../../../../lib/auth";
import { AuthorizationError, authorizePlatformAccount } from "../../../../platform/modules/identity/authorization";
import type { CommercialSubject } from "../../../../platform/modules/commerce";
import type { PlanKey } from "../../../../platform/modules/commerce/catalog";

type OrganizationRow={organizationId:string;organizationName:string;organizationStatus:string;accountId:string;planKey:PlanKey;trialEndsAt:number|null;accountCreatedAt:number};

async function adminOrResponse(){const user=await getCurrentUser();if(!user)return null;try{authorizePlatformAccount(user.role);return user;}catch(error){if(error instanceof AuthorizationError)return null;throw error;}}
const subject=(row:OrganizationRow):CommercialSubject=>({accountId:row.accountId,organizationId:row.organizationId,organizationStatus:row.organizationStatus,planKey:row.planKey,trialEndsAt:row.trialEndsAt,accountCreatedAt:row.accountCreatedAt});
const organizations=()=>getDatabase().prepare(`SELECT o.id AS organizationId,o.name AS organizationName,o.status AS organizationStatus,u.id AS accountId,u.plan AS planKey,u.trial_ends_at AS trialEndsAt,u.created_at AS accountCreatedAt FROM identity_organizations o JOIN users u ON u.id=o.owner_user_id ORDER BY o.created_at DESC LIMIT 200`).all<OrganizationRow>().results;
const view=(row:OrganizationRow)=>{const commerce=commerceService(),current=subject(row),effective=commerce.resolve(current),latest=commerce.recentUsageReconciliations(current,1)[0]??null,meters=commerce.usageSummary(current);return{organization:{id:row.organizationId,name:row.organizationName,status:effective.access,plan:effective.planKey},period:meters[0]?{start:meters[0].periodStart,end:meters[0].periodEnd}:null,meters,alerts:meters.filter(meter=>meter.alert!=="none"),latestReconciliation:latest};};

export async function GET(){const admin=await adminOrResponse();if(!admin)return NextResponse.json({error:"无权访问"},{status:403});await ensureBillingSchema();return NextResponse.json({organizations:organizations().map(view),capturedAt:Math.floor(Date.now()/1000)});}

export async function POST(request:Request){const admin=await adminOrResponse();if(!admin)return NextResponse.json({error:"无权访问"},{status:403});await ensureBillingSchema();const body=await request.json().catch(()=>null) as {organizationId?:string}|null;const rows=organizations().filter(row=>!body?.organizationId||row.organizationId===body.organizationId);if(body?.organizationId&&!rows.length)return NextResponse.json({error:"组织不存在"},{status:404});const correlationId=request.headers.get("x-correlation-id")?.slice(0,120)||crypto.randomUUID();const results=rows.map(row=>commerceService().reconcileUsage(subject(row),{actorAccountId:admin.id,correlationId}));await writeAudit("admin_usage_reconciliation",admin.id,request,JSON.stringify({organizationId:body?.organizationId??null,count:results.length,attention:results.filter(result=>result.status==="attention").length,correlationId}));return NextResponse.json({results},{status:201});}
