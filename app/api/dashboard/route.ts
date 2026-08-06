import { NextResponse } from "next/server";
import { getCurrentUser, getDatabase } from "../../../lib/auth";
import { ensureProductSchema, ownedProject } from "../../../lib/product";
import { dataSourceDefinitions, listDataSources } from "../../../lib/data-sources";
import { billingProviderConfigured, commerceService, commercialSubject, ensureBillingSchema } from "../../../lib/billing";
import { workspaceAvailability } from "../../../platform/modules/operations/workspace-availability";
import { workspaceCatalog } from "../../../lib/workspace-catalog";
import { integrationRepository } from "../../../lib/integrations";

export async function GET(request: Request) {
  const user=await getCurrentUser(); if(!user) return NextResponse.json({error:"请先登录"},{status:401});
  await ensureProductSchema();await ensureBillingSchema();const db=getDatabase(); const url=new URL(request.url);const entitlements=commerceService().resolve(commercialSubject(user));
  const projects=db.prepare(`SELECT p.id,p.name,p.site_url AS siteUrl,p.host,p.market,p.language,p.timezone,p.business_goal AS businessGoal,
    p.approval_mode AS approvalMode,p.schedule_enabled AS scheduleEnabled,p.status,p.version,p.slug,p.business_type AS businessType,
    p.search_engines AS searchEnginesJson,p.archived_at AS archivedAt,p.deletion_requested_at AS deletionRequestedAt,p.created_at AS createdAt,p.updated_at AS updatedAt,
    (SELECT score FROM audit_runs ar WHERE ar.project_id=p.id AND ar.status='completed' ORDER BY ar.started_at DESC LIMIT 1) AS healthScore,
    (SELECT completed_at FROM audit_runs ar WHERE ar.project_id=p.id AND ar.status='completed' ORDER BY ar.started_at DESC LIMIT 1) AS lastRunAt,
    (SELECT checks_failed FROM audit_runs ar WHERE ar.project_id=p.id AND ar.status='completed' ORDER BY ar.started_at DESC LIMIT 1) AS failedChecks,
    (SELECT COUNT(*) FROM seo_tasks st WHERE st.project_id=p.id AND st.status IN ('proposed','approved','in_progress')) AS openTasks
    FROM projects p WHERE p.organization_id=? AND p.status!='pending_deletion' ORDER BY CASE p.status WHEN 'active' THEN 1 ELSE 2 END,p.updated_at DESC`).bind(user.organization.organizationId).all().results as Array<{id:string}>;
  const catalogService=await workspaceCatalog();for(const item of projects)(item as {openTasks:number}).openTasks=catalogService.read(user.organization.organizationId,item.id).tasks.filter(task=>["proposed","approved","in_progress"].includes(task.status)).length;
  const projectId=url.searchParams.get("projectId")||projects.find(project=>(project as {status?:string}).status==="active")?.id||projects[0]?.id; const project=projectId?await ownedProject(user.organization.organizationId,projectId):null;
  if(projectId&&!project) return NextResponse.json({error:"项目不存在"},{status:404});
  const platformSources=(await listDataSources()).map(source=>({provider:source.provider,name:dataSourceDefinitions[source.provider].name,description:dataSourceDefinitions[source.provider].description,enabled:source.enabled,configured:source.configured,lastTestStatus:source.lastTestStatus,lastTestedAt:source.lastTestedAt,updatedAt:source.updatedAt}));
  if(!project) return NextResponse.json({user,projects,platformSources,moduleAvailability:workspaceAvailability({capturedAt:Math.floor(Date.now()/1000),hasAudit:false,hasResearch:false,hasKeywordMetrics:false,hasSearchPerformance:false,hasAnalytics:false,hasRankProvider:false,hasCustomerIntegrations:false,billingLive:billingProviderConfigured(),apiEnabled:entitlements.limits.apiAccess}),limits:{projects:entitlements.limits.projects,pagesPerAudit:entitlements.limits.pagesPerAudit}});
  const latestRun=db.prepare(`SELECT id,status,score,pages_scanned AS pagesScanned,urls_discovered AS urlsDiscovered,
    checks_total AS checksTotal,checks_passed AS checksPassed,checks_warning AS checksWarning,checks_failed AS checksFailed,
    checks_unknown AS checksUnknown,checks_skipped AS checksSkipped,started_at AS startedAt,completed_at AS completedAt,error
    FROM audit_runs WHERE project_id=? ORDER BY started_at DESC LIMIT 1`).bind(project.id).first<{id:string}>();
  const recentRuns=db.prepare(`SELECT id,status,score,pages_scanned AS pagesScanned,started_at AS startedAt,completed_at AS completedAt
    FROM audit_runs WHERE project_id=? AND status='completed' ORDER BY started_at DESC LIMIT 12`).bind(project.id).all().results.reverse();
  const findings=db.prepare(`SELECT id,category,severity,title,description,evidence,url,status,created_at AS createdAt FROM findings WHERE project_id=? AND status='open' ORDER BY CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,created_at DESC LIMIT 100`).bind(project.id).all().results;
  const catalog=catalogService.read(user.organization.organizationId,project.id);const tasks=catalog.tasks.slice(0,100);
  const pagesUsage=commerceService().usageTotals(commercialSubject(user)).find(row=>row.metric==="pages_crawled");
  const usage={pagesCrawled:Number(pagesUsage?.final??0),pagesPending:Number(pagesUsage?.pending??0)};
  const checks=latestRun?db.prepare(`SELECT id,category,check_key AS checkKey,status,severity,confidence,title,description,evidence,impact,recommendation,url
    FROM audit_checks WHERE run_id=? ORDER BY category,CASE status WHEN 'fail' THEN 1 WHEN 'warning' THEN 2 WHEN 'unknown' THEN 3 WHEN 'skipped' THEN 4 ELSE 5 END,title`).bind(latestRun.id).all().results:[];
  const categoryScores=latestRun?db.prepare(`SELECT category,score,confidence,checks_total AS checksTotal,checks_known AS checksKnown FROM audit_category_scores WHERE run_id=? ORDER BY category`).bind(latestRun.id).all().results:[];
  const auditPages=latestRun?db.prepare(`SELECT url,status_code AS statusCode,title,description,canonical,h1_count AS h1Count,images_without_alt AS imagesWithoutAlt FROM audit_pages WHERE run_id=? ORDER BY url LIMIT 500`).bind(latestRun.id).all().results:[];
  const latestResearch=db.prepare(`SELECT id,status,opportunities_found AS opportunitiesFound,content_ideas AS contentIdeas,started_at AS startedAt,completed_at AS completedAt,error FROM research_runs WHERE project_id=? ORDER BY started_at DESC LIMIT 1`).bind(project.id).first<{id:string}>();
  const researchOpportunities=latestResearch?db.prepare(`SELECT id,title,keyword,intent,source,url,priority,search_volume AS searchVolume,keyword_difficulty AS keywordDifficulty,potential_traffic AS potentialTraffic,created_at AS createdAt FROM research_opportunities WHERE run_id=? ORDER BY priority DESC,created_at DESC LIMIT 100`).bind(latestResearch.id).all().results:[];
  const projectConnections=db.prepare("SELECT provider,status FROM project_connections WHERE project_id=?").bind(project.id).all().results as Array<{provider:string;status:string}>;
  const governedConnections=(await integrationRepository()).listConnections(user.organization.organizationId,project.id);const connectionState=Object.fromEntries(projectConnections.map(item=>[item.provider,item.status==="connected"]));for(const item of governedConnections)if(item.state==="connected")connectionState[item.providerId.replaceAll("-","_")]=true;
  const research={latestRun:latestResearch,opportunities:researchOpportunities,capabilities:{publicCrawl:connectionState.public_crawl===true,keywordMetrics:connectionState.rank_provider===true,searchPerformance:connectionState.google_search_console===true,analytics:connectionState.google_analytics_4===true,competitorData:false,trendData:false,questionMining:false}};
  const moduleAvailability=workspaceAvailability({capturedAt:Math.floor(Date.now()/1000),hasAudit:Boolean(latestRun),hasResearch:Boolean(latestResearch),hasKeywordMetrics:research.capabilities.keywordMetrics,hasSearchPerformance:research.capabilities.searchPerformance,hasAnalytics:research.capabilities.analytics,hasRankProvider:connectionState.rank_provider===true,hasCustomerIntegrations:governedConnections.some(item=>item.state==="connected"),billingLive:billingProviderConfigured(),apiEnabled:entitlements.limits.apiAccess});
  return NextResponse.json({user,projects,project,latestRun,recentRuns,findings,tasks,artifacts:catalog.artifacts,contentArtifacts:catalog.content,knowledgeArtifacts:catalog.knowledge,reportArtifacts:catalog.reports,usage,checks,categoryScores,auditPages,research,platformSources,moduleAvailability,limits:{projects:entitlements.limits.projects,pagesPerAudit:entitlements.limits.pagesPerAudit}});
}
