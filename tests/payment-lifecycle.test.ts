import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { AppDatabase } from "../lib/database";
import { ensureAuthSchema } from "../lib/auth";
import { SandboxPaymentProvider } from "../platform/adapters/payments/sandbox-provider";
import { SqliteCommerceRepository } from "../platform/adapters/sqlite/commerce-repository";
import { SqlitePaymentRepository } from "../platform/adapters/sqlite/payment-repository";
import { runPaymentReconciliationJob, runPaymentWebhookJob } from "../platform/jobs/payment-jobs";
import type { PaymentProviderEvent, ProviderInvoice, ProviderSubscription } from "../platform/modules/commerce/payments";
import { PaymentError, PaymentLifecycleService } from "../platform/modules/commerce/payments";
import { CommercialEntitlementService } from "../platform/modules/commerce/service";

const secret="sandbox-signing-secret";

async function fixture(){
  const sqlite=new DatabaseSync(":memory:");sqlite.exec("PRAGMA foreign_keys=ON");const database=new AppDatabase(sqlite);await ensureAuthSchema(database);
  const now=1_786_100_000;let clock=now;
  database.prepare("INSERT INTO users(id,email,name,password_hash,role,status,plan,trial_ends_at,email_verified_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)").bind("account_payment","pay@example.com","Pay Owner","hash","user","active","trial",now+1209600,now,now-100,now-100).run();
  await ensureAuthSchema(database);database.exec("CREATE TABLE projects(id TEXT PRIMARY KEY)");
  const commerceRepository=new SqliteCommerceRepository(database),commerce=new CommercialEntitlementService(commerceRepository,()=>clock);
  commerce.resolve({accountId:"account_payment",organizationId:"org_account_payment",organizationStatus:"trial",planKey:"trial",trialEndsAt:now+1209600,accountCreatedAt:now-100});
  const repository=new SqlitePaymentRepository(database),provider=new SandboxPaymentProvider(),service=new PaymentLifecycleService(repository,provider,secret,()=>clock);
  return{database,repository,provider,service,now,setNow:(value:number)=>{clock=value;}};
}

function subscription(now:number,overrides:Partial<ProviderSubscription>={}):ProviderSubscription{return{organizationId:"org_account_payment",customerRef:"cus_sandbox_1",subscriptionRef:"sub_sandbox_1",planKey:"starter",state:"active",currency:"USD",currentPeriodStart:now,currentPeriodEnd:now+2591999,cancelAtPeriodEnd:false,providerCreatedAt:now,...overrides};}
function invoice(now:number,overrides:Partial<ProviderInvoice>={}):ProviderInvoice{return{organizationId:"org_account_payment",customerRef:"cus_sandbox_1",subscriptionRef:"sub_sandbox_1",invoiceRef:"inv_sandbox_1",invoiceNumber:"SANDBOX-0001",state:"open",amountCents:3500,currency:"USD",periodStart:now,periodEnd:now+2591999,hostedUrl:"https://sandbox.invalid/invoices/1",providerCreatedAt:now,...overrides};}
function deliver(service:PaymentLifecycleService,event:PaymentProviderEvent,now:number){const body=JSON.stringify(event),signature=SandboxPaymentProvider.signature(body,secret,now);return service.receiveWebhook(body,signature);}

test("signed webhook inbox rejects tampering, deduplicates retries, and strips unknown sensitive fields",async()=>{
  const{repository,service,now}=await fixture();const event:PaymentProviderEvent={id:"evt_subscription_1",type:"subscription.updated",createdAt:now,data:{...subscription(now),cardNumber:"4242424242424242"} as ProviderSubscription};
  const body=JSON.stringify(event),signature=SandboxPaymentProvider.signature(body,secret,now);
  assert.throws(()=>service.receiveWebhook(body,signature.replace(/.$/,signature.endsWith("0")?"1":"0")),/WEBHOOK_SIGNATURE_INVALID/);
  assert.equal(service.receiveWebhook(body,signature).duplicate,false);assert.equal(service.receiveWebhook(body,signature).duplicate,true);
  const stored=repository.webhook("sandbox",event.id)!;assert.equal("cardNumber" in stored.event.data,false);assert.equal(stored.state,"received");
  const changed=JSON.stringify({...event,data:{...event.data,planKey:"pro"}});const changedSignature=SandboxPaymentProvider.signature(changed,secret,now);
  assert.throws(()=>service.receiveWebhook(changed,changedSignature),(error:unknown)=>error instanceof PaymentError&&error.code==="WEBHOOK_EVENT_CONFLICT");
});

