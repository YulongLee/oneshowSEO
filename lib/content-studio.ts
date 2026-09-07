import { getDatabase } from "./auth";
import { artifactObjectService } from "./execution";
import { modelRuntimeStatus } from "./model-providers";
import { ensureContentWorkflow,evaluateVersion,saveWorkflowVersion } from "./content-workflow";
import { ContentVersionError } from "./content-versions";

export async function contentStudioData(organizationId:string,projectId:string) {
 const db=getDatabase();ensureContentWorkflow(db);
 const runs=db.prepare(`SELECT cr.id,cr.execution_task_id AS taskId,cr.status,cr.title,cr.keyword,cr.content_type AS contentType,cr.audience,cr.intent,cr.tone,cr.goal,cr.source_ref AS sourceRef,cr.brief,cr.word_count AS wordCount,cr.quality_score AS qualityScore,cr.checks_passed AS checksPassed,cr.checks_total AS checksTotal,cr.review_status AS reviewStatus,cr.evidence_count AS evidenceCount,cr.generation_mode AS generationMode,cr.model_provider AS modelProvider,cr.model_name AS modelName,cr.started_at AS startedAt,cr.completed_at AS completedAt,cr.error,
 (SELECT a.id FROM execution_artifacts a WHERE a.organization_id=? AND a.project_id=cr.project_id AND a.task_id=cr.execution_task_id AND a.kind='content_draft' AND a.scan_state='clean' ORDER BY a.created_at DESC LIMIT 1) AS artifactId,
 cs.archived_at AS archivedAt FROM content_runs cr LEFT JOIN content_library_state cs ON cs.run_id=cr.id WHERE cr.project_id=? ORDER BY cr.started_at DESC,cr.id DESC LIMIT 200`)
 .bind(organizationId,projectId).all<Record<string,unknown>&{id:string;taskId:string;status:string;artifactId:string|null}>().results;
 const queued=db.prepare("SELECT id,state,input_json FROM execution_tasks WHERE organization_id=? AND project_id=? AND task_type='content_agent' AND state IN('queued','running','retrying') ORDER BY created_at DESC LIMIT 50").bind(organizationId,projectId).all<{id:string;state:string;input_json:string}>().results;
 for(const task of queued)if(!runs.some(r=>r.id===task.id)){const input=JSON.parse(task.input_json);runs.unshift({...input,id:task.id,taskId:task.id,status:task.state,artifactId:null,wordCount:0,qualityScore:0,checksPassed:0,checksTotal:0,reviewStatus:"draft",startedAt:0});}
 for(const run of runs){
   const existing=db.prepare("SELECT id FROM content_versions WHERE organization_id=? AND project_id=? AND run_id=?").bind(organizationId,projectId,run.id).all<{id:string}>().results;
   if(!existing.length&&run.status==='completed'&&run.artifactId){
     try{
       const objects=await artifactObjectService(),access=objects.authorizeAccess({activeOrganizationId:organizationId,organizationId,activeProjectId:projectId,artifactId:run.artifactId}),token=new URL(access.url,"https://oneshowseo.local").searchParams.get("token")!,resolved=await objects.resolveAccess(token);
       saveWorkflowVersion(db,{organizationId,projectId,runId:run.id,accountId:"generation",body:new TextDecoder().decode(resolved.body),expectedVersion:0});
     }catch(error){if(!(error instanceof ContentVersionError&&error.code==='CONTENT_VERSION_CONFLICT'))run.versionError="原始产物暂不可用，请检查存储或重新生成";}
   }else for(const version of existing)evaluateVersion(db,organizationId,projectId,version.id);
 }
 const versions=db.prepare(`SELECT v.id,v.run_id AS runId,v.version_number AS versionNumber,v.body,v.word_count AS wordCount,v.created_at AS createdAt,
 w.body_hash AS bodyHash,w.quality_score AS qualityScore,w.checks_json AS checks,w.review_status AS reviewStatus,w.review_task_id AS reviewTaskId
 FROM content_versions v JOIN content_version_workflow w ON w.version_id=v.id WHERE v.organization_id=? AND v.project_id=?
 AND v.run_id IN(SELECT id FROM content_runs WHERE project_id=? ORDER BY started_at DESC,id DESC LIMIT 200)
 AND v.version_number >= (SELECT MAX(v2.version_number)-19 FROM content_versions v2 WHERE v2.run_id=v.run_id)
 ORDER BY v.version_number DESC`).bind(organizationId,projectId,projectId).all<Record<string,unknown>&{runId:string;id:string;checks:string;qualityScore:number;reviewStatus:string;wordCount:number;versionNumber:number}>().results.map(v=>({...v,checks:JSON.parse(v.checks)}));
 const enriched=runs.map(run=>{const v=versions.find(v=>v.runId===run.id);return{...run,...(v?{latestVersionId:v.id,wordCount:v.wordCount,qualityScore:v.qualityScore,reviewStatus:v.reviewStatus,checksPassed:v.checks.filter((c:{status:string})=>c.status==='pass').length,checksTotal:v.checks.length}:{} )};});
 return {runs:enriched,latestRun:enriched[0]||null,versions,checks:versions.find(v=>v.runId===enriched[0]?.id)?.checks||[],model:await modelRuntimeStatus()};
}
