import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("app/workspace/page.tsx", "utf8");
const styles = readFileSync("app/globals.css", "utf8");
const i18n = readFileSync("app/i18n.tsx", "utf8");

test("Keyword Agent centers the workflow on research, evidence, selection, and planning", () => {
  for (const label of [
    "今天想研究什么？",
    "Agent 研究链路",
    "关键词机会",
    "评分依据",
    "加入关键词计划",
    "生成关键词计划",
  ]) assert.match(page, new RegExp(label));
  assert.match(page, /keyword-discovery-layout/);
  assert.match(page, /keyword-inspector/);
  assert.match(page, /keyword-plan-dock/);
});

test("Keyword Agent does not present unsupported provider metrics as a verified overall score", () => {
  assert.match(page, /综合评分暂不计算/);
  assert.match(page, /不冒充搜索机会综合分/);
  assert.match(page, /metricReady\?"完整":"部分"/);
  assert.doesNotMatch(page, /keyword-score-ring/);
});

test("Keyword Agent has responsive, accessible controls and bilingual copy", () => {
  assert.match(page, /role="tablist"/);
  assert.match(page, /aria-selected=/);
  assert.match(page, /aria-pressed=/);
  assert.match(styles, /@media\(max-width:760px\).*keyword-ideas-table\{overflow-x:auto\}/s);
  assert.match(i18n, /"今天想研究什么？":"What would you like to research\?"/);
  assert.match(i18n, /"数据置信度":"Data confidence"/);
});
