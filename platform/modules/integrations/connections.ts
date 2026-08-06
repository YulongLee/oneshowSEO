import type { OrganizationRoleKey } from "../identity/authorization";
import { can, permissions } from "../identity/authorization";
import { providerDefinition, validateProviderScopes, type ConnectionState, type ProviderAdapter, type ProviderAuthMethod, type ProviderHealth } from ".";
import type { AuthenticatedSecretVault, VaultRecordContext } from "./vault";

export type IntegrationConnection = {
  id: string;
  organizationId: string;
  projectId: string;
  providerId: string;
  authMethod: ProviderAuthMethod;
  environment: "production" | "staging";
  state: ConnectionState;
  grantedScopes: readonly string[];
  ownerAccountId: string;
  maskedHint: string;
  metadata: Readonly<Record<string, string>>;
  health: ProviderHealth | null;
  lastSyncedAt: number | null;
  revision: number;
  createdAt: number;
  updatedAt: number;
  disconnectedAt: number | null;
  deletedAt: number | null;
};
export type IntegrationCredentialRecord = {
  id: string;
  connectionId: string;
  recordVersion: number;
  encryptedEnvelope: string;
  keyVersion: string;
  createdAt: number;
  revokedAt: number | null;
};
export type IntegrationActor = { accountId: string; organizationId: string; role: OrganizationRoleKey; projectIds: ReadonlySet<string> | "*"; active: boolean };
export type IntegrationEntitlement = { enabled: boolean; allowedProviders: ReadonlySet<string> | "*"; maxConnections: number };
export type IntegrationAudit = { id: string; organizationId: string; projectId: string; actorId: string; action: string; connectionId: string; reason: string; correlationId: string; metadata: Record<string, unknown>; occurredAt: number };

export interface IntegrationConnectionRepository {
  transaction<T>(operation: () => T): T;
  projectExists(organizationId: string, projectId: string): boolean;
  activeConnectionCount(organizationId: string): number;
  connection(organizationId: string, projectId: string, connectionId: string): IntegrationConnection | null;
  credential(connectionId: string): IntegrationCredentialRecord | null;
  appendConnection(value: IntegrationConnection): void;
  appendCredential(value: IntegrationCredentialRecord): void;
  updateHealth(connectionId: string, expectedRevision: number, state: ConnectionState, health: ProviderHealth, now: number): boolean;
  disconnect(connectionId: string, expectedRevision: number, now: number): boolean;
  revokeCredential(credentialId: string, now: number): void;
  deleteConnection(connectionId: string, expectedRevision: number, now: number): boolean;
  appendAudit(value: IntegrationAudit): void;
}

export class IntegrationConnectionError extends Error {
  constructor(readonly code: "FORBIDDEN" | "NOT_FOUND" | "ENTITLEMENT_REQUIRED" | "LIMIT_REACHED" | "PROVIDER_INVALID" | "AUTH_METHOD_INVALID" | "SECRET_INVALID" | "STATE_CONFLICT", message: string, readonly status: number) { super(message); }
}

export class IntegrationConnectionService {
  constructor(private readonly repository: IntegrationConnectionRepository, private readonly vault: AuthenticatedSecretVault, private readonly adapters: ReadonlyMap<string, ProviderAdapter>, private readonly now: () => number = () => Math.floor(Date.now() / 1000)) {}

