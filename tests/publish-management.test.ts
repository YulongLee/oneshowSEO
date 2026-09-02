import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");

test("Publish Management retains the governed production flow", async () => {
  const component = await read("app/workspace/PublishAgentControl.tsx");
  assert.match(component, /\/publish`/);
  assert.match(component, /verificationStatus === "verified"/);
  assert.match(component, /reviewStatus/);
  assert.match(component, /artifactId/);
  assert.match(component, /提交发布审批/);
  assert.match(component, /Credits/);
});

test("Publish Management exposes plans, calendar, statuses and effects", async () => {
  const component = await read("app/workspace/PublishAgentControl.tsx");
  for (const label of ["发布计划", "发布中", "已发布", "失败记录", "草稿箱", "发布日历", "平台分布", "发布状态分布", "最近发布效果", "即将发布"])
    assert.match(component, new RegExp(label));
  assert.match(component, /buildCalendar/);
  assert.match(component, /calendarMode/);
});

test("Publish Management does not fabricate channels or performance", async () => {
  const component = await read("app/workspace/PublishAgentControl.tsx");
  assert.match(component, /WordPress/);
  assert.match(component, /需要 GSC \/ GA4/);
  assert.doesNotMatch(component, /知乎|小红书|抖音|公众号|掘金|牛客/);
  assert.doesNotMatch(component, /128\.6K|12\.5K|96\.8%/);
});

test("Publish Management is wired into the workspace with the current account", async () => {
  const page = await read("app/workspace/page.tsx");
  assert.match(page, /active === "AI 内容生产"/);
  assert.match(page, /<PublishAgent/);
  assert.match(page, /user=\{data\.user\}/);
});
