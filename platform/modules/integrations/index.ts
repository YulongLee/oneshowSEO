import type { RequestContext } from "../../core/contracts";
import type { IntegrationId, ProjectId } from "../../core/ids";

export type ConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "syncing"
  | "degraded"
  | "expired"
  | "permission_required"
  | "rate_limited"
  | "error";
export type ProviderAuthMethod = "oauth2" | "api_key";
export type ProviderCategory = "search" | "analytics" | "ranking" | "cms" | "notification";
export type ProviderCapability = "search.read" | "analytics.read" | "rank.read" | "content.read" | "content.publish" | "notification.send";

export type ProviderDefinition = {
  id: string;
  category: ProviderCategory;
  names: Readonly<{ "zh-CN": string; en: string }>;
  authMethods: readonly ProviderAuthMethod[];
  capabilities: readonly ProviderCapability[];
  availableScopes: readonly string[];
  minimumScopes: readonly string[];
  supportsIncrementalSync: boolean;
  supportsConnectionDeletion: boolean;
};

function freezeDefinition(value: ProviderDefinition): ProviderDefinition {
  return Object.freeze({
    ...value,
    names: Object.freeze({ ...value.names }),
    authMethods: Object.freeze([...value.authMethods]),
    capabilities: Object.freeze([...value.capabilities]),
    availableScopes: Object.freeze([...value.availableScopes]),
    minimumScopes: Object.freeze([...value.minimumScopes]),
  });
}

const definitions = [
  { id: "google-search-console", category: "search", names: { "zh-CN": "Google Search Console", en: "Google Search Console" }, authMethods: ["oauth2"], capabilities: ["search.read"], availableScopes: ["webmasters.readonly"], minimumScopes: ["webmasters.readonly"], supportsIncrementalSync: true, supportsConnectionDeletion: true },
  { id: "google-analytics-4", category: "analytics", names: { "zh-CN": "Google Analytics 4", en: "Google Analytics 4" }, authMethods: ["oauth2"], capabilities: ["analytics.read"], availableScopes: ["analytics.readonly"], minimumScopes: ["analytics.readonly"], supportsIncrementalSync: true, supportsConnectionDeletion: true },
  { id: "bing-webmaster", category: "search", names: { "zh-CN": "Bing 网站管理员", en: "Bing Webmaster" }, authMethods: ["oauth2", "api_key"], capabilities: ["search.read"], availableScopes: ["sites.read"], minimumScopes: ["sites.read"], supportsIncrementalSync: true, supportsConnectionDeletion: true },
  { id: "baidu-search-resource", category: "search", names: { "zh-CN": "百度搜索资源平台", en: "Baidu Search Resource Platform" }, authMethods: ["api_key"], capabilities: ["search.read"], availableScopes: ["sites.read"], minimumScopes: ["sites.read"], supportsIncrementalSync: true, supportsConnectionDeletion: true },
  { id: "dataforseo", category: "ranking", names: { "zh-CN": "DataForSEO", en: "DataForSEO" }, authMethods: ["api_key"], capabilities: ["rank.read"], availableScopes: ["serp.read"], minimumScopes: ["serp.read"], supportsIncrementalSync: false, supportsConnectionDeletion: true },
  { id: "wordpress", category: "cms", names: { "zh-CN": "WordPress", en: "WordPress" }, authMethods: ["oauth2", "api_key"], capabilities: ["content.read", "content.publish"], availableScopes: ["content.read", "content.write"], minimumScopes: ["content.read"], supportsIncrementalSync: true, supportsConnectionDeletion: true },
  { id: "webflow", category: "cms", names: { "zh-CN": "Webflow", en: "Webflow" }, authMethods: ["oauth2", "api_key"], capabilities: ["content.read", "content.publish"], availableScopes: ["cms.read", "cms.write"], minimumScopes: ["cms.read"], supportsIncrementalSync: true, supportsConnectionDeletion: true },
  { id: "smtp-email", category: "notification", names: { "zh-CN": "邮件通知", en: "Email Notifications" }, authMethods: ["api_key"], capabilities: ["notification.send"], availableScopes: ["email.send"], minimumScopes: ["email.send"], supportsIncrementalSync: false, supportsConnectionDeletion: true },
] satisfies ProviderDefinition[];

