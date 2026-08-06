import { createHash } from "node:crypto";
import { commercialPlan, type PlanKey } from "./catalog";
import type { SubscriptionState } from "./index";

export type PaymentProviderKey = "sandbox";
export type PaymentWebhookState = "received"|"processing"|"processed"|"failed"|"quarantined";
export type ProviderEventType = "subscription.updated"|"subscription.deleted"|"invoice.updated";
export type InvoiceState = "draft"|"open"|"paid"|"void"|"uncollectible";

export type ProviderSubscription = {
  organizationId:string;customerRef:string;subscriptionRef:string;planKey:PlanKey;state:SubscriptionState;currency:string;
  currentPeriodStart:number;currentPeriodEnd:number;cancelAtPeriodEnd:boolean;providerCreatedAt:number;
};
export type ProviderInvoice = {
  organizationId:string;customerRef:string;subscriptionRef:string|null;invoiceRef:string;invoiceNumber:string;state:InvoiceState;
  amountCents:number;currency:string;periodStart:number;periodEnd:number;hostedUrl:string|null;providerCreatedAt:number;
};
export type PaymentProviderEvent = {
  id:string;type:ProviderEventType;createdAt:number;data:ProviderSubscription|ProviderInvoice;
};
export type PaymentWebhook = {
  id:string;provider:PaymentProviderKey;providerEventId:string;eventType:ProviderEventType;payloadSha256:string;event:PaymentProviderEvent;
  state:PaymentWebhookState;attempts:number;receivedAt:number;processingStartedAt:number|null;processedAt:number|null;lastError:string|null;
};
export type PaymentReconciliation = {
  id:string;organizationId:string;provider:PaymentProviderKey;customerRef:string;subscriptionRef:string|null;status:"ok"|"attention";
  subscriptionCorrections:number;invoiceCorrections:number;pendingWebhookCount:number;details:string[];createdAt:number;
};

export interface PaymentProvider {
  readonly key:PaymentProviderKey;
  verifyWebhook(rawBody:string,signature:string,secret:string,now:number):PaymentProviderEvent;
  retrieveSubscription(subscriptionRef:string):Promise<ProviderSubscription|null>;
  listInvoices(customerRef:string):Promise<ProviderInvoice[]>;
}

export interface PaymentRepository {
  ensureSchema():void;
  transaction<T>(operation:()=>T):T;
  webhook(provider:PaymentProviderKey,eventId:string):PaymentWebhook|null;
  insertWebhook(record:PaymentWebhook):void;
  claimNextWebhook(provider:PaymentProviderKey,now:number,maxAttempts:number):PaymentWebhook|null;
  completeWebhook(id:string,processedAt:number):void;
  failWebhook(id:string,error:string,quarantine:boolean,processedAt:number):void;
  recoverStaleWebhooks(staleBefore:number):number;
  pendingWebhookCount(provider:PaymentProviderKey):number;
  providerSubscription(subscriptionRef:string):ProviderSubscription|null;
  applyProviderSubscription(snapshot:ProviderSubscription,eventId:string):"applied"|"stale"|"unchanged";
  providerInvoice(invoiceRef:string):ProviderInvoice|null;
  applyProviderInvoice(invoice:ProviderInvoice,eventId:string):"applied"|"stale"|"unchanged";
  appendReconciliation(record:PaymentReconciliation):void;
  recentReconciliations(organizationId:string,limit:number):PaymentReconciliation[];
}

export class PaymentError extends Error{
  constructor(public readonly code:string,message:string,public readonly status=400){super(message);}
}

const subscriptionTransitions:Record<SubscriptionState,ReadonlySet<SubscriptionState>>={
  trial:new Set(["trial","active","expired","cancelled","suspended"]),
  active:new Set(["active","past_due","cancelled","suspended"]),
  past_due:new Set(["past_due","active","cancelled","expired","suspended"]),
  cancelled:new Set(["cancelled"]),expired:new Set(["expired"]),suspended:new Set(["suspended","active","cancelled"]),
};
const invoiceTransitions:Record<InvoiceState,ReadonlySet<InvoiceState>>={
  draft:new Set(["draft","open","void"]),open:new Set(["open","paid","void","uncollectible"]),
  uncollectible:new Set(["uncollectible","paid","void"]),paid:new Set(["paid"]),void:new Set(["void"]),
};

function sameSubscription(left:ProviderSubscription,right:ProviderSubscription){return JSON.stringify(left)===JSON.stringify(right);}
function sameInvoice(left:ProviderInvoice,right:ProviderInvoice){return JSON.stringify(left)===JSON.stringify(right);}
function safeError(error:unknown){return(error instanceof Error?error.message:String(error)).replace(/[\r\n]/g," ").slice(0,500);}

export class PaymentLifecycleService{
  constructor(private readonly repository:PaymentRepository,private readonly provider:PaymentProvider,private readonly secret:string,private readonly now:()=>number=()=>Math.floor(Date.now()/1000)){
    this.repository.ensureSchema();
  }

