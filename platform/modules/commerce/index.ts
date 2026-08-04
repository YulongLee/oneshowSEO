import type { OrganizationId, TaskId } from "../../core/ids";
import type { RequestContext } from "../../core/contracts";

export type UsageReservation = { id: string; organizationId: OrganizationId; taskId: TaskId; units: number; state: "reserved"|"committed"|"released" };
export interface CommerceService {
  authorizeEntitlement(context: RequestContext, capability: string, quantity?: number): Promise<void>;
  reserve(context: RequestContext, taskId: TaskId, metric: string, quantity: number, idempotencyKey: string): Promise<UsageReservation>;
}
