import type { JobId, ProjectId, TaskId } from "../../core/ids";
import type { RequestContext } from "../../core/contracts";

export type TaskState = "queued"|"running"|"retrying"|"waiting_approval"|"completed"|"failed"|"cancelled"|"quarantined";
export type CreateTaskCommand = { projectId: ProjectId; type: string; idempotencyKey: string; input: Record<string,unknown> };
export type PlatformTask = { id: TaskId; jobId?: JobId; state: TaskState; progress: number; correlationId: string };
export interface ExecutionService { create(context: RequestContext, command: CreateTaskCommand): Promise<PlatformTask>; cancel(context: RequestContext, taskId: TaskId): Promise<PlatformTask>; }
