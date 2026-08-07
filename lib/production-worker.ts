import os from "node:os";
import { getDatabase } from "./auth";
import { artifactObjectService, atomicTaskSettlementService, executionWorkerSupervisor } from "./execution";
import { commerceService, ensureBillingSchema } from "./billing";
import { executeSiteAudit, type AuditExecutionInput, type AuditExecutionResult } from "./audit-execution";
import { can, permissions } from "../platform/modules/identity/authorization";
import { WorkerJobError, type WorkerHandler, type WorkerHandlers, type WorkerTerminalState } from "../platform/modules/execution/worker";
import type { ArtifactRecord, ExecutionTask, NotificationRecord } from "../platform/modules/execution";
import type { CommercialSubject } from "../platform/modules/commerce";

type WorkerAccount={accountId:string;organizationId:string;organizationStatus:CommercialSubject["organizationStatus"];planKey:CommercialSubject["planKey"];trialEndsAt:number|null;accountCreatedAt:number;accountStatus:string;membershipStatus:string;roleKey:string;projectStatus:string};
type AuditWorkerResult=AuditExecutionResult&{artifact:ArtifactRecord;subject:CommercialSubject};

function account(task:ExecutionTask):WorkerAccount{
  const row=getDatabase().prepare(`SELECT u.id AS accountId,u.plan AS planKey,u.trial_ends_at AS trialEndsAt,u.created_at AS accountCreatedAt,u.status AS accountStatus,
    o.id AS organizationId,o.status AS organizationStatus,m.status AS membershipStatus,r.role_key AS roleKey,p.status AS projectStatus
    FROM users u JOIN identity_memberships m ON m.user_id=u.id AND m.organization_id=? JOIN identity_roles r ON r.id=m.role_id
    JOIN identity_organizations o ON o.id=m.organization_id JOIN projects p ON p.id=? AND p.organization_id=o.id WHERE u.id=? LIMIT 1`)
    .bind(task.organizationId,task.projectId,task.requestedByAccountId).first<WorkerAccount>();
  if(!row)throw new WorkerJobError("EXECUTION_SUBJECT_NOT_FOUND","Task owner is no longer available",false);return row;
}
function subject(row:WorkerAccount):CommercialSubject{return{accountId:row.accountId,organizationId:row.organizationId,organizationStatus:row.organizationStatus,planKey:row.planKey,trialEndsAt:row.trialEndsAt,accountCreatedAt:row.accountCreatedAt};}
function authorizeAudit(task:ExecutionTask){const row=account(task);if(row.accountStatus!=="active"||row.membershipStatus!=="active"||row.projectStatus!=="active"||!can(row.roleKey as Parameters<typeof can>[0],permissions.auditsRun))throw new WorkerJobError("EXECUTION_NOT_AUTHORIZED","Audit authorization is no longer valid",false);commerceService().authorizeAccess(subject(row));return row;}
function reservationId(task:ExecutionTask){return getDatabase().prepare("SELECT id FROM commerce_credit_ledger WHERE organization_id=? AND task_id=? AND entry_type='reservation' ORDER BY created_at LIMIT 1").bind(task.organizationId,task.id).first<{id:string}>()?.id??null;}
function notification(task:ExecutionTask,state:WorkerTerminalState,now:number):NotificationRecord[]{if(!task.requestedByAccountId)return[];return[{id:crypto.randomUUID(),organizationId:task.organizationId,accountId:task.requestedByAccountId,projectId:task.projectId,taskId:task.id,channel:"in_app",notificationType:"execution_terminal",locale:task.locale,titleKey:state==="completed"?"notification.audit.completed":"notification.audit.failed",bodyKey:state==="completed"?"notification.audit.report_ready":"notification.audit.not_completed",arguments:{taskId:task.id,state},state:"pending",idempotencyKey:`audit-terminal:${task.id}:${state}`,availableAt:now,sentAt:null,readAt:null,lastError:null,createdAt:now,updatedAt:now}];}

