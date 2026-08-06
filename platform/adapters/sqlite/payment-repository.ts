import type { AppDatabase } from "../../../lib/database";
import { commercialPlan } from "../../modules/commerce/catalog";
import type { InvoiceState, PaymentProviderKey, PaymentReconciliation, PaymentRepository, PaymentWebhook, ProviderInvoice, ProviderSubscription } from "../../modules/commerce/payments";

type WebhookRow=Omit<PaymentWebhook,"event">&{eventJson:string};
type InvoiceRow={organizationId:string;customerRef:string;subscriptionRef:string|null;invoiceRef:string;invoiceNumber:string;state:InvoiceState;amountCents:number;currency:string;periodStart:number;periodEnd:number;hostedUrl:string|null;providerCreatedAt:number};
type ReconciliationRow=Omit<PaymentReconciliation,"details">&{detailsJson:string};

export class SqlitePaymentRepository implements PaymentRepository{
  constructor(private readonly database:AppDatabase){}
  ensureSchema(){
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS commerce_payment_webhook_inbox (
        id TEXT PRIMARY KEY,provider TEXT NOT NULL CHECK(provider IN ('sandbox')),provider_event_id TEXT NOT NULL,event_type TEXT NOT NULL,
        payload_sha256 TEXT NOT NULL CHECK(length(payload_sha256)=64),event_json TEXT NOT NULL CHECK(json_valid(event_json)),
        state TEXT NOT NULL CHECK(state IN ('received','processing','processed','failed','quarantined')),attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts>=0),
        received_at INTEGER NOT NULL,processing_started_at INTEGER,processed_at INTEGER,last_error TEXT,
        UNIQUE(provider,provider_event_id)
      );
      CREATE INDEX IF NOT EXISTS commerce_payment_webhook_pending_idx ON commerce_payment_webhook_inbox(provider,state,received_at,id);
      CREATE TABLE IF NOT EXISTS commerce_provider_invoices (
        id TEXT PRIMARY KEY,organization_id TEXT NOT NULL REFERENCES identity_organizations(id) ON DELETE CASCADE,provider TEXT NOT NULL CHECK(provider IN ('sandbox')),
        customer_ref TEXT NOT NULL,subscription_ref TEXT,invoice_ref TEXT NOT NULL,invoice_number TEXT NOT NULL,
        state TEXT NOT NULL CHECK(state IN ('draft','open','paid','void','uncollectible')),amount_cents INTEGER NOT NULL CHECK(amount_cents>=0),currency TEXT NOT NULL,
        period_start INTEGER NOT NULL,period_end INTEGER NOT NULL,hosted_url TEXT,provider_created_at INTEGER NOT NULL,last_provider_event_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,UNIQUE(provider,invoice_ref),CHECK(period_end>=period_start)
      );
      CREATE INDEX IF NOT EXISTS commerce_provider_invoices_org_time_idx ON commerce_provider_invoices(organization_id,provider_created_at DESC,id DESC);
      CREATE TABLE IF NOT EXISTS commerce_payment_reconciliations (
        id TEXT PRIMARY KEY,organization_id TEXT NOT NULL REFERENCES identity_organizations(id) ON DELETE CASCADE,provider TEXT NOT NULL CHECK(provider IN ('sandbox')),
        customer_ref TEXT NOT NULL,subscription_ref TEXT,status TEXT NOT NULL CHECK(status IN ('ok','attention')),
        subscription_corrections INTEGER NOT NULL CHECK(subscription_corrections>=0),invoice_corrections INTEGER NOT NULL CHECK(invoice_corrections>=0),
        pending_webhook_count INTEGER NOT NULL CHECK(pending_webhook_count>=0),details_json TEXT NOT NULL CHECK(json_valid(details_json)),created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS commerce_payment_reconciliation_org_time_idx ON commerce_payment_reconciliations(organization_id,created_at DESC,id DESC);
    `);
    const columns=this.database.prepare("PRAGMA table_info(commerce_subscriptions)").all<{name:string}>().results;
    if(!columns.some(column=>column.name==="provider_event_created_at"))this.database.exec("ALTER TABLE commerce_subscriptions ADD COLUMN provider_event_created_at INTEGER");
    if(!columns.some(column=>column.name==="last_provider_event_id"))this.database.exec("ALTER TABLE commerce_subscriptions ADD COLUMN last_provider_event_id TEXT");
    this.database.exec("CREATE UNIQUE INDEX IF NOT EXISTS commerce_subscriptions_provider_ref_idx ON commerce_subscriptions(provider_subscription_ref) WHERE provider_subscription_ref IS NOT NULL");
  }
  transaction<T>(operation:()=>T){return this.database.transaction(operation);}
  webhook(provider:PaymentProviderKey,eventId:string){const row=this.database.prepare(`SELECT id,provider,provider_event_id AS providerEventId,event_type AS eventType,payload_sha256 AS payloadSha256,event_json AS eventJson,state,attempts,received_at AS receivedAt,processing_started_at AS processingStartedAt,processed_at AS processedAt,last_error AS lastError FROM commerce_payment_webhook_inbox WHERE provider=? AND provider_event_id=?`).bind(provider,eventId).first<WebhookRow>();return row?this.mapWebhook(row):null;}
  insertWebhook(record:PaymentWebhook){this.database.prepare(`INSERT INTO commerce_payment_webhook_inbox(id,provider,provider_event_id,event_type,payload_sha256,event_json,state,attempts,received_at,processing_started_at,processed_at,last_error) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).bind(record.id,record.provider,record.providerEventId,record.eventType,record.payloadSha256,JSON.stringify(record.event),record.state,record.attempts,record.receivedAt,record.processingStartedAt,record.processedAt,record.lastError).run();}
  claimNextWebhook(provider:PaymentProviderKey,now:number,maxAttempts:number){return this.database.transaction(()=>{
    const candidate=this.database.prepare(`SELECT provider_event_id AS providerEventId FROM commerce_payment_webhook_inbox WHERE provider=? AND state IN ('received','failed') AND attempts<? ORDER BY received_at,id LIMIT 1`).bind(provider,maxAttempts).first<{providerEventId:string}>();if(!candidate)return null;
    const changed=this.database.prepare(`UPDATE commerce_payment_webhook_inbox SET state='processing',attempts=attempts+1,processing_started_at=?,last_error=NULL WHERE provider=? AND provider_event_id=? AND state IN ('received','failed') AND attempts<?`).bind(now,provider,candidate.providerEventId,maxAttempts).run().meta.changes;
    return changed?this.webhook(provider,candidate.providerEventId):null;
  });}
  completeWebhook(id:string,processedAt:number){this.database.prepare("UPDATE commerce_payment_webhook_inbox SET state='processed',processed_at=?,processing_started_at=NULL,last_error=NULL WHERE id=? AND state='processing'").bind(processedAt,id).run();}
  failWebhook(id:string,error:string,quarantine:boolean,processedAt:number){this.database.prepare("UPDATE commerce_payment_webhook_inbox SET state=?,processed_at=?,processing_started_at=NULL,last_error=? WHERE id=? AND state='processing'").bind(quarantine?"quarantined":"failed",processedAt,error,id).run();}
  recoverStaleWebhooks(staleBefore:number){return this.database.prepare("UPDATE commerce_payment_webhook_inbox SET state='failed',processing_started_at=NULL,last_error='PROCESSING_LEASE_EXPIRED' WHERE state='processing' AND processing_started_at<=?").bind(staleBefore).run().meta.changes;}
  pendingWebhookCount(provider:PaymentProviderKey){return this.database.prepare("SELECT COUNT(*) AS count FROM commerce_payment_webhook_inbox WHERE provider=? AND state IN ('received','processing','failed')").bind(provider).first<{count:number}>()?.count??0;}
  providerSubscription(subscriptionRef:string){const row=this.database.prepare(`SELECT organization_id AS organizationId,provider_customer_ref AS customerRef,provider_subscription_ref AS subscriptionRef,plan_key AS planKey,state,currency,current_period_start AS currentPeriodStart,current_period_end AS currentPeriodEnd,cancel_at_period_end AS cancelAtPeriodEnd,provider_event_created_at AS providerCreatedAt FROM commerce_subscriptions WHERE provider_subscription_ref=?`).bind(subscriptionRef).first<Omit<ProviderSubscription,"cancelAtPeriodEnd">&{cancelAtPeriodEnd:number}>();return row?{...row,cancelAtPeriodEnd:Boolean(row.cancelAtPeriodEnd)}:null;}
  applyProviderSubscription(snapshot:ProviderSubscription,eventId:string){
    const plan=commercialPlan(snapshot.planKey),existing=this.providerSubscription(snapshot.subscriptionRef),now=snapshot.providerCreatedAt;
    if(existing){const changed=this.database.prepare(`UPDATE commerce_subscriptions SET plan_key=?,state=?,source_type='provider',catalog_version=?,currency=?,current_period_start=?,current_period_end=?,grace_until=?,cancel_at_period_end=?,provider_customer_ref=?,version=version+1,provider_event_created_at=?,last_provider_event_id=?,updated_at=? WHERE provider_subscription_ref=? AND (provider_event_created_at<? OR (provider_event_created_at=? AND COALESCE(last_provider_event_id,'')<?))`).bind(snapshot.planKey,snapshot.state,plan.catalogVersion,snapshot.currency,snapshot.currentPeriodStart,snapshot.currentPeriodEnd,snapshot.state==="past_due"?snapshot.providerCreatedAt+7*86400:null,snapshot.cancelAtPeriodEnd?1:0,snapshot.customerRef,snapshot.providerCreatedAt,eventId,now,snapshot.subscriptionRef,snapshot.providerCreatedAt,snapshot.providerCreatedAt,eventId).run().meta.changes;return changed?"applied":"stale";}
    const changed=this.database.prepare(`UPDATE commerce_subscriptions SET plan_key=?,state=?,source_type='provider',catalog_version=?,currency=?,current_period_start=?,current_period_end=?,grace_until=?,cancel_at_period_end=?,provider_customer_ref=?,provider_subscription_ref=?,version=version+1,provider_event_created_at=?,last_provider_event_id=?,updated_at=? WHERE organization_id=? AND (provider_subscription_ref IS NULL OR provider_subscription_ref=?)`).bind(snapshot.planKey,snapshot.state,plan.catalogVersion,snapshot.currency,snapshot.currentPeriodStart,snapshot.currentPeriodEnd,snapshot.state==="past_due"?snapshot.providerCreatedAt+7*86400:null,snapshot.cancelAtPeriodEnd?1:0,snapshot.customerRef,snapshot.subscriptionRef,snapshot.providerCreatedAt,eventId,now,snapshot.organizationId,snapshot.subscriptionRef).run().meta.changes;
    if(!changed)throw new Error("PAYMENT_SUBSCRIPTION_ORGANIZATION_NOT_FOUND");return"applied";
  }
  providerInvoice(invoiceRef:string){return this.database.prepare(`SELECT organization_id AS organizationId,customer_ref AS customerRef,subscription_ref AS subscriptionRef,invoice_ref AS invoiceRef,invoice_number AS invoiceNumber,state,amount_cents AS amountCents,currency,period_start AS periodStart,period_end AS periodEnd,hosted_url AS hostedUrl,provider_created_at AS providerCreatedAt FROM commerce_provider_invoices WHERE provider='sandbox' AND invoice_ref=?`).bind(invoiceRef).first<InvoiceRow>();}
  applyProviderInvoice(invoice:ProviderInvoice,eventId:string){
    const existing=this.providerInvoice(invoice.invoiceRef),now=invoice.providerCreatedAt;
    if(existing){const changed=this.database.prepare(`UPDATE commerce_provider_invoices SET state=?,invoice_number=?,amount_cents=?,currency=?,period_start=?,period_end=?,hosted_url=?,subscription_ref=?,provider_created_at=?,last_provider_event_id=?,updated_at=? WHERE provider='sandbox' AND invoice_ref=? AND (provider_created_at<? OR (provider_created_at=? AND last_provider_event_id<?))`).bind(invoice.state,invoice.invoiceNumber,invoice.amountCents,invoice.currency,invoice.periodStart,invoice.periodEnd,invoice.hostedUrl,invoice.subscriptionRef,invoice.providerCreatedAt,eventId,now,invoice.invoiceRef,invoice.providerCreatedAt,invoice.providerCreatedAt,eventId).run().meta.changes;return changed?"applied":"stale";}
    this.database.prepare(`INSERT INTO commerce_provider_invoices(id,organization_id,provider,customer_ref,subscription_ref,invoice_ref,invoice_number,state,amount_cents,currency,period_start,period_end,hosted_url,provider_created_at,last_provider_event_id,created_at,updated_at) VALUES (?,?, 'sandbox',?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),invoice.organizationId,invoice.customerRef,invoice.subscriptionRef,invoice.invoiceRef,invoice.invoiceNumber,invoice.state,invoice.amountCents,invoice.currency,invoice.periodStart,invoice.periodEnd,invoice.hostedUrl,invoice.providerCreatedAt,eventId,now,now).run();return"applied";
  }
  appendReconciliation(record:PaymentReconciliation){this.database.prepare(`INSERT INTO commerce_payment_reconciliations(id,organization_id,provider,customer_ref,subscription_ref,status,subscription_corrections,invoice_corrections,pending_webhook_count,details_json,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).bind(record.id,record.organizationId,record.provider,record.customerRef,record.subscriptionRef,record.status,record.subscriptionCorrections,record.invoiceCorrections,record.pendingWebhookCount,JSON.stringify(record.details),record.createdAt).run();}
  recentReconciliations(organizationId:string,limit:number){return this.database.prepare(`SELECT id,organization_id AS organizationId,provider,customer_ref AS customerRef,subscription_ref AS subscriptionRef,status,subscription_corrections AS subscriptionCorrections,invoice_corrections AS invoiceCorrections,pending_webhook_count AS pendingWebhookCount,details_json AS detailsJson,created_at AS createdAt FROM commerce_payment_reconciliations WHERE organization_id=? ORDER BY created_at DESC,rowid DESC LIMIT ?`).bind(organizationId,Math.max(1,Math.min(100,limit))).all<ReconciliationRow>().results.map(row=>({...row,details:JSON.parse(row.detailsJson) as string[]}));}
  private mapWebhook(row:WebhookRow):PaymentWebhook{const{eventJson,...rest}=row;return{...rest,event:JSON.parse(eventJson)};}
}
