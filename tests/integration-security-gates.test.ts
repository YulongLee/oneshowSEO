import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { sanitizeIntegrationRecord } from "../platform/modules/integrations/redaction";
import { integrationSecretVault, type VaultRecordContext } from "../platform/modules/integrations/vault";

test("integration records redact secrets from logs and exports recursively", () => {
  const source = {
    authorization: "Bearer visible-token",
    apiKey: "provider-key",
    safe: "connection healthy",
    nested: { encryptedEnvelope: "sv1.v1.nonce.ciphertext", refresh_token: "refresh-value" },
    response: { rawBody: "provider response may contain credentials" },
  };
  const sanitized = sanitizeIntegrationRecord(source) as Record<string, unknown>;
  const serialized = JSON.stringify(sanitized);
  assert.equal(sanitized.safe, "connection healthy");
  assert.equal(serialized.includes("visible-token"), false);
  assert.equal(serialized.includes("provider-key"), false);
  assert.equal(serialized.includes("refresh-value"), false);
  assert.equal(serialized.includes("ciphertext"), false);
  assert.equal(serialized.includes("provider response"), false);
});

test("decrypted credential buffers are zeroed immediately after the callback", async () => {
  const vault = integrationSecretVault({
    INTEGRATION_VAULT_ACTIVE_KEY_VERSION: "v1",
    INTEGRATION_VAULT_KEYS: JSON.stringify({ v1: randomBytes(32).toString("base64url") }),
  });
  const context: VaultRecordContext = {
    organizationId: "org_a",
    projectId: "project_a",
    connectionId: "connection_a",
    recordId: "credential_a",
    recordVersion: 1,
    purpose: "provider_credential",
  };
  const envelope = await vault.seal("ephemeral-secret", context);
  let exposed: Uint8Array | undefined;
  await vault.withDecrypted(envelope, context, (secret) => {
    exposed = secret;
    assert.equal(new TextDecoder().decode(secret), "ephemeral-secret");
  });
  assert.ok(exposed);
  assert.equal(exposed.every((value) => value === 0), true);
});

test("integration security suite retains every release gate", () => {
  const sources = [
    "tests/integration-vault.test.ts",
    "tests/integration-connections.test.ts",
    "tests/integration-safe-http.test.ts",
    "tests/integration-contracts.test.ts",
    "tests/integration-launch-adapters.test.ts",
  ].map((path) => readFileSync(path, "utf8")).join("\n");
  for (const gate of [
    /tampering/i,
    /rotation/i,
    /cross-tenant/i,
    /revokes credentials/i,
    /private, loopback/i,
    /DNS answers/i,
    /cross-host redirect/i,
    /timeouts and retryable/i,
    /rate limit/i,
    /adapter (contract|checks|uses|reads|health)/i,
  ]) assert.match(sources, gate);
});
