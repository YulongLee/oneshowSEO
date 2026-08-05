import type { AppDatabase } from "../../../lib/database";
import type { CommerceRepository, CreditBalance, CreditLedgerEntry, SubscriptionState, UsageMeterEvent } from "../../modules/commerce";
import type { PlanEntitlements, PlanKey } from "../../modules/commerce/catalog";

type SubscriptionRow={planKey:PlanKey;state:SubscriptionState;catalogVersion:string;currency:string;currentPeriodStart:number;currentPeriodEnd:number;graceUntil:number|null;version:number};

export class SqliteCommerceRepository implements CommerceRepository{
  constructor(private readonly database:AppDatabase){}

  ensureSchema(){
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS commerce_plan_versions (
        plan_key TEXT NOT NULL CHECK(plan_key IN ('trial','starter','pro','business')),
        catalog_version TEXT NOT NULL,
        price_version TEXT NOT NULL,
        currency TEXT NOT NULL,
        monthly_price_cents INTEGER NOT NULL CHECK(monthly_price_cents>=0),
        entitlements_json TEXT NOT NULL CHECK(json_valid(entitlements_json)),
        active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
        created_at INTEGER NOT NULL,
        PRIMARY KEY(plan_key,catalog_version,currency)
      );
      CREATE INDEX IF NOT EXISTS commerce_plan_versions_active_idx ON commerce_plan_versions(active,plan_key,currency,catalog_version);
      CREATE TABLE IF NOT EXISTS commerce_subscriptions (
        organization_id TEXT PRIMARY KEY REFERENCES identity_organizations(id) ON DELETE CASCADE,
        plan_key TEXT NOT NULL CHECK(plan_key IN ('trial','starter','pro','business')),
        state TEXT NOT NULL CHECK(state IN ('trial','active','past_due','cancelled','expired','suspended')),
        source_type TEXT NOT NULL DEFAULT 'legacy' CHECK(source_type IN ('legacy','manual','provider')),
        catalog_version TEXT NOT NULL,
        currency TEXT NOT NULL,
        current_period_start INTEGER NOT NULL,
        current_period_end INTEGER NOT NULL,
        grace_until INTEGER,
        cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
        provider_customer_ref TEXT,
        provider_subscription_ref TEXT,
        version INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        CHECK(current_period_end>=current_period_start)
      );
      CREATE INDEX IF NOT EXISTS commerce_subscriptions_state_period_idx ON commerce_subscriptions(state,current_period_end);
      CREATE TABLE IF NOT EXISTS commerce_entitlement_overrides (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES identity_organizations(id) ON DELETE CASCADE,
        entitlement_key TEXT NOT NULL,
        value_json TEXT NOT NULL CHECK(json_valid(value_json)),
        reason TEXT NOT NULL,
        valid_from INTEGER NOT NULL,
        valid_until INTEGER,
        version INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        CHECK(valid_until IS NULL OR valid_until>valid_from),
        UNIQUE(organization_id,entitlement_key,version)
      );
      CREATE INDEX IF NOT EXISTS commerce_overrides_org_validity_idx ON commerce_entitlement_overrides(organization_id,entitlement_key,valid_from,valid_until);
      CREATE TABLE IF NOT EXISTS commerce_credit_ledger (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES identity_organizations(id) ON DELETE RESTRICT,
        project_id TEXT REFERENCES projects(id) ON DELETE RESTRICT,
        entry_type TEXT NOT NULL CHECK(entry_type IN ('reservation','commit','release','grant','expiry','refund','adjustment')),
        unit TEXT NOT NULL CHECK(unit='credits'),
        amount INTEGER NOT NULL CHECK(amount!=0),
        idempotency_key TEXT NOT NULL,
        task_id TEXT,
        price_version TEXT NOT NULL,
        related_entry_id TEXT REFERENCES commerce_credit_ledger(id) ON DELETE RESTRICT,
        metadata TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(metadata)),
        correlation_id TEXT NOT NULL,
        actor_account_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_at INTEGER NOT NULL,
        UNIQUE(organization_id,idempotency_key)
      );
      CREATE INDEX IF NOT EXISTS commerce_ledger_org_unit_time_idx ON commerce_credit_ledger(organization_id,unit,created_at,id);
      CREATE INDEX IF NOT EXISTS commerce_ledger_project_time_idx ON commerce_credit_ledger(organization_id,project_id,created_at) WHERE project_id IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS commerce_ledger_reservation_terminal_idx ON commerce_credit_ledger(organization_id,related_entry_id) WHERE entry_type IN ('commit','release');
      CREATE TABLE IF NOT EXISTS commerce_usage_events (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES identity_organizations(id) ON DELETE CASCADE,
        project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
        account_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        metric TEXT NOT NULL,
        quantity INTEGER NOT NULL CHECK(quantity>=0),
        state TEXT NOT NULL CHECK(state IN ('pending','final')),
        idempotency_key TEXT NOT NULL,
        task_id TEXT,
        price_version TEXT NOT NULL,
        period_start INTEGER NOT NULL,
        period_end INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        finalized_at INTEGER,
        UNIQUE(organization_id,idempotency_key),
        CHECK(period_end>=period_start)
      );
      CREATE INDEX IF NOT EXISTS commerce_usage_org_period_metric_idx ON commerce_usage_events(organization_id,period_start,period_end,metric,state);
      CREATE INDEX IF NOT EXISTS commerce_usage_project_time_idx ON commerce_usage_events(organization_id,project_id,created_at) WHERE project_id IS NOT NULL;
      PRAGMA optimize;
    `);
  }

  subscription(organizationId:string){return this.database.prepare(`SELECT plan_key AS planKey,state,catalog_version AS catalogVersion,currency,current_period_start AS currentPeriodStart,current_period_end AS currentPeriodEnd,grace_until AS graceUntil,version FROM commerce_subscriptions WHERE organization_id=?`).bind(organizationId).first<SubscriptionRow>();}

  syncSubscription(input:{organizationId:string;planKey:PlanKey;state:SubscriptionState;catalogVersion:string;currency:string;currentPeriodStart:number;currentPeriodEnd:number;graceUntil:number|null;now:number}){
    this.database.prepare(`INSERT INTO commerce_subscriptions(organization_id,plan_key,state,source_type,catalog_version,currency,current_period_start,current_period_end,grace_until,version,created_at,updated_at)
      VALUES (?,?,?,'legacy',?,?,?,?,?,1,?,?) ON CONFLICT(organization_id) DO UPDATE SET
      plan_key=CASE WHEN source_type='legacy' THEN excluded.plan_key ELSE plan_key END,
      state=CASE WHEN source_type='legacy' THEN excluded.state ELSE state END,
      catalog_version=CASE WHEN source_type='legacy' THEN excluded.catalog_version ELSE catalog_version END,
      currency=CASE WHEN source_type='legacy' THEN excluded.currency ELSE currency END,
      current_period_start=CASE WHEN source_type='legacy' THEN excluded.current_period_start ELSE current_period_start END,
      current_period_end=CASE WHEN source_type='legacy' THEN excluded.current_period_end ELSE current_period_end END,
      grace_until=CASE WHEN source_type='legacy' THEN COALESCE(grace_until,excluded.grace_until) ELSE grace_until END,
      version=version+CASE WHEN source_type='legacy' AND (plan_key<>excluded.plan_key OR state<>excluded.state OR catalog_version<>excluded.catalog_version OR current_period_start<>excluded.current_period_start OR current_period_end<>excluded.current_period_end) THEN 1 ELSE 0 END,
      updated_at=CASE WHEN source_type='legacy' THEN excluded.updated_at ELSE updated_at END`)
      .bind(input.organizationId,input.planKey,input.state,input.catalogVersion,input.currency,input.currentPeriodStart,input.currentPeriodEnd,input.graceUntil,input.now,input.now).run();
  }

  overrides(organizationId:string,now:number){return this.database.prepare(`SELECT entitlement_key AS key,value_json AS valueJson,version FROM commerce_entitlement_overrides WHERE organization_id=? AND valid_from<=? AND (valid_until IS NULL OR valid_until>?) ORDER BY version`).bind(organizationId,now,now).all<{key:keyof PlanEntitlements;valueJson:string;version:number}>().results.map(row=>({key:row.key,value:JSON.parse(row.valueJson),version:row.version}));}

  ledgerByIdempotency(organizationId:string,idempotencyKey:string){return this.ledger(`organization_id=? AND idempotency_key=?`,organizationId,idempotencyKey);}
  ledgerEntry(id:string,organizationId:string){return this.ledger(`id=? AND organization_id=?`,id,organizationId);}
  terminalForReservation(organizationId:string,reservationId:string){return this.ledger(`organization_id=? AND related_entry_id=? AND entry_type IN ('commit','release')`,organizationId,reservationId);}
  private ledger(where:string,...values:string[]){return this.database.prepare(`SELECT id,organization_id AS organizationId,project_id AS projectId,entry_type AS entryType,unit,amount,idempotency_key AS idempotencyKey,task_id AS taskId,price_version AS priceVersion,related_entry_id AS relatedEntryId,correlation_id AS correlationId,actor_account_id AS actorAccountId,created_at AS createdAt FROM commerce_credit_ledger WHERE ${where} LIMIT 1`).bind(...values).first<CreditLedgerEntry>();}
  appendLedger(entry:CreditLedgerEntry){this.database.prepare(`INSERT INTO commerce_credit_ledger(id,organization_id,project_id,entry_type,unit,amount,idempotency_key,task_id,price_version,related_entry_id,correlation_id,actor_account_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(entry.id,entry.organizationId,entry.projectId,entry.entryType,entry.unit,entry.amount,entry.idempotencyKey,entry.taskId,entry.priceVersion,entry.relatedEntryId,entry.correlationId,entry.actorAccountId,entry.createdAt).run();}
  recentLedger(organizationId:string,limit:number){return this.database.prepare(`SELECT id,organization_id AS organizationId,project_id AS projectId,entry_type AS entryType,unit,amount,idempotency_key AS idempotencyKey,task_id AS taskId,price_version AS priceVersion,related_entry_id AS relatedEntryId,correlation_id AS correlationId,actor_account_id AS actorAccountId,created_at AS createdAt FROM commerce_credit_ledger WHERE organization_id=? ORDER BY created_at DESC,id DESC LIMIT ?`).bind(organizationId,Math.max(1,Math.min(100,limit))).all<CreditLedgerEntry>().results;}

