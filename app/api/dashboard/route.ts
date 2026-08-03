import { NextResponse } from "next/server";
import { getCurrentUser, getDatabase } from "../../../lib/auth";
import { ensureProductSchema, ownedProject, pageLimit, projectLimit } from "../../../lib/product";

export async function GET(request: Request) {
  const user=await getCurrentUser(); if(!user) return NextResponse.json({error:"请先登录"},{status:401});
  await ensureProductSchema(); const db=getDatabase(); const url=new URL(request.url);
  const projects=db.prepare(`SELECT id,name,site_url AS siteUrl,host,market,language,business_goal AS businessGoal,approval_mode AS approvalMode,schedule_enabled AS scheduleEnabled,updated_at AS updatedAt FROM projects WHERE user_id=? ORDER BY updated_at DESC`).bind(user.id).all().results as Array<{id:string}>;
  const projectId=url.searchParams.get("projectId")||projects[0]?.id; const project=projectId?await ownedProject(user.id,projectId):null;
  if(projectId&&!project) return NextResponse.json({error:"项目不存在"},{status:404});
  if(!project) return NextResponse.json({user,projects,limits:{projects:projectLimit(user),pagesPerAudit:pageLimit(user)}});
  const latestRun=db.prepare(`SELECT id,status,score,pages_scanned AS pagesScanned,started_at AS startedAt,completed_at AS completedAt,error FROM audit_runs WHERE project_id=? ORDER BY started_at DESC LIMIT 1`).bind(project.id).first();
  const findings=db.prepare(`SELECT id,category,severity,title,description,evidence,url,status,created_at AS createdAt FROM findings WHERE project_id=? AND status='open' ORDER BY CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,created_at DESC LIMIT 100`).bind(project.id).all().results;
  const tasks=db.prepare(`SELECT id,type,title,description,priority,status,requires_approval AS requiresApproval,created_at AS createdAt FROM seo_tasks WHERE project_id=? ORDER BY priority DESC,created_at DESC LIMIT 100`).bind(project.id).all().results;
  const connections=db.prepare(`SELECT provider,status,connected_at AS connectedAt,updated_at AS updatedAt FROM project_connections WHERE project_id=? ORDER BY provider`).bind(project.id).all().results;
  const usage=db.prepare(`SELECT COALESCE(SUM(quantity),0) AS pagesCrawled FROM usage_events WHERE user_id=? AND metric='pages_crawled' AND created_at>=?`).bind(user.id,Math.floor(new Date(new Date().getFullYear(),new Date().getMonth(),1).getTime()/1000)).first();
  return NextResponse.json({user,projects,project,latestRun,findings,tasks,connections,usage,limits:{projects:projectLimit(user),pagesPerAudit:pageLimit(user)}});
}
