import type { JobId, ProjectId, TaskId } from "../../core/ids";
import type { RequestContext } from "../../core/contracts";

export type TaskState = "queued"|"running"|"retrying"|"waiting_approval"|"completed"|"failed"|"cancelled"|"quarantined";
export type JobState = "queued"|"running"|"retrying"|"completed"|"failed"|"cancelled"|"quarantined";
export type AttemptState = "running"|"succeeded"|"failed"|"cancelled"|"timed_out";
export type CreateTaskCommand = { projectId: ProjectId; type: string; idempotencyKey: string; input: Record<string,unknown> };
export type PlatformTask = { id: TaskId; jobId?: JobId; state: TaskState; progress: number; correlationId: string };
export interface ExecutionService { create(context: RequestContext, command: CreateTaskCommand): Promise<PlatformTask>; cancel(context: RequestContext, taskId: TaskId): Promise<PlatformTask>; }

export type ExecutionTask={id:string;organizationId:string;projectId:string;requestedByAccountId:string|null;triggerType:"manual"|"scheduled"|"api"|"mcp"|"approval"|"agent"|"system";taskType:string;capability:string;state:TaskState;progress:number;cancellable:boolean;input:Record<string,unknown>;locale:"zh-CN"|"en";idempotencyKey:string;correlationId:string;version:number;createdAt:number;updatedAt:number;startedAt:number|null;completedAt:number|null};
export type ExecutionJob={id:string;organizationId:string;projectId:string;taskId:string;queue:string;jobType:string;state:JobState;priority:number;availableAt:number;maxAttempts:number;timeoutSeconds:number;attemptCount:number;idempotencyKey:string;correlationId:string;createdAt:number;updatedAt:number;completedAt:number|null};
export type JobAttempt={id:string;organizationId:string;jobId:string;taskId:string;attemptNumber:number;workerId:string;state:AttemptState;startedAt:number;finishedAt:number|null;errorCode:string|null;errorMessage:string|null;retryAt:number|null;correlationId:string};
export type JobLease={id:string;organizationId:string;jobId:string;attemptId:string;workerId:string;tokenHash:string;state:"active"|"released"|"expired";acquiredAt:number;heartbeatAt:number;expiresAt:number;releasedAt:number|null;version:number};
export type TaskProgressEvent={id:string;organizationId:string;projectId:string;taskId:string;attemptId:string|null;sequence:number;progress:number;stage:string;messageKey:string|null;metadata:Record<string,unknown>;correlationId:string;createdAt:number};
export type CancellationRequest={id:string;organizationId:string;projectId:string;taskId:string;requestedByAccountId:string|null;state:"requested"|"acknowledged"|"completed"|"rejected";reason:string;idempotencyKey:string;correlationId:string;requestedAt:number;acknowledgedAt:number|null;completedAt:number|null};
export type ExecutionIdempotencyRecord={id:string;organizationId:string;scope:string;idempotencyKey:string;requestHash:string;resourceType:string;resourceId:string;responseStatus:number|null;response:Record<string,unknown>|null;expiresAt:number|null;createdAt:number;updatedAt:number};
export type OutboxMessage={id:string;organizationId:string|null;projectId:string|null;aggregateType:string;aggregateId:string;eventType:string;payload:Record<string,unknown>;state:"pending"|"published"|"failed";attempts:number;availableAt:number;publishedAt:number|null;lastError:string|null;idempotencyKey:string;correlationId:string;createdAt:number};
export type InboxMessage={id:string;organizationId:string|null;source:string;messageId:string;messageType:string;payloadHash:string;payload:Record<string,unknown>;state:"received"|"processed"|"failed";receivedAt:number;processedAt:number|null;lastError:string|null;correlationId:string};
export type ArtifactRecord={id:string;organizationId:string;projectId:string;taskId:string;attemptId:string|null;kind:string;objectKey:string;sha256:string;mimeType:string;sizeBytes:number;scanState:"pending"|"clean"|"blocked"|"failed";retentionClass:string;expiresAt:number|null;provenance:Record<string,unknown>;idempotencyKey:string;createdAt:number};
export type NotificationRecord={id:string;organizationId:string;accountId:string;projectId:string|null;taskId:string|null;channel:"in_app"|"email";notificationType:string;locale:"zh-CN"|"en";titleKey:string;bodyKey:string;arguments:Record<string,unknown>;state:"pending"|"sent"|"failed"|"read"|"cancelled";idempotencyKey:string;availableAt:number;sentAt:number|null;readAt:number|null;lastError:string|null;createdAt:number;updatedAt:number};
export type ExecutionAuditEvent={id:string;organizationId:string|null;projectId:string|null;actorType:"user"|"api"|"mcp"|"agent"|"worker"|"system"|"support";actorId:string|null;action:string;targetType:string;targetId:string|null;outcome:"success"|"denied"|"failed"|"pending";reason:string|null;policyVersion:string|null;correlationId:string;metadata:Record<string,unknown>;occurredAt:number};

export interface ExecutionRepository{
  ensureSchema():void;transaction<T>(operation:()=>T):T;
  createTask(task:ExecutionTask):void;task(organizationId:string,taskId:string):ExecutionTask|null;taskByIdempotency(organizationId:string,key:string):ExecutionTask|null;
  createJob(job:ExecutionJob):void;job(organizationId:string,jobId:string):ExecutionJob|null;
  appendAttempt(attempt:JobAttempt):void;attempts(organizationId:string,jobId:string):JobAttempt[];
  putLease(lease:JobLease):void;lease(organizationId:string,jobId:string):JobLease|null;
  appendProgress(event:TaskProgressEvent):void;progress(organizationId:string,taskId:string,limit:number):TaskProgressEvent[];
  requestCancellation(request:CancellationRequest):void;cancellation(organizationId:string,taskId:string):CancellationRequest|null;
  putIdempotency(record:ExecutionIdempotencyRecord):void;idempotency(organizationId:string,scope:string,key:string):ExecutionIdempotencyRecord|null;
  appendOutbox(message:OutboxMessage):void;pendingOutbox(limit:number,now:number):OutboxMessage[];
  recordInbox(message:InboxMessage):boolean;inbox(source:string,messageId:string):InboxMessage|null;
  appendArtifact(artifact:ArtifactRecord):void;artifact(organizationId:string,artifactId:string):ArtifactRecord|null;
  appendNotification(notification:NotificationRecord):void;notifications(organizationId:string,accountId:string,limit:number):NotificationRecord[];
  appendAudit(event:ExecutionAuditEvent):void;auditEvents(organizationId:string,limit:number):ExecutionAuditEvent[];
}
