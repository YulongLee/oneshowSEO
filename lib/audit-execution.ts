import { getDatabase } from "./auth";
import { auditReportMarkdown, type AuditReportData } from "./audit-report";
import { runSiteAudit } from "./site-audit";

export type AuditExecutionInput={projectId:string;siteUrl:string;pageLimit:number};
export type AuditExecutionResult={runId:string;score:number;pagesScanned:number;urlsDiscovered:number;findingCount:number;report:Uint8Array;reportTitle:string};

export async function executeSiteAudit(input:AuditExecutionInput,signal?:AbortSignal):Promise<AuditExecutionResult>{
  if(signal?.aborted)throw signal.reason;
  const db=getDatabase(),project=db.prepare("SELECT id,name,host,site_url AS siteUrl,market,language,status FROM projects WHERE id=?").bind(input.projectId).first<{id:string;name:string;host:string;siteUrl:string;market:string;language:string;status:string}>();
  if(!project||project.status!=="active"||project.siteUrl!==input.siteUrl)throw new Error("PROJECT_NOT_ACTIVE");
  const runId=crypto.randomUUID(),started=Math.floor(Date.now()/1000);
  db.prepare("INSERT INTO audit_runs (id,project_id,status,started_at) VALUES (?,?,'running',?)").bind(runId,input.projectId,started).run();
  try{
    const result=await runSiteAudit(input.siteUrl,input.pageLimit);if(signal?.aborted)throw signal.reason;const now=Math.floor(Date.now()/1000);
    const statements=[
      db.prepare(`UPDATE audit_runs SET status='completed',score=?,pages_scanned=?,urls_discovered=?,checks_total=?,checks_passed=?,checks_warning=?,checks_failed=?,checks_unknown=?,checks_skipped=?,completed_at=? WHERE id=?`).bind(result.score,result.pages.length,result.urlsDiscovered,result.summary.total,result.summary.passed,result.summary.warning,result.summary.failed,result.summary.unknown,result.summary.skipped,now,runId),
      db.prepare("UPDATE findings SET status='resolved' WHERE project_id=? AND status='open'").bind(input.projectId),
      db.prepare("UPDATE seo_tasks SET status='dismissed',updated_at=? WHERE project_id=? AND status='proposed'").bind(now,input.projectId),
    ];
    for(const page of result.pages)statements.push(db.prepare(`INSERT INTO audit_pages (id,run_id,url,status_code,title,description,canonical,h1_count,images_without_alt) VALUES (?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),runId,page.url,page.statusCode,page.title,page.description,page.canonical,page.h1Count,page.imagesWithoutAlt));
    for(const finding of result.findings){const findingId=crypto.randomUUID(),priority={critical:100,high:80,medium:50,low:20}[finding.severity];statements.push(db.prepare(`INSERT INTO findings (id,run_id,project_id,category,severity,title,description,evidence,url,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(findingId,runId,input.projectId,finding.category,finding.severity,finding.title,finding.description,finding.evidence||null,finding.url,now));statements.push(db.prepare(`INSERT INTO seo_tasks (id,project_id,finding_id,type,title,description,priority,status,requires_approval,created_at,updated_at) VALUES (?,?,?,?,?,?,?,'proposed',1,?,?)`).bind(crypto.randomUUID(),input.projectId,findingId,"fix_"+finding.category,finding.title,finding.description,priority,now,now));}
    for(const item of result.checks)statements.push(db.prepare(`INSERT INTO audit_checks (id,run_id,project_id,category,check_key,status,severity,confidence,title,description,evidence,impact,recommendation,url,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),runId,input.projectId,item.category,item.key,item.status,item.severity,item.confidence,item.title,item.description,item.evidence||null,item.impact||null,item.recommendation||null,item.url||null,now));
    for(const category of result.categoryScores)statements.push(db.prepare(`INSERT INTO audit_category_scores (run_id,category,score,confidence,checks_total,checks_known) VALUES (?,?,?,?,?,?)`).bind(runId,category.category,category.score,category.confidence,category.checksTotal,category.checksKnown));
    statements.push(db.prepare("UPDATE projects SET updated_at=? WHERE id=?").bind(now,input.projectId));db.batch(statements);
    const reportData:AuditReportData={project,run:{id:runId,score:result.score,pagesScanned:result.pages.length,urlsDiscovered:result.urlsDiscovered,checksTotal:result.summary.total,checksPassed:result.summary.passed,checksWarning:result.summary.warning,checksFailed:result.summary.failed,checksUnknown:result.summary.unknown,checksSkipped:result.summary.skipped,completedAt:now},checks:result.checks,scores:result.categoryScores,pages:result.pages};
    return{runId,score:result.score,pagesScanned:result.pages.length,urlsDiscovered:result.urlsDiscovered,findingCount:result.findings.length,report:new TextEncoder().encode(auditReportMarkdown(reportData)),reportTitle:`${project.name} SEO 审计报告`};
  }catch(error){db.prepare("UPDATE audit_runs SET status='failed',error=?,completed_at=? WHERE id=?").bind(error instanceof Error?error.message:"AUDIT_FAILED",Math.floor(Date.now()/1000),runId).run();throw error;}
}
