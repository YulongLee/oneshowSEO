import type { OrganizationId, UserId } from "../../core/ids";
import type { RequestContext } from "../../core/contracts";

export type IdentityPrincipal = { userId: UserId; organizationId: OrganizationId; permissions: ReadonlySet<string> };
export interface IdentityService {
  principal(context: RequestContext): Promise<IdentityPrincipal | null>;
  authorize(context: RequestContext, permission: string): Promise<void>;
}
