import assert from "node:assert/strict";
import test from "node:test";
import {
  assertDeletionConfirmation,
  assertProjectVersion,
  canonicalProjectUrl,
  normalizeProjectSettings,
  projectSlug,
  ProjectGovernanceError,
} from "../platform/modules/projects/governance";

test("project domains are canonicalized and unsafe targets are rejected", () => {
  assert.deepEqual(canonicalProjectUrl("HTTPS://Example.COM/path?q=1"), {siteUrl:"https://example.com/",host:"example.com"});
  for (const target of ["ftp://example.com", "https://user:pass@example.com", "http://localhost:3000", "http://127.0.0.1", "http://192.168.1.5"]) {
    assert.throws(() => canonicalProjectUrl(target), ProjectGovernanceError);
  }
});

test("project settings apply authoritative defaults and supported engines", () => {
  const settings = normalizeProjectSettings({name:" 商业官网 ",siteUrl:"example.com",market:"CN",language:"zh-CN",businessGoal:"conversions",approvalMode:"required",searchEngines:["google","baidu","unknown","google"]});
  assert.equal(settings.name,"商业官网");
  assert.equal(settings.timezone,"Asia/Shanghai");
  assert.deepEqual(settings.searchEngines,["google","baidu"]);
  assert.equal(settings.businessGoal,"conversions");
});

test("optimistic versions reject stale writes", () => {
  assert.doesNotThrow(() => assertProjectVersion(4,4));
  assert.throws(() => assertProjectVersion(3,4), (error: unknown) => error instanceof ProjectGovernanceError && error.code === "CONFLICT" && error.status === 409);
  assert.throws(() => assertProjectVersion(undefined,4), ProjectGovernanceError);
});

test("safe deletion requires exact project identity", () => {
  const project={name:"OneShowSEO 官网",host:"oneshowseo.com"};
  assert.doesNotThrow(()=>assertDeletionConfirmation(project.name,project));
  assert.doesNotThrow(()=>assertDeletionConfirmation(project.host,project));
  assert.throws(()=>assertDeletionConfirmation("OneShowSEO",project),ProjectGovernanceError);
});

test("project slugs are stable, bounded, and collision resistant", () => {
  assert.equal(projectSlug("www.example.com","12345678-abcd-ef00-1111-222233334444"),"www-example-com-12345678");
});
