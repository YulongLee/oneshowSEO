import assert from "node:assert/strict";
import test from "node:test";
import { workspaceAvailability } from "../platform/modules/operations/workspace-availability";

test("unconnected prototype modules are explicitly labelled demo or unavailable", () => {
  const states=workspaceAvailability({capturedAt:1,hasAudit:false,hasResearch:false,hasAnalyticsSnapshot:false,hasKeywordMetrics:false,hasSearchPerformance:false,hasAnalytics:false,hasRankProvider:false,hasCustomerIntegrations:false,billingLive:false,apiEnabled:false});
  assert.equal(states["内容规划"]?.state,"no_data");
  assert.equal(states["AI 内容生产"]?.state,"no_data");
  assert.equal(states["数据连接"]?.state,"no_data");
  assert.equal(states["GEO Agent"]?.state,"no_data");
  assert.equal(states["数据分析"]?.state,"no_data");
  for(const key of ["关键词研究","内容库","知识库","排名监控","AI 可见性"]) assert.equal(states[key]?.state,"demo",key);
  for(const key of ["Agent Center","Billing","套餐升级"]) assert.equal(states[key]?.state,"unavailable",key);
  assert.equal(states["总览"]?.state,"no_data");
  assert.equal(states["网站诊断"]?.state,"no_data");
});

test("connected sources promote only their owned modules to real data", () => {
  const states=workspaceAvailability({capturedAt:1,hasAudit:true,hasResearch:true,hasContentWorkflow:true,hasGeo:true,hasAnalyticsSnapshot:true,hasKeywordMetrics:true,hasSearchPerformance:true,hasAnalytics:true,hasRankProvider:true,hasCustomerIntegrations:true,billingLive:true,apiEnabled:true});
  for(const key of ["总览","竞争对手","网站诊断","关键词研究","内容规划","AI 内容生产","GEO Agent","数据分析","报告","排名监控","数据连接","Billing","API & MCP","套餐升级"]) assert.equal(states[key]?.state,"fresh",key);
  assert.equal(states["AI 可见性"]?.state,"demo");
});
