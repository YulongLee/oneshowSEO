import assert from "node:assert/strict";
import test from "node:test";
import { GeoAgent } from "../platform/modules/agents/geo-agent";
import { validateAgentExecutionEnvelope } from "../platform/modules/agents/contracts";
import type { AuditCheck,SiteAuditResult } from "../lib/site-audit";

const check=(key:string,category:string,status:AuditCheck["status"],title:string):AuditCheck=>({
 key,category,status,severity:status==="fail"?"medium":"info",confidence:"confirmed",title,description:title,
 evidence:`evidence:${key}`,recommendation:`fix:${key}`,url:"https://example.com/",
});

test("GEO Agent scores four evidence dimensions without inventing external mentions",async()=>{
 const checks=[
  check("json_ld_presence","structured_data","pass","Schema"),
  check("answer_structure","ai_search","warning","Answer structure"),
  check("eeat_authorship","content","fail","Authorship"),
  check("llms_txt","ai_search","pass","llms.txt"),
  check("title_presence","on_page","pass","Title"),
 ];
 const result:SiteAuditResult={
  pages:[{url:"https://example.com/",statusCode:200,title:"Example",description:"Example",canonical:"https://example.com/",h1Count:1,imagesWithoutAlt:0,findings:[]}],
  findings:[],checks,categoryScores:[],score:80,urlsDiscovered:1,urlsBlockedByRobots:0,partial:false,partialReasons:[],
  summary:{total:checks.length,passed:3,warning:1,failed:1,unknown:0,skipped:0},
 };
 const capturedAt=1_700_000_000;
 const agent=new GeoAgent({async acquire(){return{capturedAt,freshUntil:capturedAt+86400,result,degradedSources:["ai_visibility_provider"]}}});
 const envelope=validateAgentExecutionEnvelope({
  schemaVersion:"1",kind:"execution",organizationId:"org_geo",projectId:"project_geo",taskId:"task_geo",jobId:"job_geo",attemptId:"attempt_geo",correlationId:"correlation_geo",idempotencyKey:"geo:test:deterministic",
  agent:{key:"geo.agent",version:"1.0.0",capability:"geo.audit"},actor:{type:"user",id:"account_geo"},locale:"zh-CN",input:{siteUrl:"https://example.com/",maximumPages:10},artifactRefs:[],integrationRefs:[],memoryRefs:[],deadlineAt:capturedAt+900,cancellation:{tokenRef:"cancel:geo",pollAfterSeconds:2},limits:{maxRuntimeSeconds:900,maxOutputBytes:2_000_000,maxArtifacts:1,maxUsageUnits:10},
 });
 const output=await agent.runDetailed(envelope);
 assert.equal(output.checks.length,4);
 assert.equal(output.score,63);
 assert.deepEqual(output.dimensions,{machine_readability:100,answerability:50,authority:0,crawler_access:100});
 assert.equal(output.recommendations.length,2);
 assert.deepEqual(output.degradedSources,["ai_visibility_provider"]);
 assert.equal(output.events.some(event=>event.kind==="usage"),true);
});
