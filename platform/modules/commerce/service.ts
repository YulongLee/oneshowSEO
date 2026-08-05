import { commercialPlan, type PlanEntitlements } from "./catalog";
import type { CommercialSubject, CommerceRepository, CreditBalance, CreditLedgerEntry, EffectiveEntitlements, SubscriptionState, UsageMeterEvent } from "./index";

export class CommerceError extends Error {
  constructor(public readonly code:string,message:string,public readonly status=403){super(message);}
}

const day=24*60*60;

export function monthlyPeriod(now:number){
  const date=new Date(now*1000);
  const start=Math.floor(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),1)/1000);
  const end=Math.floor(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,1)/1000)-1;
  return{start,end};
}

function legacyState(subject:CommercialSubject,now:number):SubscriptionState{
  if(subject.organizationStatus==="suspended")return"suspended";
  if(subject.planKey==="trial")return subject.trialEndsAt!==null&&subject.trialEndsAt<=now?"expired":"trial";
  if(subject.organizationStatus==="past_due")return"past_due";
  return"active";
}

function subjectPeriod(subject:CommercialSubject,now:number){
  if(subject.planKey==="trial"&&subject.trialEndsAt){return{start:Math.max(subject.accountCreatedAt,subject.trialEndsAt-14*day),end:subject.trialEndsAt};}
  return monthlyPeriod(now);
}

export class CommercialEntitlementService{
  constructor(private readonly repository:CommerceRepository,private readonly now:()=>number=()=>Math.floor(Date.now()/1000)){this.repository.ensureSchema();}

  resolve(subject:CommercialSubject):EffectiveEntitlements{
    const now=this.now(),plan=commercialPlan(subject.planKey),state=legacyState(subject,now),period=subjectPeriod(subject,now);
    this.repository.syncSubscription({organizationId:subject.organizationId,planKey:plan.key,state,catalogVersion:plan.catalogVersion,currency:plan.currency,currentPeriodStart:period.start,currentPeriodEnd:period.end,graceUntil:state==="past_due"?now+7*day:null,now});
    const subscription=this.repository.subscription(subject.organizationId);
    if(!subscription)throw new CommerceError("SUBSCRIPTION_UNAVAILABLE","订阅状态暂时不可用",503);
    const limits={...plan.entitlements};let version=subscription.version;
    for(const override of this.repository.overrides(subject.organizationId,now)){
      const current=limits[override.key];
      if(typeof current==="number"&&typeof override.value==="number"&&Number.isFinite(override.value))Object.assign(limits,{[override.key]:Math.max(0,Math.floor(override.value))});
      else if(typeof current==="boolean"&&typeof override.value==="boolean")Object.assign(limits,{[override.key]:override.value});
      else if((override.key==="support")&&typeof override.value==="string")Object.assign(limits,{support:override.value});
      version=Math.max(version,override.version);
    }
    const access=subscription.state==="suspended"?"suspended":subscription.state==="expired"||subscription.state==="cancelled"?"restricted":subscription.state==="past_due"&&subscription.graceUntil&&subscription.graceUntil>=now?"grace":subscription.state==="past_due"?"restricted":"active";
    return{organizationId:subject.organizationId,planKey:plan.key,subscriptionState:subscription.state,access,catalogVersion:plan.catalogVersion,priceVersion:plan.priceVersion,currency:plan.currency,limits,validUntil:subscription.currentPeriodEnd,version};
  }

  authorize(subject:CommercialSubject,key:keyof PlanEntitlements,quantity=1,currentUsage=0):EffectiveEntitlements{
    const effective=this.resolve(subject);
    if(effective.access==="suspended")throw new CommerceError("ORGANIZATION_SUSPENDED","当前组织已暂停，请联系管理员");
    if(effective.access==="restricted")throw new CommerceError("SUBSCRIPTION_REQUIRED","当前订阅已到期或受限，请续订后重试");
    const limit=effective.limits[key];
    if(typeof limit==="boolean"&&!limit)throw new CommerceError("ENTITLEMENT_REQUIRED","当前套餐不包含此功能");
    if(typeof limit==="number"&&currentUsage+quantity>limit)throw new CommerceError("LIMIT_REACHED",`当前套餐的 ${String(key)} 额度已用完`);
    return effective;
  }

