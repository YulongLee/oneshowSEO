import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");

test("Content Plan presents an actionable opportunity and planning hierarchy", async () => {
  const page = await read("app/workspace/ContentPlanCenter.tsx");
  for (const label of [
    "内容机会总数",
    "高价值机会",
    "待规划内容",
    "已排期内容",
    "已发布内容",
    "预估流量潜力 / 月",
    "本周排期",
    "内容流水线",
    "建议下一步",
    "打开日历",
    "机会来源分布",
    "内容类型分布",
    "热点话题推荐",
  ]) assert.match(page, new RegExp(label));
  assert.match(page, /创建内容简报/);
  assert.match(page, /PlanDrawer/);
  for (const view of [
    "CalendarWorkspace",
    "TaskWorkspace",
    "ClusterWorkspace",
    "PerformanceWorkspace",
    "待排期内容",
    "内容生产看板",
    "EDITORIAL CALENDAR",
    "PRODUCTION OPERATIONS",
    "TOPIC ARCHITECTURE",
    "CONTENT OUTCOMES",
    "Google Search Console",
    "Google Analytics 4",
  ]) assert.match(page, new RegExp(view));
  assert.match(page, /<PlanningOverview/);
  assert.match(page, /onCalendar=\{\(\)=>setTab\("内容日历"\)\}/);
  assert.match(page, /onTasks=\{\(\)=>setTab\("内容任务"\)\}/);
  assert.match(page, /opportunityPageSize=6/);
  assert.match(page, /每页最多 6 条/);
  assert.match(page, /aria-label="下一页"/);
  assert.match(page, /sourceLabel\(item\.source\)/);
  assert.match(page, /setActiveName\(name\)/);
  assert.match(page, /<Fragment key=\{name\}>/);
  assert.doesNotMatch(page, /页面数值仅用于界面预览|演示数据/);
});

test("Content Plan empty state preserves the commercial workspace and explains prerequisites", async () => {
  const page = await read("app/workspace/ContentPlanCenter.tsx");
  for (const label of [
    "RECOMMENDED NEXT STEP",
    "WORKFLOW READINESS",
    "项目域名",
    "站点抓取",
    "研究机会",
    "内容生产看板",
    "主题架构工作台",
    "内容排期中心",
    "发现内容机会",
  ]) assert.match(page, new RegExp(label));
  assert.match(page, /"content-plan","research","content","publish","analytics"/);
  assert.match(page, /navigate\("竞争对手"\)/);
  assert.match(page, /visible=\{isEmpty\}/);
  assert.doesNotMatch(page, /ContentPrerequisiteEmpty/);
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

test("Content generation uses an in-product confirmation and exposes actionable blockers", async () => {
  const [page, contentRoute] = await Promise.all([
    read("app/workspace/ContentPlanCenter.tsx"),
    read("app/api/projects/[id]/content/route.ts"),
  ]);
  assert.doesNotMatch(page, /window\.confirm/);
  for (const label of ["GenerationDialog", "生成方式", "本次预留", "当前无法开始生成", "查看套餐", "没有开始生成"])
    assert.match(page, new RegExp(label));
  assert.match(page, /model\.provider/);
  assert.match(page, /model\.model/);
  assert.match(contentRoute, /generation:.*allowed:boolean/);
  assert.match(contentRoute, /authorizeAccess/);
  assert.match(contentRoute, /creditCost:CONTENT_CREDIT_COST/);
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
