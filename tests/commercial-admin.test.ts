import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("commercial administration uses real navigable modules instead of decorative sidebar labels", async () => {
  const [navigation, layout] = await Promise.all([source("app/admin/AdminNavigation.tsx"), source("app/admin/layout.tsx")]);
  for (const route of ["/admin/organizations","/admin/users","/admin/operations","/admin/integrations","/admin/models","/admin/commerce","/admin/audit","/admin/settings"]) assert.match(navigation,new RegExp(route.replaceAll("/","\\/")));
  assert.match(navigation,/aria-current/);
  assert.match(layout,/requireOperatorConsole/);
  assert.match(layout,/返回产品工作台/);
});

test("commercial modules stay permissioned and expose no secret values", async () => {
  const [operators, operations, settings] = await Promise.all([source("app/api/admin/operators/route.ts"),source("app/api/admin/operations/route.ts"),source("app/admin/settings/page.tsx")]);
  assert.match(operators,/platform_admin/);
  assert.match(operators,/admin_operator_assignment/);
  assert.match(operators,/admin_operator_revocation/);
  for (const permission of ["jobs.recover","flags.manage","incidents.manage"]) assert.match(operations,new RegExp(permission.replace(".","\\.")));
  assert.match(operations,/ACTION_REASON_REQUIRED|reason/);
  assert.doesNotMatch(settings,/process\.env\.[A-Z_]+\s*\}/);
});

test("configured administrator email repairs an existing pre-commercial account", async () => {
  const auth = await source("lib/auth.ts");
  assert.match(auth,/record\.role !== "admin" && isAdminEmail\(record\.email\)/);
  assert.match(auth,/UPDATE users SET role='admin'/);
});
