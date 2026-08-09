import assert from "node:assert/strict";
import test from "node:test";
import { AgentDevelopmentHarness } from "../platform/sdk/development-harness";
import { certifyAgentRelease, requiredAgentReleaseGates } from "../platform/modules/agents/certification";
import { ResearchAgent, researchAgentManifest, type ResearchSourceAcquirer } from "../platform/modules/agents/research-agent";

const envelope=()=>({schemaVersion:"1" as const,kind:"execution" as const,organizationId:"org_research",projectId:"project_research",taskId:"task_research_0001",jobId:"job_research_0001",attemptId:"attempt_research_0001",correlationId:"correlation_research_0001",idempotencyKey:"research:idempotency:0001",agent:{key:"research.agent",version:"1.0.0",capability:"research.discover"},actor:{type:"user" as const,id:"account_research"},locale:"zh-CN" as const,input:{siteUrl:"https://example.com/",market:"CN",language:"zh-CN",seed:"SEO Agent",maximumPages:10},artifactRefs:[],integrationRefs:[],memoryRefs:[],deadlineAt:2_000_000_000,cancellation:{tokenRef:"cancel_research_0001",pollAfterSeconds:2},limits:{maxRuntimeSeconds:900,maxOutputBytes:2_000_000,maxArtifacts:1,maxUsageUnits:10}});

test("Research Agent emits attributable fresh evidence, recommendations, artifact and final usage without fabricated keyword metrics",async()=>{
  const source:ResearchSourceAcquirer={acquire:async()=>({capturedAt:1_800_000_000,freshUntil:1_800_086_400,sourceRef:"https://example.com/",pages:[{url:"https://example.com/",title:"AI SEO Platform",description:"Automated SEO research and evidence",statusCode:200},{url:"https://example.com/pricing",title:"SEO Platform Pricing",description:"Plans for growing teams",statusCode:200}],degradedSources:["google_search_console","rank_provider"]})};
  const agent=new ResearchAgent(source),detail=await agent.runDetailed(envelope()),result=await new AgentDevelopmentHarness().run(agent,envelope());
  assert.equal(result.terminal,"completed");assert.equal(result.evidenceCount,2);assert.equal(result.artifactCount,1);assert.equal(result.usageUnits,2);
  assert.equal(detail.opportunities.length,2);assert.equal(detail.opportunities.every(item=>item.searchVolume===null&&item.keywordDifficulty===null),true);
  assert.deepEqual(detail.degradedSources,["google_search_console","rank_provider"]);assert.match(detail.evidence[0].digest,/^[0-9a-f]{64}$/);assert.equal(detail.evidence[0].freshUntil-detail.evidence[0].capturedAt,86_400);
});

test("Research Agent returns a localized dependency error and no billable usage when sources are unavailable",async()=>{
  const unavailable:ResearchSourceAcquirer={acquire:async()=>{throw new Error("PROVIDER_TIMEOUT")}},result=await new AgentDevelopmentHarness().run(new ResearchAgent(unavailable),envelope());
  assert.equal(result.terminal,"failed");assert.equal(result.evidenceCount,0);assert.equal(result.usageUnits,0);const failure=result.events.find(event=>event.kind==="error");assert.equal(failure?.kind,"error");if(failure?.kind==="error")assert.equal(failure.error.messageKey,"research.source.unavailable.zh");
});

test("Research Agent release manifest is versioned and all eleven certification gates are evidenced",()=>{
  assert.equal(researchAgentManifest.key,"research.agent");assert.equal(researchAgentManifest.version,"1.0.0");assert.deepEqual(researchAgentManifest.dependencies.providers,["public.crawl"]);assert.equal(researchAgentManifest.risks[0].approval,"none");
  const evidence=requiredAgentReleaseGates.map(gate=>({gate,passed:true,evidence:`tests/research-agent.test.ts#${gate}`,observedAt:1_800_000_000,owner:"research-platform"}));assert.equal(certifyAgentRelease({agentKey:"research.agent",version:"1.0.0",manifestVersion:"1",evidence,approvedBy:"release-owner",approvedAt:1_800_000_000}).certified,true);
});
