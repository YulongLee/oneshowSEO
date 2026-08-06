import { createHmac, timingSafeEqual } from "node:crypto";
import type { PaymentProvider, PaymentProviderEvent, ProviderInvoice, ProviderSubscription } from "../../modules/commerce/payments";

function validEvent(value:unknown):value is PaymentProviderEvent{
  if(!value||typeof value!=="object")return false;const event=value as Record<string,unknown>,data=event.data as Record<string,unknown>|undefined;
  if(typeof event.id!=="string"||!event.id.trim()||typeof event.createdAt!=="number"||!Number.isInteger(event.createdAt)||!data)return false;
  if(!["subscription.updated","subscription.deleted","invoice.updated"].includes(String(event.type)))return false;
  if(typeof data.organizationId!=="string"||typeof data.customerRef!=="string"||typeof data.providerCreatedAt!=="number")return false;
  if(event.type==="invoice.updated")return typeof data.invoiceRef==="string"&&typeof data.invoiceNumber==="string"&&["draft","open","paid","void","uncollectible"].includes(String(data.state))&&Number.isInteger(data.amountCents)&&typeof data.currency==="string"&&Number.isInteger(data.periodStart)&&Number.isInteger(data.periodEnd)&&(data.subscriptionRef===null||typeof data.subscriptionRef==="string")&&(data.hostedUrl===null||typeof data.hostedUrl==="string");
  return typeof data.subscriptionRef==="string"&&["trial","starter","pro","business"].includes(String(data.planKey))&&["trial","active","past_due","cancelled","expired","suspended"].includes(String(data.state))&&typeof data.currency==="string"&&Number.isInteger(data.currentPeriodStart)&&Number.isInteger(data.currentPeriodEnd)&&typeof data.cancelAtPeriodEnd==="boolean";
}

function normalizedEvent(event:PaymentProviderEvent):PaymentProviderEvent{
  const base={id:event.id.trim(),type:event.type,createdAt:event.createdAt};
  if(event.type==="invoice.updated"){
    const data=event.data as ProviderInvoice;return{...base,type:event.type,data:{organizationId:data.organizationId,customerRef:data.customerRef,subscriptionRef:data.subscriptionRef,invoiceRef:data.invoiceRef,invoiceNumber:data.invoiceNumber,state:data.state,amountCents:data.amountCents,currency:data.currency,periodStart:data.periodStart,periodEnd:data.periodEnd,hostedUrl:data.hostedUrl,providerCreatedAt:data.providerCreatedAt}};
  }
  const data=event.data as ProviderSubscription;return{...base,type:event.type,data:{organizationId:data.organizationId,customerRef:data.customerRef,subscriptionRef:data.subscriptionRef,planKey:data.planKey,state:data.state,currency:data.currency,currentPeriodStart:data.currentPeriodStart,currentPeriodEnd:data.currentPeriodEnd,cancelAtPeriodEnd:data.cancelAtPeriodEnd,providerCreatedAt:data.providerCreatedAt}};
}

export class SandboxPaymentProvider implements PaymentProvider{
  readonly key="sandbox" as const;
  private subscriptions=new Map<string,ProviderSubscription>();private invoices=new Map<string,ProviderInvoice>();
  constructor(seed?:{subscriptions?:ProviderSubscription[];invoices?:ProviderInvoice[]}){for(const item of seed?.subscriptions??[])this.subscriptions.set(item.subscriptionRef,item);for(const item of seed?.invoices??[])this.invoices.set(item.invoiceRef,item);}
  static signature(rawBody:string,secret:string,timestamp:number){const digest=createHmac("sha256",secret).update(`${timestamp}.${rawBody}`).digest("hex");return`t=${timestamp},v1=${digest}`;}
  verifyWebhook(rawBody:string,signature:string,secret:string,now:number){
    if(!secret)throw new Error("WEBHOOK_SECRET_MISSING");const fields=Object.fromEntries(signature.split(",").map(item=>item.trim().split("=",2))),timestamp=Number(fields.t),received=fields.v1;
    if(!Number.isInteger(timestamp)||!received||Math.abs(now-timestamp)>300)throw new Error("WEBHOOK_SIGNATURE_INVALID");
    const expected=createHmac("sha256",secret).update(`${timestamp}.${rawBody}`).digest("hex");
    const left=Buffer.from(received,"hex"),right=Buffer.from(expected,"hex");if(left.length!==right.length||!timingSafeEqual(left,right))throw new Error("WEBHOOK_SIGNATURE_INVALID");
    let parsed:unknown;try{parsed=JSON.parse(rawBody);}catch{throw new Error("WEBHOOK_PAYLOAD_INVALID");}if(!validEvent(parsed))throw new Error("WEBHOOK_PAYLOAD_INVALID");return normalizedEvent(parsed);
  }
  async retrieveSubscription(subscriptionRef:string){return this.subscriptions.get(subscriptionRef)??null;}
  async listInvoices(customerRef:string){return[...this.invoices.values()].filter(item=>item.customerRef===customerRef);}
  setSubscription(value:ProviderSubscription){this.subscriptions.set(value.subscriptionRef,value);}
  setInvoice(value:ProviderInvoice){this.invoices.set(value.invoiceRef,value);}
}