  async connectApiKey(actor: IntegrationActor, entitlement: IntegrationEntitlement, input: { organizationId: string; projectId: string; providerId: string; scopes: readonly string[]; secret: string; maskedHint?: string; metadata?: Readonly<Record<string,string>>; environment: "production" | "staging"; correlationId: string }) {
    this.authorize(actor, input.organizationId, input.projectId, true);
    this.entitle(entitlement, input.providerId);
    const definition = providerDefinition(input.providerId);
    if (!definition) throw new IntegrationConnectionError("PROVIDER_INVALID", "集成供应商无效", 400);
    if (!definition.authMethods.includes("api_key")) throw new IntegrationConnectionError("AUTH_METHOD_INVALID", "该供应商不支持 API Key", 400);
    if (input.secret.trim().length < 8 || input.secret.length > 16_384) throw new IntegrationConnectionError("SECRET_INVALID", "凭据格式无效", 400);
    const scopes = validateProviderScopes(definition, input.scopes);
    if (!this.repository.projectExists(input.organizationId, input.projectId)) throw new IntegrationConnectionError("NOT_FOUND", "项目不存在", 404);
    if (this.repository.activeConnectionCount(input.organizationId) >= entitlement.maxConnections) throw new IntegrationConnectionError("LIMIT_REACHED", "当前套餐的集成连接数量已达上限", 403);
    const now = this.now(), connectionId = crypto.randomUUID(), credentialId = crypto.randomUUID();
    const context = this.context(input.organizationId, input.projectId, connectionId, credentialId, 1);
    const encryptedEnvelope = await this.vault.seal(input.secret, context);
    const keyVersion = encryptedEnvelope.split(".")[1];
    const metadata=this.safeMetadata(input.providerId,input.metadata);
    const connection: IntegrationConnection = { id: connectionId, organizationId: input.organizationId, projectId: input.projectId, providerId: input.providerId, authMethod: "api_key", environment: input.environment, state: "connected", grantedScopes: scopes, ownerAccountId: actor.accountId, maskedHint: this.mask(input.maskedHint || input.secret), metadata, health: null, lastSyncedAt: null, revision: 1, createdAt: now, updatedAt: now, disconnectedAt: null, deletedAt: null };
    this.repository.transaction(() => {
      this.repository.appendConnection(connection);
      this.repository.appendCredential({ id: credentialId, connectionId, recordVersion: 1, encryptedEnvelope, keyVersion, createdAt: now, revokedAt: null });
      this.audit(actor, connection, "integration.connected", "api_key_connected", input.correlationId, { providerId: input.providerId, scopes });
    });
    return this.view(connection);
  }

  async testConnection(actor: IntegrationActor, input: { organizationId: string; projectId: string; connectionId: string; expectedRevision: number; correlationId: string }) {
    this.authorize(actor, input.organizationId, input.projectId, true);
    const connection = this.required(input.organizationId, input.projectId, input.connectionId);
    if (connection.revision !== input.expectedRevision) throw new IntegrationConnectionError("STATE_CONFLICT", "连接状态已变化，请刷新后重试", 409);
    const credential = this.repository.credential(connection.id);
    const adapter = this.adapters.get(connection.providerId);
    if (!credential || credential.revokedAt || !adapter) throw new IntegrationConnectionError("STATE_CONFLICT", "连接凭据或供应商适配器不可用", 409);
    const now = this.now();
    const health = await adapter.checkHealth({ organizationId: connection.organizationId, projectId: connection.projectId, connectionId: connection.id, credentialHandle: credential.id, grantedScopes: connection.grantedScopes, correlationId: input.correlationId, deadlineAt: now + 30, metadata: connection.metadata });
    const state: ConnectionState = health.state === "healthy" ? "connected" : health.state;
    if (!this.repository.updateHealth(connection.id, input.expectedRevision, state, health, now)) throw new IntegrationConnectionError("STATE_CONFLICT", "连接状态已变化，请刷新后重试", 409);
    this.audit(actor, connection, "integration.tested", health.state, input.correlationId, { providerId: connection.providerId, health: health.state });
    return { ...this.view(connection), state, health, revision: input.expectedRevision + 1, updatedAt: now };
  }

  async disconnect(actor: IntegrationActor, input: { organizationId: string; projectId: string; connectionId: string; expectedRevision: number; reason: string; correlationId: string }) {
    this.authorize(actor, input.organizationId, input.projectId, true);
    const connection = this.required(input.organizationId, input.projectId, input.connectionId), credential = this.repository.credential(connection.id), adapter = this.adapters.get(connection.providerId), now = this.now();
    if (connection.revision !== input.expectedRevision) throw new IntegrationConnectionError("STATE_CONFLICT", "连接状态已变化，请刷新后重试", 409);
    if (adapter && credential && !credential.revokedAt) await adapter.disconnect({ organizationId: connection.organizationId, projectId: connection.projectId, connectionId: connection.id, credentialHandle: credential.id, grantedScopes: connection.grantedScopes, correlationId: input.correlationId, deadlineAt: now + 30 });
    this.repository.transaction(() => {
      if (!this.repository.disconnect(connection.id, input.expectedRevision, now)) throw new IntegrationConnectionError("STATE_CONFLICT", "连接状态已变化，请刷新后重试", 409);
      if (credential) this.repository.revokeCredential(credential.id, now);
      this.audit(actor, connection, "integration.disconnected", input.reason, input.correlationId, { providerId: connection.providerId });
    });
    return { id: connection.id, state: "disconnected" as const, revision: input.expectedRevision + 1, disconnectedAt: now };
  }

