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
    "EDITORIAL CALENDAR",
    "PRODUCTION BOARD",
    "TOPIC ARCHITECTURE",
    "CONTENT OUTCOMES",
    "Google Search Console",
    "Google Analytics 4",
  ]) assert.match(page, new RegExp(view));
  assert.doesNotMatch(page, /页面数值仅用于界面预览|演示数据/);
});

test("Content Plan empty state explains prerequisites and connects the production workflow", async () => {
  const page = await read("app/workspace/ContentPlanCenter.tsx");
  for (const label of [
    "下一步行动",
    "工作流准备度",
    "项目与域名",
    "公开抓取",
    "Research Agent",
    "关键词指标",
    "GSC 数据",
    "GA4 数据",
    "机会评审",
    "Brief",
    "排期计划",
    "创建内容",
    "发布上线",
    "衡量表现",
  ]) assert.match(page, new RegExp(label));
  assert.match(page, /"content-plan","research","content","publish","analytics"/);
  assert.match(page, /navigate\("竞争对手"\)/);
  assert.match(page, /isEmpty&&tab==="内容机会"/);
});

test("Content Plan uses a dedicated persistence API without queuing generation or credits", async () => {
  const [component, route, service] = await Promise.all([
    read("app/workspace/ContentPlanCenter.tsx"),
    read("app/api/projects/[id]/content-plan/route.ts"),
    read("lib/content-planning.ts"),
  ]);
  assert.match(component, /\/content-plan/);
  assert.match(route, /createContentBrief/);
  assert.match(route, /updateContentPlan/);
  assert.match(route, /action==="update_plan"/);
  assert.match(service, /CREATE TABLE IF NOT EXISTS content_briefs/);
  assert.match(service, /CREATE TABLE IF NOT EXISTS content_plans/);
  assert.match(service, /export function updateContentPlan/);
  assert.match(service, /CONTENT_OPPORTUNITY_NOT_FOUND/);
  assert.doesNotMatch(route, /reserveCredits|createTask|content_generation/);
  assert.doesNotMatch(service, /reserveCredits|createTask|content_generation/);
});

test("Content Plan secondary tabs use real production, publish, and analytics sources", async () => {
  const page = await read("app/workspace/ContentPlanCenter.tsx");
  for (const endpoint of ["content", "publish", "analytics"]) assert.match(page, new RegExp(`\\"${endpoint}\\"`));
  assert.match(page, /status==="published"&&item\.verificationStatus==="verified"/);
  assert.match(page, /qualityScore/);
  assert.match(page, /coverage\.searchConsole/);
  assert.match(page, /coverage\.ga4/);
  assert.match(page, /保存计划/);
  assert.match(page, /开始创作/);
  assert.doesNotMatch(page, /128\.6K|12,580|28,742|3,856/);
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
