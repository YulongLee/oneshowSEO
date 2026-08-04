import type { ApiClientId, ProjectId } from "../../core/ids";
import type { RequestContext } from "../../core/contracts";

export type DeveloperCredential = { id: ApiClientId; projectIds: readonly ProjectId[]; scopes: readonly string[]; expiresAt?: number; status: "active"|"revoked" };
export interface DeveloperPlatform { authorize(context: RequestContext, credentialId: ApiClientId, scope: string, projectId?: ProjectId): Promise<void>; }