  async delete(actor: IntegrationActor, input: { organizationId: string; projectId: string; connectionId: string; expectedRevision: number; reason: string; correlationId: string }) {
    this.authorize(actor, input.organizationId, input.projectId, true);
    const connection = this.required(input.organizationId, input.projectId, input.connectionId), credential = this.repository.credential(connection.id), adapter = this.adapters.get(connection.providerId), now = this.now();
    if (connection.revision !== input.expectedRevision) throw new IntegrationConnectionError("STATE_CONFLICT", "连接状态已变化，请刷新后重试", 409);
    if (adapter && credential) await adapter.deleteConnectionData({ organizationId: connection.organizationId, projectId: connection.projectId, connectionId: connection.id, credentialHandle: credential.id, grantedScopes: connection.grantedScopes, correlationId: input.correlationId, deadlineAt: now + 30 });
    this.repository.transaction(() => {
      if (!this.repository.deleteConnection(connection.id, input.expectedRevision, now)) throw new IntegrationConnectionError("STATE_CONFLICT", "连接状态已变化，请刷新后重试", 409);
      if (credential) this.repository.revokeCredential(credential.id, now);
      this.audit(actor, connection, "integration.deleted", input.reason, input.correlationId, { providerId: connection.providerId });
    });
    return { id: connection.id, deleted: true, deletedAt: now };
  }

  private authorize(actor: IntegrationActor, organizationId: string, projectId: string, manage: boolean) { if (!actor.active || actor.organizationId !== organizationId || (actor.projectIds !== "*" && !actor.projectIds.has(projectId)) || !can(actor.role, manage ? permissions.integrationsManage : permissions.integrationsRead)) throw new IntegrationConnectionError("FORBIDDEN", "没有管理该项目集成的权限", 403); }
  private entitle(entitlement: IntegrationEntitlement, providerId: string) { if (!entitlement.enabled || (entitlement.allowedProviders !== "*" && !entitlement.allowedProviders.has(providerId))) throw new IntegrationConnectionError("ENTITLEMENT_REQUIRED", "当前套餐不包含该集成", 403); }
  private required(organizationId: string, projectId: string, id: string) { const value = this.repository.connection(organizationId, projectId, id); if (!value || value.deletedAt) throw new IntegrationConnectionError("NOT_FOUND", "集成连接不存在", 404); return value; }
  private context(organizationId: string, projectId: string, connectionId: string, recordId: string, recordVersion: number): VaultRecordContext { return { organizationId, projectId, connectionId, recordId, recordVersion, purpose: "provider_credential" }; }
  private mask(value: string) { const clean = value.trim(); return clean.length <= 4 ? "••••" : `••••${clean.slice(-4)}`; }
  private safeMetadata(providerId:string,value:Readonly<Record<string,string>>|undefined){if(providerId!=="wordpress")return{};const raw=value?.baseUrl?.trim();if(!raw)throw new IntegrationConnectionError("SECRET_INVALID","WordPress 站点地址不能为空",400);let url:URL;try{url=new URL(raw);}catch{throw new IntegrationConnectionError("SECRET_INVALID","WordPress 站点地址无效",400);}if(url.protocol!=="https:"||url.username||url.password||url.port&&url.port!=="443")throw new IntegrationConnectionError("SECRET_INVALID","WordPress 站点必须使用安全 HTTPS 地址",400);return{baseUrl:`https://${url.hostname}${url.pathname.replace(/\/$/,"")}`};}
  private view(value: IntegrationConnection) { return { ...value, health: value.health ? { ...value.health, error: value.health.error ? { ...value.health.error } : null } : null }; }
  private audit(actor: IntegrationActor, connection: IntegrationConnection, action: string, reason: string, correlationId: string, metadata: Record<string, unknown>) { this.repository.appendAudit({ id: crypto.randomUUID(), organizationId: connection.organizationId, projectId: connection.projectId, actorId: actor.accountId, action, connectionId: connection.id, reason: reason.slice(0, 500), correlationId, metadata, occurredAt: this.now() }); }
}
