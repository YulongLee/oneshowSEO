import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const source = (relative:string) => readFileSync(fileURLToPath(new URL(`../${relative}`, import.meta.url)), "utf8");

test("every customer-facing capacity-creating route enforces effective commercial access", () => {
  const protectedRoutes = [
    ["app/api/projects/route.ts", /authorizeAccess\(commercialSubject\(user\)\)/, /db\.transaction\(\(\)=>\{const effective=/],
    ["app/api/projects/[id]/audit/route.ts", /authorize\(subject,"pagesPerAudit"/, /authorize\(subject,"pagesPerMonth"/],
    ["app/api/projects/[id]/research/route.ts", /authorizeAccess\(commercialSubject\(user\)\)/],
    ["app/api/projects/[id]/team/route.ts", /authorizeAccess\(commercialSubject\(authorized\.user\)\)/, /authorize\(commercialSubject\(authorized\.user\),"seats"/],
    ["app/api/invitations/route.ts", /authorize\(commercialSubject\(user\),"seats"/],
    ["app/api/tasks/route.ts", /authorizeAccess\(commercialSubject\(user\)\)/],
    ["app/api/approvals/route.ts", /body\.action==="approve"\|\|body\.action==="schedule"/, /authorizeAccess\(commercialSubject\(user\)\)/],
    ["app/api/api-access/route.ts", /createApiKey\(user/, /authorize\(commercialSubject\(user\),"apiAccess"/],
  ] as const;

  for (const [file, ...expectations] of protectedRoutes) {
    const contents = source(file);
    for (const expectation of expectations) assert.match(contents, expectation, `${file} is missing commercial enforcement`);
  }
});

test("API bearer authentication resolves current organization entitlements", () => {
  const contents = source("lib/api-access.ts");
  assert.match(contents, /commerceService\(\)\.authorize\(commercialSubject\(authenticatedUser\),"apiAccess"\)/);
  assert.match(contents, /effective\.limits\.apiRequests/);
  assert.doesNotMatch(contents, /hasApiAccess\(row\.plan/);
});

test("usage reconciliation is restricted to platform administrators and audited", () => {
  const contents = source("app/api/admin/usage/route.ts");
  assert.match(contents, /authorizePlatformAccount\(user\.role\)/);
  assert.match(contents, /commerceService\(\)\.reconcileUsage/);
  assert.match(contents, /writeAudit\("admin_usage_reconciliation"/);
});

test("project limit check and creation execute inside one immediate transaction", () => {
  const route = source("app/api/projects/route.ts");
  const database = source("lib/database.ts");
  assert.match(route,/db\.transaction\(\(\)=>\{const effective=.*const count=/);
  assert.match(database,/transaction<T>\(operation:\(\)=>T\):T \{/);
  assert.match(database,/transactionDepth===0\)\{this\.database\.exec\("BEGIN IMMEDIATE"\)/);
  assert.match(database,/SAVEPOINT/);
  assert.match(database,/ROLLBACK TO SAVEPOINT/);
});
