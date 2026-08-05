import type { OrganizationId, TaskId } from "../../core/ids";
import type { RequestContext } from "../../core/contracts";
import type { PlanEntitlements, PlanKey } from "./catalog";

export type UsageReservation = { id: string; organizationId: OrganizationId; taskId: TaskId; units: number; state: "reserved"|"committed"|"released" };
export type SubscriptionState = "trial"|"active"|"past_due"|"cancelled"|"expired"|"suspended";
export type CommercialSubscription = {
  planKey:PlanKey;state:SubscriptionState;catalogVersion:string;currency:string;currentPeriodStart:number;currentPeriodEnd:number;
  graceUntil:number|null;pendingPlanKey:PlanKey|null;planChangeAt:number|null;planChangeReason:string|null;version:number;
};
export type EffectiveEntitlements = {
  organizationId: string;
  planKey: PlanKey;
  subscriptionState: SubscriptionState;
  access: "active"|"grace"|"restricted"|"suspended";
  catalogVersion: string;
  priceVersion: string;
  currency: string;
  limits: PlanEntitlements;
  validUntil: number|null;
  scheduledPlanKey: PlanKey|null;
  scheduledChangeAt: number|null;
  version: number;
};
export type CommercialSubject = {
  accountId: string;
  organizationId: string;
  organizationStatus: string;
  planKey: PlanKey;
  trialEndsAt: number|null;
  accountCreatedAt: number;
};
export type CreditLedgerEntry = {
  id:string;organizationId:string;projectId:string|null;entryType:"reservation"|"commit"|"release"|"grant"|"expiry"|"refund"|"adjustment";
  unit:"credits";amount:number;idempotencyKey:string;taskId:string|null;priceVersion:string;relatedEntryId:string|null;correlationId:string;actorAccountId:string|null;createdAt:number;
};
export type CreditBalance = { granted:number;committed:number;reserved:number;available:number;capturedAt:number;state:"final"|"pending" };
export type UsageMeterEvent = { id:string;organizationId:string;projectId:string|null;accountId:string|null;metric:string;quantity:number;state:"pending"|"final";idempotencyKey:string;taskId:string|null;priceVersion:string;periodStart:number;periodEnd:number;createdAt:number;finalizedAt:number|null };

export interface CommerceRepository {
  ensureSchema():void;
  subscription(organizationId:string):CommercialSubscription|null;
  syncSubscription(input:{organizationId:string;planKey:PlanKey;state:SubscriptionState;catalogVersion:string;currency:string;currentPeriodStart:number;currentPeriodEnd:number;graceUntil:number|null;now:number}):void;
  schedulePlanChange(input:{organizationId:string;planKey:PlanKey;effectiveAt:number;reason:string;expectedVersion:number;now:number}):boolean;
  applyScheduledPlanChange(input:{organizationId:string;planKey:PlanKey;catalogVersion:string;currency:string;currentPeriodStart:number;currentPeriodEnd:number;expectedVersion:number;now:number}):boolean;
  overrides(organizationId:string,now:number):Array<{key:keyof PlanEntitlements;value:unknown;version:number}>;
  ledgerByIdempotency(organizationId:string,idempotencyKey:string):CreditLedgerEntry|null;
  ledgerEntry(id:string,organizationId:string):CreditLedgerEntry|null;
  terminalForReservation(organizationId:string,reservationId:string):CreditLedgerEntry|null;
  appendLedger(entry:CreditLedgerEntry):void;
  recentLedger(organizationId:string,limit:number):CreditLedgerEntry[];
  creditBalance(organizationId:string,now:number):CreditBalance;
  transaction<T>(operation:()=>T):T;
  usageByIdempotency(organizationId:string,idempotencyKey:string):UsageMeterEvent|null;
  appendUsage(event:UsageMeterEvent):void;
  finalizeUsage(organizationId:string,idempotencyKey:string,finalizedAt:number):UsageMeterEvent;
  usageTotals(organizationId:string,periodStart:number,periodEnd:number):Array<{metric:string;pending:number;final:number}>;
}

export interface CommerceService {
  authorizeEntitlement(context: RequestContext, capability: string, quantity?: number): Promise<void>;
  reserve(context: RequestContext, taskId: TaskId, metric: string, quantity: number, idempotencyKey: string): Promise<UsageReservation>;
}
