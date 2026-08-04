import type { ProjectId } from "../../core/ids";
import type { Locale, RequestContext } from "../../core/contracts";

export type AgentManifest = { key: string; version: string; name: Record<Locale,string>; capabilities: readonly string[]; requiredEntitlements: readonly string[]; requiredIntegrations: readonly string[] };
export interface AgentControlPlane {
  manifest(context: RequestContext, key: string, version?: string): Promise<AgentManifest | null>;
  assertEnabled(context: RequestContext, projectId: ProjectId, key: string, capability: string): Promise<void>;
}
