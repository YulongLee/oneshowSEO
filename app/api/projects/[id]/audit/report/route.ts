import { NextResponse } from "next/server";
import { getCurrentUser, getDatabase, writeAudit } from "../../../../../../lib/auth";
import { ensureProductSchema, ownedProject } from "../../../../../../lib/product";
import { auditReportHtml, auditReportMarkdown, type AuditReportData } from "../../../../../../lib/audit-report";
import { can, permissions, type OrganizationRoleKey } from "../../../../../../platform/modules/identity/authorization";

export async function GET(request:Request,context:{params:Promise<{id:string}>}){
 const user=await getCurrentUser();if(!user)return NextResponse.json({error:"请先登录"},{status:401});
 if(!can(user.organization.roleKey as OrganizationRoleKey,permissions.reportsExport))return NextResponse.json({error:"没有导出报告的权限"},{status:403});
 const {id}=await context.params;const project=await ownedProject(user.organization.organizationId,id);if(!project)return NextResponse.json({error:"项目不存在"},{status:404});
 await ensureProductSchema();const db=getDatabase();
 const run=db.prepare(`SELECT id,score,pages_scanned AS pagesScanned,urls_discovered AS urlsDiscovered,checks_total AS checksTotal,checks_passed AS checksPassed,checks_warning AS checksWarning,checks_failed AS checksFailed,checks_unknown AS checksUnknown,checks_skipped AS checksSkipped,completed_at AS completedAt FROM audit_runs WHERE project_id=? AND status='completed' ORDER BY started_at DESC LIMIT 1`).bind(id).first<{id:string}>();
 if(!run)return NextResponse.json({error:"尚无可导出的诊断报告"},{status:404});
 const checks=db.prepare(`SELECT category,status,severity,confidence,title,description,evidence,impact,recommendation,url FROM audit_checks WHERE run_id=? ORDER BY CASE status WHEN 'fail' THEN 1 WHEN 'warning' THEN 2 WHEN 'unknown' THEN 3 WHEN 'skipped' THEN 4 ELSE 5 END,category,title`).bind(run.id).all().results;
 const scores=db.prepare(`SELECT category,score,confidence,checks_total AS checksTotal,checks_known AS checksKnown FROM audit_category_scores WHERE run_id=? ORDER BY category`).bind(run.id).all().results;
 const pages=db.prepare(`SELECT url,status_code AS statusCode,title,h1_count AS h1Count,images_without_alt AS imagesWithoutAlt FROM audit_pages WHERE run_id=? ORDER BY url`).bind(run.id).all().results;
 const data={project,run,checks,scores,pages} as unknown as AuditReportData;const format=new URL(request.url).searchParams.get("format")==="markdown"?"markdown":"html";
 await writeAudit("audit_report_exported",user.id,request,JSON.stringify({projectId:id,runId:run.id,format}));
 const body=format==="markdown"?auditReportMarkdown(data):auditReportHtml(data);const extension=format==="markdown"?"md":"html";
 return new NextResponse(body,{headers:{"content-type":format==="markdown"?"text/markdown; charset=utf-8":"text/html; charset=utf-8","content-disposition":`attachment; filename="${project.host}-seo-audit.${extension}"`,"cache-control":"private, no-store"}});
}
