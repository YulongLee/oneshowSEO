import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");

test("Content Plan matches the approved opportunity and calendar hierarchy", async () => {
  const page = await read("app/workspace/ContentPlanCenter.tsx");
  for (const label of [
    "内容机会总数",
    "高价值机会",
    "待规划内容",
    "已排期内容",
    "已发布内容",
    "预估流量潜力 / 月",
    "内容日历",
    "机会来源分布",
    "内容类型分布",
    "热点话题推荐",
  ]) assert.match(page, new RegExp(label));
  assert.match(page, /创建 Content Brief/);
  assert.match(page, /PlanDrawer/);
  for (const view of [
    "CalendarWorkspace",
    "TaskWorkspace",
    "ClusterWorkspace",
    "PerformanceWorkspace",
    "待排期内容",
    "内容转化",
  ]) assert.match(page, new RegExp(view));
  assert.doesNotMatch(page, /页面数值仅用于界面预览|演示数据/);
});

test("Content Plan uses a dedicated persistence API without queuing generation or credits", async () => {
  const [component, route, service] = await Promise.all([
    read("app/workspace/ContentPlanCenter.tsx"),
    read("app/api/projects/[id]/content-plan/route.ts"),
    read("lib/content-planning.ts"),
  ]);
  assert.match(component, /\/content-plan/);
  assert.match(route, /createContentBrief/);
  assert.match(service, /CREATE TABLE IF NOT EXISTS content_briefs/);
  assert.match(service, /CREATE TABLE IF NOT EXISTS content_plans/);
  assert.match(service, /CONTENT_OPPORTUNITY_NOT_FOUND/);
  assert.doesNotMatch(route, /reserveCredits|createTask|content_generation/);
  assert.doesNotMatch(service, /reserveCredits|createTask|content_generation/);
});

test("Content Plan is routed independently and has responsive page-scoped styles", async () => {
  const [page, styles] = await Promise.all([
    read("app/workspace/page.tsx"),
    read("app/globals.css"),
  ]);
  assert.match(page, /import ContentPlanCenter/);
  assert.match(page, /<ContentPlanCenter/);
  assert.match(styles, /content-plan-reference/);
  assert.match(styles, /cp-main-grid/);
  assert.match(styles, /@media\(max-width:1180px\)/);
  assert.match(styles, /@media\(max-width:820px\)/);
});
