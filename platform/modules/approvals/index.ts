import type { ApprovalId, TaskId } from "../../core/ids";
import type { RequestContext } from "../../core/contracts";

export type ApprovalDecision = "approve"|"reject"|"request_changes"|"defer";
export interface ApprovalService { decide(context: RequestContext, approvalId: ApprovalId, decision: ApprovalDecision, reason: string, expectedVersion: number): Promise<{taskId:TaskId;version:number}>; }
