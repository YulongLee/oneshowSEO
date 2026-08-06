import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import {
  EnvironmentMasterKeyProvider,
  SecretVaultError,
  integrationSecretVault,
  type VaultRecordContext,
} from "../platform/modules/integrations/vault";

const key = () => randomBytes(32).toString("base64url");
const context: VaultRecordContext = {
  organizationId: "org_a",
  projectId: "project_a",
  connectionId: "connection_a",
  recordId: "credential_a",
  recordVersion: 1,
  purpose: "provider_credential",
};

test("authenticated record encryption uses unique nonces and binds every ownership field", async () => {
  const vault = integrationSecretVault({ INTEGRATION_VAULT_ACTIVE_KEY_VERSION: "v1", INTEGRATION_VAULT_KEYS: JSON.stringify({ v1: key() }) });
  const first = await vault.seal("provider-secret", context);
  const second = await vault.seal("provider-secret", context);
  assert.notEqual(first, second);
  assert.equal(first.includes("provider-secret"), false);
  const opened = await vault.withDecrypted(first, context, (secret) => new TextDecoder().decode(secret));
  assert.equal(opened, "provider-secret");
  for (const changed of [
    { ...context, organizationId: "org_b" },
    { ...context, projectId: "project_b" },
    { ...context, connectionId: "connection_b" },
    { ...context, recordId: "credential_b" },
    { ...context, recordVersion: 2 },
    { ...context, purpose: "oauth_state" as const },
  ])
    await assert.rejects(
      vault.withDecrypted(first, changed, () => null),
      (error) => error instanceof SecretVaultError && error.code === "VAULT_AUTHENTICATION_FAILED",
    );
});

test("tampering and missing keys fail closed without invoking the credential callback", async () => {
  const v1 = key();
  const vault = integrationSecretVault({ INTEGRATION_VAULT_ACTIVE_KEY_VERSION: "v1", INTEGRATION_VAULT_KEYS: JSON.stringify({ v1 }) });
  const envelope = await vault.seal("provider-secret", context);
  const parts = envelope.split(".");
  parts[3] = `${parts[3][0] === "A" ? "B" : "A"}${parts[3].slice(1)}`;
  const tampered = parts.join(".");
  let called = false;
  await assert.rejects(
    vault.withDecrypted(tampered, context, () => {
      called = true;
    }),
    (error) => error instanceof SecretVaultError && error.code === "VAULT_AUTHENTICATION_FAILED",
  );
  assert.equal(called, false);
  const missing = integrationSecretVault({ INTEGRATION_VAULT_ACTIVE_KEY_VERSION: "v2", INTEGRATION_VAULT_KEYS: JSON.stringify({ v2: key() }) });
  await assert.rejects(
    missing.withDecrypted(envelope, context, () => null),
    (error) => error instanceof SecretVaultError && error.code === "VAULT_KEY_NOT_FOUND",
  );
});

test("key rotation preserves authenticated plaintext and retires old-key dependency", async () => {
  const v1 = key();
  const v2 = key();
  const oldVault = integrationSecretVault({ INTEGRATION_VAULT_ACTIVE_KEY_VERSION: "v1", INTEGRATION_VAULT_KEYS: JSON.stringify({ v1 }) });
  const oldEnvelope = await oldVault.seal("rotatable-secret", context);
  const rotatingVault = integrationSecretVault({ INTEGRATION_VAULT_ACTIVE_KEY_VERSION: "v2", INTEGRATION_VAULT_KEYS: JSON.stringify({ v1, v2 }) });
  const rotated = await rotatingVault.rotate(oldEnvelope, context);
  assert.equal(rotated.rotated, true);
  assert.equal(rotated.keyVersion, "v2");
  const currentVault = integrationSecretVault({ INTEGRATION_VAULT_ACTIVE_KEY_VERSION: "v2", INTEGRATION_VAULT_KEYS: JSON.stringify({ v2 }) });
  assert.equal(await currentVault.withDecrypted(rotated.envelope, context, (secret) => new TextDecoder().decode(secret)), "rotatable-secret");
  await assert.rejects(currentVault.withDecrypted(oldEnvelope, context, () => null), /密钥版本不可用/);
  assert.deepEqual(await currentVault.rotate(rotated.envelope, context), { envelope: rotated.envelope, rotated: false, keyVersion: "v2" });
});

test("invalid or absent environment configuration cannot create a vault", () => {
  assert.throws(() => new EnvironmentMasterKeyProvider({}), (error) => error instanceof SecretVaultError && error.code === "VAULT_CONFIG_MISSING");
  assert.throws(
    () => new EnvironmentMasterKeyProvider({ INTEGRATION_VAULT_ACTIVE_KEY_VERSION: "v1", INTEGRATION_VAULT_KEYS: JSON.stringify({ v1: "short" }) }),
    (error) => error instanceof SecretVaultError && error.code === "VAULT_CONFIG_INVALID",
  );
});
