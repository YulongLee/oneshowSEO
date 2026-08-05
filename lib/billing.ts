import { SqliteCommerceRepository } from "../platform/adapters/sqlite/commerce-repository";
import { commercialPlan, planCatalog, type PlanKey } from "../platform/modules/commerce/catalog";
import { CommercialEntitlementService } from "../platform/modules/commerce/service";
import type { CommercialSubject } from "../platform/modules/commerce";
import { ensureProductSchema } from "./product";
import { getDatabase, type AppUser } from "./auth";

export type BillingPlan = {
  id: PlanKey;name:string;nameEn:string;catalogVersion:string;priceVersion:string;currency:string;monthlyPriceCents:number;
  projectLimit:number;monthlyPageLimit:number;pageLimit:number;keywordLimit:number;aiCreditLimit:number;contentLimit:number|null;
  teamSeatLimit:number;agents:number;scheduledTasks:string;retentionDays:number;storageBytes:number;apiRequestLimit:number;apiKeyLimit:number;apiAccess:boolean;integrations:boolean;support:string;
};

function publicPlan(key:PlanKey):BillingPlan{
  const plan=commercialPlan(key),limits=plan.entitlements;
  return{id:key,name:plan.name["zh-CN"],nameEn:plan.name["en-US"],catalogVersion:plan.catalogVersion,priceVersion:plan.priceVersion,currency:plan.currency,monthlyPriceCents:plan.monthlyPriceCents,
    projectLimit:limits.projects,monthlyPageLimit:limits.pagesPerMonth,pageLimit:limits.pagesPerAudit,keywordLimit:limits.keywords,aiCreditLimit:limits.monthlyCredits,contentLimit:limits.contentItems,
    teamSeatLimit:limits.seats,agents:limits.agents,scheduledTasks:limits.scheduledRunsPerDay===null?"不限":limits.scheduledRunsPerDay===0?"手动":`每日 ${limits.scheduledRunsPerDay} 次`,retentionDays:limits.retentionDays,storageBytes:limits.storageBytes,apiRequestLimit:limits.apiRequests,apiKeyLimit:limits.apiKeys,apiAccess:limits.apiAccess,integrations:limits.integrations,support:limits.support};
}

export const billingPlans=Object.fromEntries((Object.keys(planCatalog) as PlanKey[]).map(key=>[key,publicPlan(key)])) as Record<PlanKey,BillingPlan>;

let repository:SqliteCommerceRepository|undefined;
let service:CommercialEntitlementService|undefined;

