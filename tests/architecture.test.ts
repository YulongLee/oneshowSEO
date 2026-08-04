import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { asId, newId } from "../platform/core/ids";
import { pageLimit } from "../platform/core/contracts";
import { resolveFeatureFlag, type FeatureFlagRule } from "../platform/modules/operations/feature-flags";

const platformRoot = join(process.cwd(), "platform", "modules");

test("bounded platform modules do not access persistence adapters directly", async () => {
  const modules = await readdir(platformRoot, { withFileTypes: true });
  assert.ok(modules.length >= 9);
  for (const entry of modules) {
    if (!entry.isDirectory()) continue;
    const source = readFileSync(join(platformRoot, entry.name, "index.ts"), "utf8");
    assert.doesNotMatch(source, /lib\/database|node:sqlite|DatabaseSync/);
    assert.doesNotMatch(source, /platform\/modules\/[^/]+\/repository/);
  }
});

test("typed IDs reject blank values and generate opaque IDs", () => {
  assert.throws(() => asId("   ", "ProjectId"), /INVALID_PROJECTID/);
  assert.match(newId("TaskId"), /^[0-9a-f-]{36}$/);
});

test("shared pagination contract is bounded", () => {
  assert.equal(pageLimit(undefined), 25);
  assert.equal(pageLimit(0), 25);
  assert.equal(pageLimit(250, 100), 100);
  assert.equal(pageLimit(50, 100), 50);
});

test("feature flags resolve the most specific matching server rule", () => {
  const base = {id:"flag",key:"billing.live",version:1,active:true,createdAt:1,updatedAt:1};
  const rules: FeatureFlagRule[] = [
    {...base,id:"global",enabled:false,scope:"global",scopeValue:"*"},
    {...base,id:"plan",enabled:true,scope:"plan",scopeValue:"business",updatedAt:2},
    {...base,id:"project",enabled:false,scope:"project",scopeValue:"project-1",updatedAt:3},
  ];
  assert.equal(resolveFeatureFlag(rules,{environment:"production",plan:"business"}),true);
  assert.equal(resolveFeatureFlag(rules,{environment:"production",plan:"business",projectId:asId("project-1","ProjectId")}),false);
  assert.equal(resolveFeatureFlag(rules,{environment:"production",plan:"starter"}),false);
});