  ensureCreditAllocation(subject:CommercialSubject,correlationId="billing-allocation"):CreditBalance{
    const effective=this.resolve(subject),subscription=this.repository.subscription(subject.organizationId);
    if(!subscription)return this.repository.creditBalance(subject.organizationId,this.now());
    const quantity=effective.limits.monthlyCredits;
    if(quantity>0&&effective.access!=="suspended"&&effective.access!=="restricted"){
      const key=`grant:${effective.catalogVersion}:${effective.planKey}:${subscription.currentPeriodStart}`;
      this.repository.transaction(()=>{
        if(this.repository.ledgerByIdempotency(subject.organizationId,key))return;
        this.repository.appendLedger(this.entry({subject,entryType:"grant",amount:quantity,idempotencyKey:key,taskId:null,projectId:null,priceVersion:effective.priceVersion,relatedEntryId:null,correlationId}));
      });
    }
    return this.repository.creditBalance(subject.organizationId,this.now());
  }

  reserveCredits(subject:CommercialSubject,input:{quantity:number;idempotencyKey:string;taskId:string;projectId?:string|null;correlationId:string}):CreditLedgerEntry{
    if(!Number.isInteger(input.quantity)||input.quantity<=0)throw new CommerceError("INVALID_QUANTITY","Credits 数量必须是正整数",400);
    const effective=this.authorize(subject,"monthlyCredits",input.quantity,0);this.ensureCreditAllocation(subject,input.correlationId);
    return this.repository.transaction(()=>{
      const key=`reserve:${input.idempotencyKey}`,existing=this.repository.ledgerByIdempotency(subject.organizationId,key);if(existing)return existing;
      const balance=this.repository.creditBalance(subject.organizationId,this.now());if(balance.available<input.quantity)throw new CommerceError("INSUFFICIENT_CREDITS","Credits 余额不足");
      const entry=this.entry({subject,entryType:"reservation",amount:-input.quantity,idempotencyKey:key,taskId:input.taskId,projectId:input.projectId??null,priceVersion:effective.priceVersion,relatedEntryId:null,correlationId:input.correlationId});this.repository.appendLedger(entry);return entry;
    });
  }

  commitCredits(subject:CommercialSubject,input:{reservationId:string;idempotencyKey:string;correlationId:string}):CreditLedgerEntry{return this.settle(subject,"commit",input);}
  releaseCredits(subject:CommercialSubject,input:{reservationId:string;idempotencyKey:string;correlationId:string}):CreditLedgerEntry{return this.settle(subject,"release",input);}

  adjustCredits(subject:CommercialSubject,input:{entryType:"expiry"|"refund"|"adjustment";amount:number;idempotencyKey:string;correlationId:string;relatedEntryId?:string|null}):CreditLedgerEntry{
    if(!Number.isInteger(input.amount)||input.amount===0)throw new CommerceError("INVALID_QUANTITY","Credits 调整数量必须是非零整数",400);
    const effective=this.resolve(subject);
    return this.repository.transaction(()=>{
      const key=`${input.entryType}:${input.idempotencyKey}`,existing=this.repository.ledgerByIdempotency(subject.organizationId,key);if(existing)return existing;
      if(input.amount<0&&this.repository.creditBalance(subject.organizationId,this.now()).available<Math.abs(input.amount))throw new CommerceError("INSUFFICIENT_CREDITS","Credits 余额不足");
      const entry=this.entry({subject,entryType:input.entryType,amount:input.amount,idempotencyKey:key,taskId:null,projectId:null,priceVersion:effective.priceVersion,relatedEntryId:input.relatedEntryId??null,correlationId:input.correlationId});this.repository.appendLedger(entry);return entry;
    });
  }