export async function ensureBillingSchema():Promise<void>{
  await ensureProductSchema();const database=getDatabase();
  database.exec(`
    CREATE TABLE IF NOT EXISTS billing_invoices (
      id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,organization_id TEXT,
      invoice_number TEXT NOT NULL UNIQUE,period_start INTEGER NOT NULL,period_end INTEGER NOT NULL,amount_cents INTEGER NOT NULL CHECK(amount_cents>=0),
      currency TEXT NOT NULL DEFAULT 'USD',status TEXT NOT NULL CHECK(status IN ('draft','open','paid','void','uncollectible')),
      provider_invoice_id TEXT,download_url TEXT,created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS billing_invoices_user_idx ON billing_invoices(user_id,created_at);
    CREATE TABLE IF NOT EXISTS billing_payment_methods (
      id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,organization_id TEXT,
      provider TEXT NOT NULL,brand TEXT NOT NULL,last4 TEXT NOT NULL,expiry_month INTEGER NOT NULL,expiry_year INTEGER NOT NULL,
      is_default INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS billing_methods_user_idx ON billing_payment_methods(user_id,is_default);
    CREATE TABLE IF NOT EXISTS billing_events (
      id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,organization_id TEXT,
      event_type TEXT NOT NULL,description TEXT NOT NULL,created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS billing_events_user_idx ON billing_events(user_id,created_at);
  `);
  for(const table of ["billing_invoices","billing_payment_methods","billing_events"]){
    const columns=database.prepare(`PRAGMA table_info(${table})`).all<{name:string}>().results;
    if(!columns.some(column=>column.name==="organization_id"))database.exec(`ALTER TABLE ${table} ADD COLUMN organization_id TEXT`);
    database.exec(`CREATE INDEX IF NOT EXISTS ${table}_organization_idx ON ${table}(organization_id,created_at)`);
  }
  database.exec(`
    UPDATE billing_invoices SET organization_id=COALESCE(organization_id,(SELECT organization_id FROM identity_memberships WHERE user_id=billing_invoices.user_id AND status='active' ORDER BY created_at LIMIT 1));
    UPDATE billing_payment_methods SET organization_id=COALESCE(organization_id,(SELECT organization_id FROM identity_memberships WHERE user_id=billing_payment_methods.user_id AND status='active' ORDER BY created_at LIMIT 1));
    UPDATE billing_events SET organization_id=COALESCE(organization_id,(SELECT organization_id FROM identity_memberships WHERE user_id=billing_events.user_id AND status='active' ORDER BY created_at LIMIT 1));
  `);
  commerceRepository().ensureSchema();
  const now=Math.floor(Date.now()/1000);
  for(const plan of Object.values(planCatalog)){
    const entitlements=JSON.stringify(plan.entitlements);
    const existing=database.prepare(`SELECT price_version AS priceVersion,monthly_price_cents AS monthlyPriceCents,entitlements_json AS entitlementsJson FROM commerce_plan_versions WHERE plan_key=? AND catalog_version=? AND currency=?`).bind(plan.key,plan.catalogVersion,plan.currency).first<{priceVersion:string;monthlyPriceCents:number;entitlementsJson:string}>();
    if(existing&&(existing.priceVersion!==plan.priceVersion||existing.monthlyPriceCents!==plan.monthlyPriceCents||existing.entitlementsJson!==entitlements))throw new Error(`PLAN_CATALOG_VERSION_CONFLICT:${plan.key}:${plan.catalogVersion}`);
    database.prepare(`UPDATE commerce_plan_versions SET active=0 WHERE plan_key=? AND currency=? AND catalog_version<>?`).bind(plan.key,plan.currency,plan.catalogVersion).run();
    database.prepare(`INSERT OR IGNORE INTO commerce_plan_versions(plan_key,catalog_version,price_version,currency,monthly_price_cents,entitlements_json,active,created_at) VALUES (?,?,?,?,?,?,1,?)`).bind(plan.key,plan.catalogVersion,plan.priceVersion,plan.currency,plan.monthlyPriceCents,entitlements,now).run();
    database.prepare(`UPDATE commerce_plan_versions SET active=1 WHERE plan_key=? AND catalog_version=? AND currency=?`).bind(plan.key,plan.catalogVersion,plan.currency).run();
  }
}

export function commerceRepository(){return repository??=new SqliteCommerceRepository(getDatabase());}
export function commerceService(){return service??=new CommercialEntitlementService(commerceRepository());}
export function commercialSubject(user:AppUser):CommercialSubject{return{accountId:user.id,organizationId:user.organization.organizationId,organizationStatus:user.organization.organizationStatus,planKey:user.plan,trialEndsAt:user.trialEndsAt,accountCreatedAt:user.createdAt};}

export function billingProviderConfigured():boolean{return process.env.BILLING_LIVE_ENABLED==="true"&&Boolean(process.env.STRIPE_SECRET_KEY||process.env.PAYMENT_PROVIDER_SECRET);}
export function billingPaymentState(){return{enabled:billingProviderConfigured(),configured:Boolean(process.env.STRIPE_SECRET_KEY||process.env.PAYMENT_PROVIDER_SECRET),reason:billingProviderConfigured()?null:"PAYMENT_APPROVAL_PENDING" as string|null};}
