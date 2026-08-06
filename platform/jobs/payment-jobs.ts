import type { PaymentLifecycleService, PaymentReconciliation, PaymentWebhook } from "../modules/commerce/payments";

export type PaymentWebhookJobResult={recovered:number;processed:number;completed:number;failed:number;quarantined:number;records:PaymentWebhook[]};

export function runPaymentWebhookJob(service:PaymentLifecycleService,input:{limit?:number;processingTimeoutSeconds?:number}={}):PaymentWebhookJobResult{
  const recovered=service.recoverStale(input.processingTimeoutSeconds??300),records=service.processPending(input.limit??100);
  return{recovered,processed:records.length,completed:records.filter(item=>item.state==="processed").length,failed:records.filter(item=>item.state==="failed").length,quarantined:records.filter(item=>item.state==="quarantined").length,records};
}

export async function runPaymentReconciliationJob(service:PaymentLifecycleService,targets:Array<{organizationId:string;customerRef:string;subscriptionRef:string|null}>):Promise<PaymentReconciliation[]>{
  const results:PaymentReconciliation[]=[];for(const target of targets)results.push(await service.reconcile(target));return results;
}