  private settle(subject:CommercialSubject,type:"commit"|"release",input:{reservationId:string;idempotencyKey:string;correlationId:string}){
    return this.repository.transaction(()=>{
      const key=`${type}:${input.idempotencyKey}`,existing=this.repository.ledgerByIdempotency(subject.organizationId,key);if(existing)return existing;
      const reservation=this.repository.ledgerEntry(input.reservationId,subject.organizationId);if(!reservation||reservation.entryType!=="reservation")throw new CommerceError("RESERVATION_NOT_FOUND","Credits 预留不存在",404);
      const terminal=this.repository.terminalForReservation(subject.organizationId,reservation.id);if(terminal){if(terminal.entryType===type)return terminal;throw new CommerceError("RESERVATION_SETTLED","Credits 预留已结算",409);}
      const entry=this.entry({subject,entryType:type,amount:type==="commit"?reservation.amount:-reservation.amount,idempotencyKey:key,taskId:reservation.taskId,projectId:reservation.projectId,priceVersion:reservation.priceVersion,relatedEntryId:reservation.id,correlationId:input.correlationId});this.repository.appendLedger(entry);return entry;
    });
  }

  balance(subject:CommercialSubject):CreditBalance{this.ensureCreditAllocation(subject);return this.repository.creditBalance(subject.organizationId,this.now());}

  ingestUsage(subject:CommercialSubject,input:{metric:string;quantity:number;state?:"pending"|"final";idempotencyKey:string;projectId?:string|null;taskId?:string|null}):UsageMeterEvent{
    if(!input.metric.trim()||!Number.isInteger(input.quantity)||input.quantity<0)throw new CommerceError("INVALID_USAGE","用量事件无效",400);
    const effective=this.resolve(subject),subscription=this.repository.subscription(subject.organizationId);if(!subscription)throw new CommerceError("SUBSCRIPTION_UNAVAILABLE","订阅状态暂时不可用",503);
    const existing=this.repository.usageByIdempotency(subject.organizationId,input.idempotencyKey);if(existing)return existing;
    const event:UsageMeterEvent={id:crypto.randomUUID(),organizationId:subject.organizationId,projectId:input.projectId??null,accountId:subject.accountId,metric:input.metric.trim(),quantity:input.quantity,state:input.state??"final",idempotencyKey:input.idempotencyKey,taskId:input.taskId??null,priceVersion:effective.priceVersion,periodStart:subscription.currentPeriodStart,periodEnd:subscription.currentPeriodEnd,createdAt:this.now(),finalizedAt:(input.state??"final")==="final"?this.now():null};
    try{this.repository.appendUsage(event);return event;}catch(error){const duplicate=this.repository.usageByIdempotency(subject.organizationId,input.idempotencyKey);if(duplicate)return duplicate;throw error;}
  }

  finalizeUsage(subject:CommercialSubject,idempotencyKey:string){return this.repository.finalizeUsage(subject.organizationId,idempotencyKey,this.now());}
  usageTotals(subject:CommercialSubject){const subscription=this.resolve(subject)&&this.repository.subscription(subject.organizationId);return subscription?this.repository.usageTotals(subject.organizationId,subscription.currentPeriodStart,subscription.currentPeriodEnd):[];}

  private entry(input:{subject:CommercialSubject;entryType:CreditLedgerEntry["entryType"];amount:number;idempotencyKey:string;taskId:string|null;projectId:string|null;priceVersion:string;relatedEntryId:string|null;correlationId:string}):CreditLedgerEntry{
    return{id:crypto.randomUUID(),organizationId:input.subject.organizationId,projectId:input.projectId,entryType:input.entryType,unit:"credits",amount:input.amount,idempotencyKey:input.idempotencyKey,taskId:input.taskId,priceVersion:input.priceVersion,relatedEntryId:input.relatedEntryId,correlationId:input.correlationId,actorAccountId:input.subject.accountId,createdAt:this.now()};
  }
}
