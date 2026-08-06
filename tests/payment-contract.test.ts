import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration=await readFile(new URL("../platform/adapters/postgres/migrations/0007_expand_payment_lifecycle.sql",import.meta.url),"utf8");
const route=await readFile(new URL("../app/api/billing/webhooks/[provider]/route.ts",import.meta.url),"utf8");
const billingRoute=await readFile(new URL("../app/api/billing/route.ts",import.meta.url),"utf8");

test("payment migration persists deduplicated inbox, normalized invoices, ordering, and reconciliation evidence",()=>{
  for(const table of ["commerce.payment_webhook_inbox","commerce.provider_invoices","commerce.payment_reconciliations"])assert.match(migration,new RegExp(`CREATE TABLE ${table.replace(".","\\.")}`));
  assert.match(migration,/UNIQUE \(provider, provider_event_id\)/);assert.match(migration,/payload_sha256/);assert.match(migration,/provider_event_created_at/);assert.match(migration,/last_provider_event_id/);
  assert.doesNotMatch(migration,/card_number|card_cvc|payment_card/i);
});

test("webhook route is sandbox-gated, signed, size-bounded, and does not enable checkout",()=>{
  assert.match(route,/sandboxPaymentService/);assert.match(route,/x-payment-signature/);assert.match(route,/1_048_576/);assert.doesNotMatch(route,/BILLING_LIVE_ENABLED\s*=|checkout|charge/i);
  assert.match(billingRoute,/commerce_provider_invoices/);assert.match(billingRoute,/PAYMENT_APPROVAL_PENDING/);
});
