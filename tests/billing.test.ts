import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { billingPlans, billingProviderConfigured, ensureBillingSchema } from "../lib/billing";
import { ensureAuthSchema, getDatabase } from "../lib/auth";
import { AppDatabase } from "../lib/database";
import { SqliteCommerceRepository } from "../platform/adapters/sqlite/commerce-repository";
import { PLAN_CATALOG_VERSION } from "../platform/modules/commerce/catalog";
import { CommerceError, CommercialEntitlementService } from "../platform/modules/commerce/service";
import type { CommercialSubject } from "../platform/modules/commerce";

process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), "oneshowseo-billing-")), "test.sqlite");

async function commerceFixture(plan: CommercialSubject["planKey"] = "trial") {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys=ON");
  const database = new AppDatabase(sqlite);
  await ensureAuthSchema(database);
  const now = 1_786_000_000;
  database.prepare("INSERT INTO users(id,email,name,password_hash,role,status,plan,trial_ends_at,email_verified_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
    .bind("account_1", "owner@example.com", "Owner", "hash", "user", "active", plan, now + 86400 * 14, now, now - 100, now - 100).run();
  await ensureAuthSchema(database);
  database.exec("CREATE TABLE projects(id TEXT PRIMARY KEY)");
  const repository = new SqliteCommerceRepository(database);
  const service = new CommercialEntitlementService(repository, () => now);
  const subject: CommercialSubject = {
    accountId: "account_1",
    organizationId: "org_account_1",
    organizationStatus: plan === "trial" ? "trial" : "active",
    planKey: plan,
    trialEndsAt: plan === "trial" ? now + 86400 * 14 : null,
    accountCreatedAt: now - 100,
  };
  return { database, repository, service, subject, now };
}

test("billing plans and immutable catalog rows expose enforceable commercial limits", async () => {
  assert.equal(billingPlans.trial.teamSeatLimit, 1);
  assert.equal(billingPlans.pro.aiCreditLimit, 15_000);
  assert.equal(billingPlans.business.projectLimit, 100);
  assert.equal(billingPlans.pro.apiAccess, true);
  await ensureBillingSchema();
  const database = getDatabase();
  const billingTables = database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'billing_%' ORDER BY name").all<{ name: string }>().results.map((row) => row.name);
  assert.deepEqual(billingTables, ["billing_events", "billing_invoices", "billing_payment_methods"]);
  const catalogRows = database.prepare("SELECT plan_key AS planKey,catalog_version AS catalogVersion,active FROM commerce_plan_versions ORDER BY plan_key").all<{ planKey: string; catalogVersion: string; active: number }>().results;
  assert.equal(catalogRows.length, 4);
  assert.ok(catalogRows.every((row) => row.catalogVersion === PLAN_CATALOG_VERSION && row.active === 1));
});

test("effective entitlements apply organization overrides and subscription restrictions", async () => {
  const { database, service, subject, now } = await commerceFixture("starter");
  database.prepare("INSERT INTO commerce_entitlement_overrides(id,organization_id,entitlement_key,value_json,reason,valid_from,valid_until,version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
    .bind("override_1", subject.organizationId, "projects", "5", "contract", now - 1, now + 100, 2, now, now).run();
  const effective = service.resolve(subject);
  assert.equal(effective.limits.projects, 5);
  assert.equal(effective.version, 2);
  assert.equal(service.authorize(subject, "projects", 1, 4).access, "active");
  assert.throws(() => service.authorize(subject, "projects", 1, 5), (error: unknown) => error instanceof CommerceError && error.code === "LIMIT_REACHED");

  const expired = { ...subject, planKey: "trial" as const, organizationStatus: "trial", trialEndsAt: now - 1 };
  assert.throws(() => service.authorize(expired, "projects"), (error: unknown) => error instanceof CommerceError && error.code === "SUBSCRIPTION_REQUIRED");
});

test("Credits ledger grants once and reserve/commit/release are idempotent", async () => {
  const { repository, service, subject } = await commerceFixture();
  assert.equal(service.balance(subject).available, 1_000);
  assert.equal(service.balance(subject).available, 1_000);
  assert.equal(repository.recentLedger(subject.organizationId, 100).filter((row) => row.entryType === "grant").length, 1);

  const reservation = service.reserveCredits(subject, { quantity: 100, idempotencyKey: "task-1", taskId: "task-1", correlationId: "request-1" });
  assert.equal(service.reserveCredits(subject, { quantity: 100, idempotencyKey: "task-1", taskId: "task-1", correlationId: "request-1" }).id, reservation.id);
  assert.deepEqual(service.balance(subject), { granted: 1_000, committed: 0, reserved: 100, available: 900, capturedAt: 1_786_000_000, state: "pending" });

  const commit = service.commitCredits(subject, { reservationId: reservation.id, idempotencyKey: "task-1", correlationId: "request-2" });
  assert.equal(service.commitCredits(subject, { reservationId: reservation.id, idempotencyKey: "task-1", correlationId: "request-2" }).id, commit.id);
  assert.deepEqual(service.balance(subject), { granted: 1_000, committed: 100, reserved: 0, available: 900, capturedAt: 1_786_000_000, state: "final" });
  assert.throws(() => service.releaseCredits(subject, { reservationId: reservation.id, idempotencyKey: "late-release", correlationId: "request-3" }), (error: unknown) => error instanceof CommerceError && error.code === "RESERVATION_SETTLED");

  const released = service.reserveCredits(subject, { quantity: 900, idempotencyKey: "task-2", taskId: "task-2", correlationId: "request-4" });
  service.releaseCredits(subject, { reservationId: released.id, idempotencyKey: "task-2", correlationId: "request-5" });
  assert.equal(service.balance(subject).available, 900);
  const refund = service.adjustCredits(subject, { entryType: "refund", amount: 50, idempotencyKey: "refund-1", correlationId: "finance-1", relatedEntryId: commit.id });
  assert.equal(service.adjustCredits(subject, { entryType: "refund", amount: 50, idempotencyKey: "refund-1", correlationId: "finance-1", relatedEntryId: commit.id }).id, refund.id);
  service.adjustCredits(subject, { entryType: "adjustment", amount: 10, idempotencyKey: "adjustment-1", correlationId: "finance-2" });
  service.adjustCredits(subject, { entryType: "expiry", amount: -60, idempotencyKey: "expiry-1", correlationId: "finance-3" });
  assert.equal(service.balance(subject).available, 900);
  assert.throws(() => service.reserveCredits(subject, { quantity: 901, idempotencyKey: "too-large", taskId: "task-3", correlationId: "request-6" }), (error: unknown) => error instanceof CommerceError && error.code === "INSUFFICIENT_CREDITS");
});

test("usage ingestion and finalization do not double count retries", async () => {
  const { service, subject } = await commerceFixture("pro");
  const pending = service.ingestUsage(subject, { metric: "pages_crawled", quantity: 25, state: "pending", idempotencyKey: "audit-1", taskId: "audit-1" });
  assert.equal(service.ingestUsage(subject, { metric: "pages_crawled", quantity: 25, state: "pending", idempotencyKey: "audit-1", taskId: "audit-1" }).id, pending.id);
  assert.deepEqual(service.usageTotals(subject).map((row) => ({ ...row })), [{ metric: "pages_crawled", pending: 25, final: 0 }]);
  service.finalizeUsage(subject, "audit-1");
  service.finalizeUsage(subject, "audit-1");
  assert.deepEqual(service.usageTotals(subject).map((row) => ({ ...row })), [{ metric: "pages_crawled", pending: 0, final: 25 }]);
});

test("live billing stays disabled until the explicit launch flag is enabled", () => {
  const previousFlag = process.env.BILLING_LIVE_ENABLED;
  const previousSecret = process.env.PAYMENT_PROVIDER_SECRET;
  process.env.BILLING_LIVE_ENABLED = "false";
  process.env.PAYMENT_PROVIDER_SECRET = "configured-but-not-approved";
  assert.equal(billingProviderConfigured(), false);
  process.env.BILLING_LIVE_ENABLED = "true";
  assert.equal(billingProviderConfigured(), true);
  if (previousFlag === undefined) delete process.env.BILLING_LIVE_ENABLED; else process.env.BILLING_LIVE_ENABLED = previousFlag;
  if (previousSecret === undefined) delete process.env.PAYMENT_PROVIDER_SECRET; else process.env.PAYMENT_PROVIDER_SECRET = previousSecret;
});
