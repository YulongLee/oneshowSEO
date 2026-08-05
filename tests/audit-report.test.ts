import assert from "node:assert/strict";
import test from "node:test";
import { auditReportHtml, auditReportMarkdown, type AuditReportData } from "../lib/audit-report";
import {can,permissions} from "../platform/modules/identity/authorization";

const report:AuditReportData={
 project:{name:"Example <Site>",host:"example.com",siteUrl:"https://example.com/",market:"CN",language:"zh-CN"},
 run:{id:"run",score:82,pagesScanned:2,urlsDiscovered:3,checksTotal:10,checksPassed:6,checksWarning:2,checksFailed:1,checksUnknown:1,checksSkipped:0,completedAt:1},
 checks:[
  {category:"technical",status:"fail",severity:"high",confidence:"confirmed",title:"Broken <title>",description:"Problem",evidence:"HTTP 500",impact:"Cannot crawl",recommendation:"Fix server",url:"https://example.com/broken"},
  {category:"performance",status:"unknown",severity:"info",confidence:"hypothesis",title:"CWV",description:"No data",evidence:"Provider missing",recommendation:"Connect provider"},
 ],
 scores:[{category:"technical",score:70,confidence:"high",checksTotal:5,checksKnown:5}],
 pages:[{url:"https://example.com/",statusCode:200,title:"Home",h1Count:1,imagesWithoutAlt:0}],
};

test("markdown audit report contains evidence, action plan, and unknowns",()=>{
 const output=auditReportMarkdown(report);
 assert.match(output,/公开网站证据审计报告/);assert.match(output,/HTTP 500/);assert.match(output,/未知项与后续授权/);assert.match(output,/Connect provider/);
});

test("HTML audit report is printable and escapes untrusted evidence",()=>{
 const output=auditReportHtml(report);
 assert.match(output,/<!doctype html>/);assert.match(output,/@media print/);assert.match(output,/Example &lt;Site&gt;/);assert.match(output,/Broken &lt;title&gt;/);assert.doesNotMatch(output,/Broken <title>/);
});

test("audit report export requires an explicit export grant",()=>{
 assert.equal(can("owner",permissions.reportsExport),true);
 assert.equal(can("seo_manager",permissions.reportsExport),true);
 assert.equal(can("analyst",permissions.reportsExport),true);
 for(const role of ["content_manager","editor","writer","viewer","support","finance","operations","security"] as const)assert.equal(can(role,permissions.reportsExport),false,role);
});