  creditBalance(organizationId:string,now:number):CreditBalance{
    const posted=this.database.prepare(`SELECT COALESCE(SUM(CASE WHEN entry_type IN ('grant','commit','expiry','refund','adjustment') THEN amount ELSE 0 END),0) AS posted,COALESCE(SUM(CASE WHEN entry_type='grant' THEN amount ELSE 0 END),0) AS granted,COALESCE(-SUM(CASE WHEN entry_type='commit' THEN amount ELSE 0 END),0) AS committed FROM commerce_credit_ledger WHERE organization_id=? AND unit='credits'`).bind(organizationId).first<{posted:number;granted:number;committed:number}>()??{posted:0,granted:0,committed:0};
    const active=this.database.prepare(`SELECT COALESCE(-SUM(r.amount),0) AS reserved FROM commerce_credit_ledger r WHERE r.organization_id=? AND r.entry_type='reservation' AND NOT EXISTS(SELECT 1 FROM commerce_credit_ledger t WHERE t.organization_id=r.organization_id AND t.related_entry_id=r.id AND t.entry_type IN ('commit','release'))`).bind(organizationId).first<{reserved:number}>()?.reserved??0;
    return{granted:Number(posted.granted),committed:Number(posted.committed),reserved:Number(active),available:Math.max(0,Number(posted.posted)-Number(active)),capturedAt:now,state:Number(active)>0?"pending":"final"};
  }

