import test from "node:test";
import assert from "node:assert/strict";
import { billingPlans, ensureBillingSchema } from "../lib/billing";
import { getDatabase } from "../lib/auth";

test("billing plans expose enforceable commercial limits", async()=>{
  assert.equal(billingPlans.trial.teamSeatLimit,1);
  assert.equal(billingPlans.pro.aiCreditLimit,15000);
  assert.equal(billingPlans.business.projectLimit,100);
  assert.equal(billingPlans.pro.apiAccess,true);
  await ensureBillingSchema();
  const tables=(await getDatabase().prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'billing_%' ORDER BY name").all<{name:string}>()).results.map(row=>row.name);
  assert.deepEqual(tables,["billing_events","billing_invoices","billing_payment_methods"]);
});