test("subscription events apply once, ignore stale delivery, and quarantine illegal transitions",async()=>{
  const{repository,service,now}=await fixture();deliver(service,{id:"evt_active",type:"subscription.updated",createdAt:now,data:subscription(now)},now);
  assert.equal(service.processNext()?.state,"processed");assert.equal(repository.providerSubscription("sub_sandbox_1")?.state,"active");
  deliver(service,{id:"evt_stale",type:"subscription.updated",createdAt:now-10,data:subscription(now-10,{state:"past_due"})},now);
  assert.equal(service.processNext()?.state,"processed");assert.equal(repository.providerSubscription("sub_sandbox_1")?.state,"active");
  deliver(service,{id:"evt_illegal",type:"subscription.updated",createdAt:now+10,data:subscription(now+10,{state:"trial"})},now);
  assert.equal(service.processNext(2)?.state,"failed");assert.equal(service.processNext(2)?.state,"quarantined");assert.match(repository.webhook("sandbox","evt_illegal")?.lastError??"",/订阅状态不能/);
});

test("invoice state machine prevents paid invoices from reopening",async()=>{
  const{repository,service,now}=await fixture();deliver(service,{id:"evt_invoice_open",type:"invoice.updated",createdAt:now,data:invoice(now)},now);service.processNext();
  deliver(service,{id:"evt_invoice_paid",type:"invoice.updated",createdAt:now+1,data:invoice(now+1,{state:"paid"})},now);service.processNext();
  assert.equal(repository.providerInvoice("inv_sandbox_1")?.state,"paid");
  deliver(service,{id:"evt_invoice_reopen",type:"invoice.updated",createdAt:now+2,data:invoice(now+2,{state:"open"})},now);
  assert.equal(service.processNext(1)?.state,"quarantined");assert.equal(repository.providerInvoice("inv_sandbox_1")?.state,"paid");
});

test("stale processing leases recover and sandbox reconciliation repairs normalized state",async()=>{
  const{repository,provider,service,now,setNow}=await fixture();deliver(service,{id:"evt_waiting",type:"subscription.updated",createdAt:now,data:subscription(now)},now);
  const claimed=repository.claimNextWebhook("sandbox",now,5)!;assert.equal(claimed.state,"processing");setNow(now+600);assert.equal(service.recoverStale(300),1);assert.equal(repository.webhook("sandbox","evt_waiting")?.state,"failed");
  const webhookJob=runPaymentWebhookJob(service,{limit:10,processingTimeoutSeconds:300});assert.equal(webhookJob.completed,1);assert.equal(webhookJob.failed,0);
  provider.setSubscription(subscription(now+700,{planKey:"pro",providerCreatedAt:now+700}));provider.setInvoice(invoice(now+700,{state:"paid",providerCreatedAt:now+700}));setNow(now+700);
  const result=await service.reconcile({organizationId:"org_account_payment",customerRef:"cus_sandbox_1",subscriptionRef:"sub_sandbox_1"});
  assert.equal(result.status,"ok");assert.equal(result.subscriptionCorrections,1);assert.equal(result.invoiceCorrections,1);assert.equal(repository.providerSubscription("sub_sandbox_1")?.planKey,"pro");assert.equal(repository.providerInvoice("inv_sandbox_1")?.state,"paid");
  const[repeated]=await runPaymentReconciliationJob(service,[{organizationId:"org_account_payment",customerRef:"cus_sandbox_1",subscriptionRef:"sub_sandbox_1"}]);assert.equal(repeated.subscriptionCorrections,0);assert.equal(repeated.invoiceCorrections,0);
});
