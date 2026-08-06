import assert from "node:assert/strict";
import test from "node:test";
import {
  providerCatalog,
  providerDefinition,
  validateProviderScopes,
  type NormalizedProviderError,
  type ProviderAdapter,
  type ProviderDefinition,
} from "../platform/modules/integrations";

test("provider catalog defines unique OAuth/API-key capabilities, least scopes, sync, and deletion", () => {
  assert.equal(providerCatalog.size, 8);
  assert.deepEqual(new Set([...providerCatalog.keys()]).size, providerCatalog.size);
  assert.equal([...providerCatalog.values()].some((provider) => provider.authMethods.includes("oauth2")), true);
  assert.equal([...providerCatalog.values()].some((provider) => provider.authMethods.includes("api_key")), true);
  for (const provider of providerCatalog.values()) {
    assert.equal(provider.minimumScopes.length > 0, true, provider.id);
    assert.equal(provider.minimumScopes.every((scope) => provider.availableScopes.includes(scope)), true, provider.id);
    assert.equal(provider.capabilities.length > 0, true, provider.id);
    assert.equal(provider.supportsConnectionDeletion, true, provider.id);
    assert.equal(Object.isFrozen(provider), true, provider.id);
    assert.equal(Object.isFrozen(provider.availableScopes), true, provider.id);
  }
});

test("scope validation rejects unknown or under-scoped provider access", () => {
  const wordpress = providerDefinition("wordpress")!;
  assert.deepEqual(validateProviderScopes(wordpress, ["content.read", "content.read"]), ["content.read"]);
  assert.throws(() => validateProviderScopes(wordpress, ["content.write"]), /PROVIDER_MINIMUM_SCOPE_MISSING/);
  assert.throws(() => validateProviderScopes(wordpress, ["content.read", "admin.all"]), /PROVIDER_SCOPE_INVALID/);
  assert.equal(providerDefinition("unknown"), null);
});

test("adapter contract keeps credentials opaque and models health, cursor, rate limit, disconnect, and deletion", async () => {
  const definition = providerDefinition("dataforseo") as ProviderDefinition;
  const normalized: NormalizedProviderError = {
    code: "PROVIDER_RATE_LIMITED",
    category: "rate_limit",
    retryable: true,
    retryAfterSeconds: 30,
    messageKey: "integration.provider.rate_limited",
    remediation: "retry",
    correlationId: "integration:test:0001",
  };
  const adapter: ProviderAdapter<{ rank: number }> = {
    definition,
    async validateApiKey(candidate) {
      assert.equal(candidate.secretHandle, "vault:credential:1");
      return { grantedScopes: candidate.scopes, maskedIdentity: "da••••io" };
    },
    async checkHealth() {
      return { state: "rate_limited", checkedAt: 100, latencyMs: 25, error: normalized, rateLimit: { limit: 100, remaining: 0, resetsAt: 130, retryAfterSeconds: 30 } };
    },
    async sync(_context, input) {
      return { records: [{ rank: 1 }], nextCursor: { value: `${input.cursor?.value ?? "start"}:next`, capturedAt: 100, expiresAt: null }, hasMore: true, health: await this.checkHealth(_context) };
    },
    async disconnect() {
      return { disconnectedAt: 101, remoteAuthorizationRevoked: true };
    },
    async deleteConnectionData() {
      return { deletedAt: 102, remoteDataDeleted: true, deletionReference: "deletion:1" };
    },
  };
  const credential = await adapter.validateApiKey!({ authMethod: "api_key", secretHandle: "vault:credential:1", scopes: ["serp.read"] });
  assert.deepEqual(credential.grantedScopes, ["serp.read"]);
  const context = { organizationId: "org_a", projectId: "project_a", connectionId: "connection_a", credentialHandle: "vault:credential:1", grantedScopes: credential.grantedScopes, correlationId: "integration:test:0001", deadlineAt: 200 };
  const sync = await adapter.sync(context, { cursor: null, limit: 10 });
  assert.equal(sync.nextCursor?.value, "start:next");
  assert.equal(sync.health.rateLimit.retryAfterSeconds, 30);
  assert.equal((await adapter.disconnect(context)).remoteAuthorizationRevoked, true);
  assert.equal((await adapter.deleteConnectionData(context)).remoteDataDeleted, true);
  assert.equal(JSON.stringify(sync.health).includes("secret"), false);
});