  receiveWebhook(rawBody:string,signature:string){
    const now=this.now(),event=this.provider.verifyWebhook(rawBody,signature,this.secret,now),digest=createHash("sha256").update(rawBody).digest("hex");
    return this.repository.transaction(()=>{
      const existing=this.repository.webhook(this.provider.key,event.id);
      if(existing){if(existing.payloadSha256!==digest)throw new PaymentError("WEBHOOK_EVENT_CONFLICT","支付事件编号已用于不同载荷",409);return{record:existing,duplicate:true};}
      const record:PaymentWebhook={id:crypto.randomUUID(),provider:this.provider.key,providerEventId:event.id,eventType:event.type,payloadSha256:digest,event,state:"received",attempts:0,receivedAt:now,processingStartedAt:null,processedAt:null,lastError:null};
      this.repository.insertWebhook(record);return{record,duplicate:false};
    });
  }

  processNext(maxAttempts=5):PaymentWebhook|null{
    const now=this.now(),claimed=this.repository.claimNextWebhook(this.provider.key,now,maxAttempts);if(!claimed)return null;
    try{
      this.repository.transaction(()=>{this.applyEvent(claimed.event);this.repository.completeWebhook(claimed.id,this.now());});
    }catch(error){this.repository.failWebhook(claimed.id,safeError(error),claimed.attempts>=maxAttempts,this.now());}
    return this.repository.webhook(claimed.provider,claimed.providerEventId);
  }

  processPending(limit=100){const processed:PaymentWebhook[]=[];for(let index=0;index<Math.max(1,Math.min(1000,limit));index++){const record=this.processNext();if(!record)break;processed.push(record);}return processed;}
  recoverStale(processingTimeoutSeconds=300){return this.repository.recoverStaleWebhooks(this.now()-Math.max(30,processingTimeoutSeconds));}

  async reconcile(input:{organizationId:string;customerRef:string;subscriptionRef:string|null}):Promise<PaymentReconciliation>{
    const details:string[]=[],now=this.now();let subscriptionCorrections=0,invoiceCorrections=0;
    const subscription=input.subscriptionRef?await this.provider.retrieveSubscription(input.subscriptionRef):null;
    const invoices=await this.provider.listInvoices(input.customerRef);
    this.repository.transaction(()=>{
      if(input.subscriptionRef&&!subscription)details.push("provider_subscription_missing");
      if(subscription){
        if(subscription.organizationId!==input.organizationId||subscription.customerRef!==input.customerRef)throw new PaymentError("RECONCILIATION_SCOPE_MISMATCH","支付提供商返回了其他组织的数据",409);
        if(this.applySubscription(subscription,`reconcile:subscription:${now}`)==="applied")subscriptionCorrections++;
      }
      for(const invoice of invoices){
        if(invoice.organizationId!==input.organizationId||invoice.customerRef!==input.customerRef)throw new PaymentError("RECONCILIATION_SCOPE_MISMATCH","支付提供商返回了其他组织的发票",409);
        if(this.applyInvoice(invoice,`reconcile:invoice:${invoice.invoiceRef}:${now}`)==="applied")invoiceCorrections++;
      }
      const pendingWebhookCount=this.repository.pendingWebhookCount(this.provider.key);
      if(pendingWebhookCount)details.push(`pending_webhooks:${pendingWebhookCount}`);
      const record:PaymentReconciliation={id:crypto.randomUUID(),organizationId:input.organizationId,provider:this.provider.key,customerRef:input.customerRef,subscriptionRef:input.subscriptionRef,status:details.length?"attention":"ok",subscriptionCorrections,invoiceCorrections,pendingWebhookCount,details,createdAt:now};
      this.repository.appendReconciliation(record);
    });
    return this.repository.recentReconciliations(input.organizationId,1)[0];
  }

  private applyEvent(event:PaymentProviderEvent){
    if(event.type==="subscription.updated")return this.applySubscription(event.data as ProviderSubscription,event.id);
    if(event.type==="subscription.deleted")return this.applySubscription({...event.data as ProviderSubscription,state:"cancelled"},event.id);
    return this.applyInvoice(event.data as ProviderInvoice,event.id);
  }

  private applySubscription(snapshot:ProviderSubscription,eventId:string){
    commercialPlan(snapshot.planKey);
    const existing=this.repository.providerSubscription(snapshot.subscriptionRef);
    if(existing&&snapshot.providerCreatedAt>=existing.providerCreatedAt&&!subscriptionTransitions[existing.state].has(snapshot.state))throw new PaymentError("INVALID_SUBSCRIPTION_TRANSITION",`订阅状态不能从 ${existing.state} 变更为 ${snapshot.state}`,409);
    if(existing&&sameSubscription(existing,snapshot))return"unchanged" as const;
    return this.repository.applyProviderSubscription(snapshot,eventId);
  }

  private applyInvoice(invoice:ProviderInvoice,eventId:string){
    const existing=this.repository.providerInvoice(invoice.invoiceRef);
    if(existing&&invoice.providerCreatedAt>=existing.providerCreatedAt&&!invoiceTransitions[existing.state].has(invoice.state))throw new PaymentError("INVALID_INVOICE_TRANSITION",`发票状态不能从 ${existing.state} 变更为 ${invoice.state}`,409);
    if(existing&&sameInvoice(existing,invoice))return"unchanged" as const;
    return this.repository.applyProviderInvoice(invoice,eventId);
  }
}
