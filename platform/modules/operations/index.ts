import type { RequestContext } from "../../core/contracts";
export * from "./administration";

export type AuditEvent = { action: string; targetType: string; targetId?: string; outcome: "success"|"failure"; reason?: string; detail?: Record<string,unknown> };
export interface OperationsService { audit(context: RequestContext, event: AuditEvent): Promise<void>; isEnabled(context: RequestContext, capability: string): Promise<boolean>; }