  transaction<T>(operation:()=>T):T{this.database.exec("BEGIN IMMEDIATE");try{const result=operation();this.database.exec("COMMIT");return result;}catch(error){this.database.exec("ROLLBACK");throw error;}}

  usageByIdempotency(organizationId:string,idempotencyKey:string){return this.database.prepare(`SELECT id,organization_id AS organizationId,project_id AS projectId,account_id AS accountId,metric,quantity,state,idempotency_key AS idempotencyKey,task_id AS taskId,price_version AS priceVersion,period_start AS periodStart,period_end AS periodEnd,created_at AS createdAt,finalized_at AS finalizedAt FROM commerce_usage_events WHERE organization_id=? AND idempotency_key=?`).bind(organizationId,idempotencyKey).first<UsageMeterEvent>();}
  appendUsage(event:UsageMeterEvent){this.database.prepare(`INSERT INTO commerce_usage_events(id,organization_id,project_id,account_id,metric,quantity,state,idempotency_key,task_id,price_version,period_start,period_end,created_at,finalized_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(event.id,event.organizationId,event.projectId,event.accountId,event.metric,event.quantity,event.state,event.idempotencyKey,event.taskId,event.priceVersion,event.periodStart,event.periodEnd,event.createdAt,event.finalizedAt).run();}
  finalizeUsage(organizationId:string,idempotencyKey:string,finalizedAt:number){const existing=this.usageByIdempotency(organizationId,idempotencyKey);if(!existing)throw new Error("USAGE_EVENT_NOT_FOUND");if(existing.state==="final")return existing;this.database.prepare("UPDATE commerce_usage_events SET state='final',finalized_at=? WHERE organization_id=? AND idempotency_key=? AND state='pending'").bind(finalizedAt,organizationId,idempotencyKey).run();return this.usageByIdempotency(organizationId,idempotencyKey)!;}
  usageTotals(organizationId:string,periodStart:number,periodEnd:number){return this.database.prepare(`SELECT metric,COALESCE(SUM(CASE WHEN state='pending' THEN quantity ELSE 0 END),0) AS pending,COALESCE(SUM(CASE WHEN state='final' THEN quantity ELSE 0 END),0) AS final FROM commerce_usage_events WHERE organization_id=? AND period_start=? AND period_end=? GROUP BY metric ORDER BY metric`).bind(organizationId,periodStart,periodEnd).all<{metric:string;pending:number;final:number}>().results;}
}
