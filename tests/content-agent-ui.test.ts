import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("app/workspace/page.tsx", "utf8");
const route = readFileSync("app/api/tasks/route.ts", "utf8");
const styles = readFileSync("app/globals.css", "utf8");
const i18n = readFileSync("app/i18n.tsx", "utf8");

test("Content Agent is brief-driven and keeps evidence and approval visible", () => {
  for (const label of ["从一个可信 Brief 开始","目标受众","搜索意图","品牌语气","内容目标","证据来源","发布前质量闸门"]) assert.match(page, new RegExp(label));
  assert.match(page, /role="tablist" aria-label="内容工作区"/);
  assert.match(page, /进入发布 Agent/);
});

test("Content Agent excludes technical audit findings from content opportunities", () => {
  assert.match(page, /HSTS\|robots\\\.txt\|sitemap\|security policy\|安全响应头/);
  assert.match(page, /item\.intent!=="technical"/);
});

test("Content brief fields persist into the task evidence record", () => {
  for (const field of ["audience","intent","tone","goal","sourceRef","brief"]) assert.match(route, new RegExp(field));
  for (const label of ["目标受众：","搜索意图：","品牌语气：","内容目标：","证据来源：","补充要求："]) assert.match(route, new RegExp(label));
});

test("Content Agent is responsive and bilingual", () => {
  assert.match(styles, /Content Agent workflow redesign/);
  assert.match(styles, /@media\(max-width:760px\).*content-brief-form-grid\{grid-template-columns:1fr\}/s);
  assert.match(i18n, /"从一个可信 Brief 开始":"Start with a trustworthy brief"/);
  assert.match(i18n, /"发布前质量闸门":"Pre-publish quality gate"/);
});
