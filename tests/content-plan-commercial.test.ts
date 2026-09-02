import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");

test("Content Plan is a commercial decision workspace instead of an empty dashboard", async () => {
  const page = await read("app/workspace/page.tsx");
  for (const label of [
    "把研究机会变成可发布内容",
    "AI 推荐下一步",
    "本周生产节奏",
    "优先机会队列",
    "计划可信度",
    "接下来可以推进",
  ]) assert.match(page, new RegExp(label));
  assert.doesNotMatch(page, /页面数值仅用于界面预览/);
});

test("Content Plan preserves the verified opportunity to brief workflow", async () => {
  const page = await read("app/workspace/page.tsx");
  assert.match(page, /filteredOpportunities\[0\] \|\| opportunities\[0\]/);
  assert.match(page, /openCreate\(topOpportunity\)/);
  assert.match(page, /openCreate\(item\)/);
  assert.match(page, /waitForTask\(result\.taskId\)/);
  assert.match(page, /不会展示演示数据/);
});

test("Content Plan has responsive commercial hierarchy and bilingual labels", async () => {
  const [styles, i18n] = await Promise.all([
    read("app/globals.css"),
    read("app/i18n.tsx"),
  ]);
  assert.match(styles, /Commercial content planning workbench/);
  assert.match(styles, /content-plan-decision-grid/);
  assert.match(styles, /@media\(max-width:920px\).*content-plan-commercial/s);
  assert.match(i18n, /"把研究机会变成可发布内容":"Turn research opportunities into publishable content"/);
  assert.match(i18n, /"优先机会队列":"Priority opportunity queue"/);
});
