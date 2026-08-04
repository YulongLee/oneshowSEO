import type { IntegrationId, ProjectId } from "../../core/ids";
import type { RequestContext } from "../../core/contracts";

export type ConnectionState = "disconnected"|"connecting"|"connected"|"syncing"|"degraded"|"expired"|"permission_required"|"error";
export interface IntegrationService { assertUsable(context: RequestContext, projectId: ProjectId, connectionId: IntegrationId, scopes: readonly string[]): Promise<void>; }
