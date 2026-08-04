import { NextResponse } from "next/server";
import { getCurrentUser, getDatabase, writeAudit } from "../../../../../lib/auth";
import { ensureProductSchema, ownedProject, pageLimit } from "../../../../../lib/product";
import { runSiteAudit } from "../../../../../lib/site-audit";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const { id } = await context.params; const project = await ownedProject(user.id, id);
  if (!project) return NextResponse.json({ error: "项目不存在" }, { status: 404 });
  await ensureProductSchema(); const db = getDatabase(); const runId = crypto.randomUUID(); const started = Math.floor(Date.now()/1000);
  db.prepare("INSERT INTO audit_runs (id,project_id,status,started_at) VALUES (?,?, 'running',?)").bind(runId,id,started).run();
  try {
    const result = await runSiteAudit(project.siteUrl, pageLimit(user)); const now = Math.floor(Date.now()/1000);
    const statements = [
      db.prepare(`UPDATE audit_runs SET status='completed',score=?,pages_scanned=?,urls_discovered=?,checks_total=?,checks_passed=?,checks_warning=?,checks_failed=?,checks_unknown=?,checks_skipped=?,completed_at=? WHERE id=?`).bind(
        result.score,result.pages.length,result.urlsDiscovered,result.summary.total,result.summary.passed,result.summary.warning,result.summary.failed,result.summary.unknown,result.summary.skipped,now,runId
      ),
      db.prepare("UPDATE findings SET status='resolved' WHERE project_id=? AND status='open'").bind(id),
      db.prepare("UPDATE seo_tasks SET status='dismissed',updated_at=? WHERE project_id=? AND status='proposed'").bind(now,id),
    ];
    for (const page of result.pages) statements.push(db.prepare(`INSERT INTO audit_pages (id,run_id,url,status_code,title,description,canonical,h1_count,images_without_alt) VALUES (?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),runId,page.url,page.statusCode,page.title,page.description,page.canonical,page.h1Count,page.imagesWithoutAlt));
    for (const finding of result.findings) {
      const findingId=crypto.randomUUID(); const priority={critical:100,high:80,medium:50,low:20}[finding.severity];
      statements.push(db.prepare(`INSERT INTO findings (id,run_id,project_id,category,severity,title,description,evidence,url,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(findingId,runId,id,finding.category,finding.severity,finding.title,finding.description,finding.evidence||null,finding.url,now));
      statements.push(db.prepare(`INSERT INTO seo_tasks (id,project_id,finding_id,type,title,description,priority,status,requires_approval,created_at,updated_at) VALUES (?,?,?,?,?,?,?,'proposed',1,?,?)`).bind(crypto.randomUUID(),id,findingId,"fix_"+finding.category,finding.title,finding.description,priority,now,now));
    }
    for (const item of result.checks) statements.push(db.prepare(`INSERT INTO audit_checks (id,run_id,project_id,category,check_key,status,severity,confidence,title,description,evidence,impact,recommendation,url,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
      crypto.randomUUID(),runId,id,item.category,item.key,item.status,item.severity,item.confidence,item.title,item.description,item.evidence||null,item.impact||null,item.recommendation||null,item.url||null,now
    ));
    for (const category of result.categoryScores) statements.push(db.prepare(`INSERT INTO audit_category_scores (run_id,category,score,confidence,checks_total,checks_known) VALUES (?,?,?,?,?,?)`).bind(
      runId,category.category,category.score,category.confidence,category.checksTotal,category.checksKnown
    ));
    statements.push(db.prepare("INSERT INTO usage_events (id,user_id,project_id,metric,quantity,created_at) VALUES (?,?,?,?,?,?)").bind(crypto.randomUUID(),user.id,id,"pages_crawled",result.pages.length,now));
    statements.push(db.prepare("UPDATE projects SET updated_at=? WHERE id=?").bind(now,id));
    await db.batch(statements); await writeAudit("site_audit_completed",user.id,request,JSON.stringify({projectId:id,runId,pages:result.pages.length,score:result.score}));
    return NextResponse.json({ runId, score:result.score, pagesScanned:result.pages.length, urlsDiscovered:result.urlsDiscovered, findingCount:result.findings.length, checks:result.summary });
  } catch (error) {
    db.prepare("UPDATE audit_runs SET status='failed',error=?,completed_at=? WHERE id=?").bind(error instanceof Error ? error.message : "AUDIT_FAILED",Math.floor(Date.now()/1000),runId).run();
    return NextResponse.json({ error:"诊断执行失败，请稍后重试" },{status:502});
  }
}
