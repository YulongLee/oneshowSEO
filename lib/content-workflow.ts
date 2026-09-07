import { createHash } from "node:crypto";
import type { AppDatabase } from "./database";
import { ensureContentVersionSchema, saveContentVersion, ContentVersionError } from "./content-versions";
import { checkContent } from "./content-quality";

export const bodyHash = (body: string) => createHash("sha256").update(body).digest("hex");
export function ensureContentWorkflow(db: AppDatabase) {
  ensureContentVersionSchema(db);
  db.exec(`CREATE TABLE IF NOT EXISTS content_version_workflow(
    version_id TEXT PRIMARY KEY REFERENCES content_versions(id),body_hash TEXT NOT NULL,
    checks_json TEXT NOT NULL,quality_score INTEGER NOT NULL,
    review_status TEXT NOT NULL DEFAULT 'draft' CHECK(review_status IN('draft','pending','approved','changes_requested')),
    review_task_id TEXT UNIQUE,reviewed_by TEXT,reviewed_at INTEGER,review_note TEXT);
    CREATE TABLE IF NOT EXISTS content_plan_runs(
    task_id TEXT PRIMARY KEY,organization_id TEXT NOT NULL,project_id TEXT NOT NULL,
    brief_id TEXT NOT NULL,plan_id TEXT NOT NULL,created_at INTEGER NOT NULL,
    UNIQUE(organization_id,project_id,plan_id));
    CREATE TABLE IF NOT EXISTS content_library_state(
    run_id TEXT PRIMARY KEY REFERENCES content_runs(id),archived_at INTEGER,updated_by TEXT);`);
}
export type WorkflowVersion = { id:string; runId:string; versionNumber:number; body:string; wordCount:number; createdAt:number; bodyHash:string; qualityScore:number; checks:string; reviewStatus:string; reviewTaskId:string|null };
export function workflowVersion(db:AppDatabase, organizationId:string, projectId:string, versionId:string) {
  return db.prepare(`SELECT v.id,v.run_id AS runId,v.version_number AS versionNumber,v.body,v.word_count AS wordCount,v.created_at AS createdAt,
    w.body_hash AS bodyHash,w.quality_score AS qualityScore,w.checks_json AS checks,w.review_status AS reviewStatus,w.review_task_id AS reviewTaskId
    FROM content_versions v JOIN content_version_workflow w ON w.version_id=v.id
    WHERE v.organization_id=? AND v.project_id=? AND v.id=?`).bind(organizationId,projectId,versionId).first<WorkflowVersion>();
}
export function evaluateVersion(db:AppDatabase, organizationId:string, projectId:string, versionId:string) {
  ensureContentWorkflow(db);
  const row=db.prepare(`SELECT v.body,cr.keyword,cr.source_ref AS sourceRef FROM content_versions v JOIN content_runs cr ON cr.id=v.run_id
    WHERE v.organization_id=? AND v.project_id=? AND v.id=?`).bind(organizationId,projectId,versionId).first<{body:string;keyword:string;sourceRef:string}>();
  if(!row)throw new ContentVersionError("CONTENT_VERSION_NOT_FOUND","内容版本不存在",404);
  const quality=checkContent(row.body,row.keyword,row.sourceRef);
  db.prepare(`INSERT INTO content_version_workflow(version_id,body_hash,checks_json,quality_score) VALUES(?,?,?,?) ON CONFLICT(version_id) DO NOTHING`)
    .bind(versionId,bodyHash(row.body),JSON.stringify(quality.checks),quality.score).run();
  return workflowVersion(db,organizationId,projectId,versionId)!;
}
export function syncContentPlan(db:AppDatabase, taskId:string, state:"generating"|"review"|"approved"|"published"|"failed") {
  ensureContentWorkflow(db);
  const link=db.prepare("SELECT brief_id AS briefId,plan_id AS planId FROM content_plan_runs WHERE task_id=?").bind(taskId).first<{briefId:string;planId:string}>();
  if(!link)return;
  const now=Math.floor(Date.now()/1000);
  db.prepare("UPDATE content_briefs SET status=?,updated_at=? WHERE id=?").bind(state==="generating"?"GENERATING":state==="approved"||state==="published"?"APPROVED":state==="failed"?"READY":"REVIEW",now,link.briefId).run();
  db.prepare("UPDATE content_plans SET status=?,updated_at=? WHERE id=?").bind(state==="published"?"PUBLISHED":state==="failed"?"FAILED":"IN_PROGRESS",now,link.planId).run();
}
export function saveWorkflowVersion(db:AppDatabase,input:Parameters<typeof saveContentVersion>[1]) {
  ensureContentWorkflow(db);
  return db.transaction(()=>{
    const version=saveContentVersion(db,input);evaluateVersion(db,input.organizationId,input.projectId,version.id);
    db.prepare("UPDATE content_runs SET review_status='pending',word_count=? WHERE id=? AND project_id=?").bind(version.wordCount,input.runId,input.projectId).run();
    syncContentPlan(db,input.runId,"review");
    return workflowVersion(db,input.organizationId,input.projectId,version.id)!;
  });
}
export function submitVersion(db:AppDatabase, input:{organizationId:string;projectId:string;versionId:string;accountId:string;factsConfirmed:boolean}) {
  ensureContentWorkflow(db);
  return db.transaction(()=>{
    const version=workflowVersion(db,input.organizationId,input.projectId,input.versionId);
    if(!version)throw new ContentVersionError("CONTENT_VERSION_NOT_FOUND","内容版本不存在",404);
    const latest=db.prepare("SELECT id FROM content_versions WHERE organization_id=? AND project_id=? AND run_id=? ORDER BY version_number DESC LIMIT 1").bind(input.organizationId,input.projectId,version.runId).first<{id:string}>();
    if(latest?.id!==version.id)throw new ContentVersionError("CONTENT_VERSION_STALE","请打开并提交最新版本",409);
    if(version.bodyHash!==bodyHash(version.body))throw new ContentVersionError("CONTENT_VERSION_CORRUPT","内容版本校验失败",409);
    if(version.qualityScore!==100||!input.factsConfirmed)throw new ContentVersionError("CONTENT_REVIEW_NOT_READY","请修正质量检查项并确认事实和引用已经核验",409);
    if(version.reviewStatus==="approved"||version.reviewStatus==="pending")return version;
    const run=db.prepare("SELECT title FROM content_runs WHERE id=? AND project_id=?").bind(version.runId,input.projectId).first<{title:string}>();
    const taskId=version.reviewTaskId||`content-version-review-${version.id}`,now=Math.floor(Date.now()/1000);
    db.prepare(`INSERT INTO seo_tasks(id,project_id,type,title,description,priority,status,requires_approval,created_at,updated_at)
      VALUES(?,?,'content_review_version',?,?,65,'proposed',1,?,?) ON CONFLICT(id) DO UPDATE SET status='proposed',updated_at=excluded.updated_at`)
      .bind(taskId,input.projectId,run?.title||"内容审核",`审核版本 ${version.versionNumber}；正文哈希 ${version.bodyHash}；提交人已确认事实与引用，发布仍需单独批准。`,now,now).run();
    db.prepare("UPDATE content_version_workflow SET review_status='pending',review_task_id=?,review_note=NULL WHERE version_id=?").bind(taskId,version.id).run();
    return workflowVersion(db,input.organizationId,input.projectId,version.id)!;
  });
}
export function decideContentVersion(db:AppDatabase,input:{organizationId:string;projectId:string;taskId:string;accountId:string;action:string;note:string}) {
  ensureContentWorkflow(db);
  const row=db.prepare(`SELECT v.id,v.run_id AS runId,v.body,w.body_hash AS hash,w.quality_score AS score,w.review_status AS status FROM content_version_workflow w
    JOIN content_versions v ON v.id=w.version_id WHERE w.review_task_id=? AND v.organization_id=? AND v.project_id=?`)
    .bind(input.taskId,input.organizationId,input.projectId).first<{id:string;runId:string;body:string;hash:string;score:number;status:string}>();
  if(!row)return false;
  if(row.status!=="pending"||row.hash!==bodyHash(row.body))throw new ContentVersionError("CONTENT_REVIEW_STALE","审核状态或内容已经变化",409);
  const latest=db.prepare("SELECT id FROM content_versions WHERE run_id=? ORDER BY version_number DESC LIMIT 1").bind(row.runId).first<{id:string}>();
  if(latest?.id!==row.id)throw new ContentVersionError("CONTENT_REVIEW_STALE","已有新版本，请重新打开内容提交审核",409);
  const approved=input.action==="approve";
  if(input.action==="schedule")throw new ContentVersionError("CONTENT_REVIEW_SCHEDULE_INVALID","内容审核请直接批准；发布时间在发布管理设置",400);
  if(approved&&row.score!==100)throw new ContentVersionError("CONTENT_QUALITY_REQUIRED","质量检查未通过",409);
  if(!approved&&!['reject','request_changes'].includes(input.action))return true;
  const now=Math.floor(Date.now()/1000),status=approved?"approved":"changes_requested";
  db.prepare("UPDATE content_version_workflow SET review_status=?,reviewed_by=?,reviewed_at=?,review_note=? WHERE version_id=?").bind(status,input.accountId,now,input.note,row.id).run();
  db.prepare("UPDATE content_runs SET review_status=? WHERE id=?").bind(approved?"approved":"pending",row.runId).run();
  syncContentPlan(db,row.runId,approved?"approved":"review");
  return true;
}
