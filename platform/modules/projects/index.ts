import type { OrganizationId, ProjectId } from "../../core/ids";
import type { RequestContext, VersionedRecord } from "../../core/contracts";

export type GovernedProject = VersionedRecord & { id: ProjectId; organizationId: OrganizationId; name: string; siteUrl: string; status: "active"|"archived"|"pending_deletion" };
export interface ProjectService {
  get(context: RequestContext, id: ProjectId): Promise<GovernedProject | null>;
  assertAccess(context: RequestContext, id: ProjectId, permission: string): Promise<void>;
}
export interface ExecutionProjectGate{assertActive(organizationId:string,projectId:string):void;}