export function auditWorkerHandler(dependencies:{executeAudit?:typeof executeSiteAudit}={}):WorkerHandler{const executeAudit=dependencies.executeAudit??executeSiteAudit;return{
  authorize:async({task})=>{await ensureBillingSchema();authorizeAudit(task);},
  execute:async(input,context)=>{
    const row=authorizeAudit(context.task),commercial=commerceService(),effective=commercial.resolve(subject(row)),auditInput=input as unknown as AuditExecutionInput;
    if(auditInput.projectId!==context.task.projectId||typeof auditInput.siteUrl!=="string"||!Number.isInteger(auditInput.pageLimit))throw new WorkerJobError("AUDIT_INPUT_INVALID","Audit task input is invalid",false);
    const result=await executeAudit(auditInput,context.signal),usageKey=`audit:${context.task.id}:pages_crawled`;
    commercial.ingestUsage(subject(row),{metric:"pages_crawled",quantity:result.pagesScanned,state:"pending",idempotencyKey:usageKey,projectId:context.task.projectId,taskId:context.task.id});commercial.finalizeUsage(subject(row),usageKey);
    const artifact=await (await artifactObjectService()).store({organizationId:context.task.organizationId,projectId:context.task.projectId,taskId:context.task.id,attemptId:context.attemptId,artifactId:`audit-report-${context.task.id}`,kind:"seo_audit_report",filename:`audit-report-${context.task.id}.md`,mimeType:"text/markdown",body:result.report,provenance:{title:result.reportTitle,runId:result.runId,score:result.score,pagesScanned:result.pagesScanned,worker:"production"},idempotencyKey:`audit-report-${context.task.id}`,correlationId:`audit-${context.task.id}`,storageLimitBytes:effective.limits.storageBytes,retentionDays:effective.limits.retentionDays});
    return{...result,artifact,subject:subject(row)} satisfies AuditWorkerResult;
  },
  settle:async({state,result},context)=>{const now=Math.floor(Date.now()/1000),completed=result as AuditWorkerResult|null,row=completed?.subject??subject(account(context.task));await (await atomicTaskSettlementService()).settle({organizationId:context.task.organizationId,projectId:context.task.projectId,taskId:context.task.id,jobId:context.job.id,attemptId:context.attemptId,state,subject:row,reservationId:reservationId(context.task),artifacts:state==="completed"&&completed?[completed.artifact]:[],notifications:notification(context.task,state,now),externalEffects:[],idempotencyKey:`worker-settle:${context.task.id}`,correlationId:context.task.correlationId});}
};}

export async function createProductionWorker(){
  const workerId=(process.env.WORKER_ID||`${os.hostname()}:${process.pid}`).slice(0,128),handlers:WorkerHandlers={"seo.audit":auditWorkerHandler()};
  return executionWorkerSupervisor(handlers,{workerId,queue:"agents",concurrency:Number(process.env.WORKER_CONCURRENCY||2),pollIntervalMs:Number(process.env.WORKER_POLL_INTERVAL_MS||1000),leaseSeconds:Number(process.env.WORKER_LEASE_SECONDS||60),heartbeatIntervalMs:Number(process.env.WORKER_HEARTBEAT_INTERVAL_MS||15000),shutdownGraceMs:Number(process.env.WORKER_SHUTDOWN_GRACE_MS||30000),maintenanceLimit:100,baseBackoffSeconds:5,maxBackoffSeconds:300},{onError:error=>console.error("Worker execution error",error instanceof Error?{name:error.name,message:error.message}:String(error))});
}

export function startWorkerHeartbeat(workerId:string){const db=getDatabase(),write=()=>{const now=Math.floor(Date.now()/1000);db.exec("CREATE TABLE IF NOT EXISTS execution_worker_heartbeats(worker_id TEXT PRIMARY KEY,queue TEXT NOT NULL,process_id INTEGER NOT NULL,hostname TEXT NOT NULL,started_at INTEGER NOT NULL,last_seen_at INTEGER NOT NULL)");db.prepare("INSERT INTO execution_worker_heartbeats(worker_id,queue,process_id,hostname,started_at,last_seen_at) VALUES (?,?,?,?,?,?) ON CONFLICT(worker_id) DO UPDATE SET process_id=excluded.process_id,hostname=excluded.hostname,last_seen_at=excluded.last_seen_at").bind(workerId,"agents",process.pid,os.hostname(),now,now).run();};write();const timer=setInterval(write,15000);return()=>{clearInterval(timer);db.prepare("DELETE FROM execution_worker_heartbeats WHERE worker_id=?").bind(workerId).run();};}