export const providerCatalog: ReadonlyMap<string, ProviderDefinition> = new Map(
  definitions.map((definition) => {
    const frozen = freezeDefinition(definition);
    return [frozen.id, frozen];
  }),
);

export type ProviderRateLimit = {
  limit: number | null;
  remaining: number | null;
  resetsAt: number | null;
  retryAfterSeconds: number | null;
};
export type ProviderHealth = {
  state: "healthy" | "degraded" | "expired" | "permission_required" | "rate_limited" | "error";
  checkedAt: number;
  latencyMs: number | null;
  error: NormalizedProviderError | null;
  rateLimit: ProviderRateLimit;
};
export type ProviderSyncCursor = { value: string; capturedAt: number; expiresAt: number | null };
export type ProviderErrorClass = "authentication" | "permission" | "rate_limit" | "validation" | "timeout" | "network" | "provider" | "internal";
export type NormalizedProviderError = {
  code: string;
  category: ProviderErrorClass;
  retryable: boolean;
  retryAfterSeconds: number | null;
  messageKey: string;
  remediation: "reauthorize" | "change_scope" | "retry" | "reconfigure" | "contact_support" | "none";
  correlationId: string;
};

export type ProviderOperationContext = {
  organizationId: string;
  projectId: string;
  connectionId: string;
  credentialHandle: string;
  grantedScopes: readonly string[];
  correlationId: string;
  deadlineAt: number;
  metadata?: Readonly<Record<string, string>>;
};
export type OAuthAuthorizationRequest = {
  organizationId: string;
  projectId: string;
  redirectUri: string;
  scopes: readonly string[];
  stateHandle: string;
};
export type OAuthAuthorizationResult = { authorizationUrl: string; stateHandle: string; expiresAt: number };
export type OAuthExchangeRequest = OAuthAuthorizationRequest & { code: string };
export type CredentialCandidate = { authMethod: ProviderAuthMethod; secretHandle: string; scopes: readonly string[] };
export type ProviderSyncRequest = { cursor: ProviderSyncCursor | null; limit: number };
export type ProviderSyncResult<T = unknown> = {
  records: readonly T[];
  nextCursor: ProviderSyncCursor | null;
  hasMore: boolean;
  health: ProviderHealth;
};
export type ProviderDisconnectResult = { disconnectedAt: number; remoteAuthorizationRevoked: boolean };
export type ProviderDeletionResult = { deletedAt: number; remoteDataDeleted: boolean; deletionReference: string | null };

export interface ProviderAdapter<T = unknown> {
  readonly definition: ProviderDefinition;
  createOAuthAuthorization?(input: OAuthAuthorizationRequest): Promise<OAuthAuthorizationResult>;
  exchangeOAuthCode?(input: OAuthExchangeRequest): Promise<CredentialCandidate>;
  validateApiKey?(input: CredentialCandidate): Promise<{ grantedScopes: readonly string[]; maskedIdentity: string | null }>;
  checkHealth(context: ProviderOperationContext): Promise<ProviderHealth>;
  sync(context: ProviderOperationContext, input: ProviderSyncRequest): Promise<ProviderSyncResult<T>>;
  disconnect(context: ProviderOperationContext): Promise<ProviderDisconnectResult>;
  deleteConnectionData(context: ProviderOperationContext): Promise<ProviderDeletionResult>;
}

export interface IntegrationService {
  assertUsable(context: RequestContext, projectId: ProjectId, connectionId: IntegrationId, scopes: readonly string[]): Promise<void>;
}

export function providerDefinition(providerId: string): ProviderDefinition | null {
  return providerCatalog.get(providerId) ?? null;
}

export function validateProviderScopes(definition: ProviderDefinition, requested: readonly string[]): readonly string[] {
  const unique = [...new Set(requested)];
  if (unique.length === 0 || unique.some((scope) => !definition.availableScopes.includes(scope))) throw new Error("PROVIDER_SCOPE_INVALID");
  if (definition.minimumScopes.some((scope) => !unique.includes(scope))) throw new Error("PROVIDER_MINIMUM_SCOPE_MISSING");
  return Object.freeze(unique);
}
