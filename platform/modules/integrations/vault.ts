const encoder = new TextEncoder();

export type VaultRecordContext = {
  organizationId: string;
  projectId: string;
  connectionId: string;
  recordId: string;
  recordVersion: number;
  purpose: "provider_credential" | "oauth_state";
};

export class SecretVaultError extends Error {
  constructor(
    readonly code:
      | "VAULT_CONFIG_MISSING"
      | "VAULT_CONFIG_INVALID"
      | "VAULT_KEY_NOT_FOUND"
      | "VAULT_CONTEXT_INVALID"
      | "VAULT_ENVELOPE_INVALID"
      | "VAULT_AUTHENTICATION_FAILED",
    message: string,
  ) {
    super(message);
  }
}

export interface MasterKeyProvider {
  activeVersion(): Promise<string>;
  key(version: string): Promise<Uint8Array | null>;
}

function validContext(context: VaultRecordContext) {
  return (
    /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(context.organizationId) &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(context.projectId) &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(context.connectionId) &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(context.recordId) &&
    Number.isInteger(context.recordVersion) &&
    context.recordVersion > 0
  );
}

function base64Url(value: Uint8Array) {
  return Buffer.from(value).toString("base64url");
}

function fromBase64Url(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new SecretVaultError("VAULT_ENVELOPE_INVALID", "密钥信封格式无效");
  return new Uint8Array(Buffer.from(value, "base64url"));
}

function authenticatedMetadata(context: VaultRecordContext, keyVersion: string) {
  if (!validContext(context)) throw new SecretVaultError("VAULT_CONTEXT_INVALID", "密钥记录上下文无效");
  return encoder.encode(
    JSON.stringify({
      schema: "sv1",
      keyVersion,
      organizationId: context.organizationId,
      projectId: context.projectId,
      connectionId: context.connectionId,
      recordId: context.recordId,
      recordVersion: context.recordVersion,
      purpose: context.purpose,
    }),
  );
}

export class EnvironmentMasterKeyProvider implements MasterKeyProvider {
  private readonly keys: ReadonlyMap<string, Uint8Array>;
  private readonly active: string;

  constructor(environment: NodeJS.ProcessEnv = process.env) {
    const active = environment.INTEGRATION_VAULT_ACTIVE_KEY_VERSION?.trim();
    const serialized = environment.INTEGRATION_VAULT_KEYS?.trim();
    if (!active || !serialized) throw new SecretVaultError("VAULT_CONFIG_MISSING", "集成密钥保险库尚未配置");
    let parsed: unknown;
    try {
      parsed = JSON.parse(serialized);
    } catch {
      throw new SecretVaultError("VAULT_CONFIG_INVALID", "集成密钥保险库配置无效");
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw new SecretVaultError("VAULT_CONFIG_INVALID", "集成密钥保险库配置无效");
    const keys = new Map<string, Uint8Array>();
    for (const [version, encoded] of Object.entries(parsed)) {
      if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/.test(version) || typeof encoded !== "string")
        throw new SecretVaultError("VAULT_CONFIG_INVALID", "集成密钥版本配置无效");
      const bytes = fromBase64Url(encoded);
      if (bytes.byteLength !== 32) throw new SecretVaultError("VAULT_CONFIG_INVALID", "集成主密钥必须为 256 位");
      keys.set(version, bytes);
    }
    if (!keys.has(active)) throw new SecretVaultError("VAULT_KEY_NOT_FOUND", "当前集成主密钥版本不存在");
    this.keys = keys;
    this.active = active;
  }

  async activeVersion() {
    return this.active;
  }

  async key(version: string) {
    const key = this.keys.get(version);
    return key ? new Uint8Array(key) : null;
  }
}

export class AuthenticatedSecretVault {
  constructor(private readonly keys: MasterKeyProvider) {}

  async seal(secret: string | Uint8Array, context: VaultRecordContext): Promise<string> {
    const keyVersion = await this.keys.activeVersion();
    const keyBytes = await this.requiredKey(keyVersion);
    const plaintext = typeof secret === "string" ? encoder.encode(secret) : new Uint8Array(secret);
    if (plaintext.byteLength === 0) throw new SecretVaultError("VAULT_CONTEXT_INVALID", "密钥内容不能为空");
    const nonce = crypto.getRandomValues(new Uint8Array(12));
    try {
      const key = await crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["encrypt"]);
      const encrypted = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: nonce, additionalData: authenticatedMetadata(context, keyVersion), tagLength: 128 },
        key,
        plaintext,
      );
      return `sv1.${keyVersion}.${base64Url(nonce)}.${base64Url(new Uint8Array(encrypted))}`;
    } finally {
      keyBytes.fill(0);
      plaintext.fill(0);
    }
  }

  async withDecrypted<T>(envelope: string, context: VaultRecordContext, operation: (secret: Uint8Array) => Promise<T> | T): Promise<T> {
    const plaintext = await this.open(envelope, context);
    try {
      return await operation(plaintext);
    } finally {
      plaintext.fill(0);
    }
  }

  async rotate(envelope: string, context: VaultRecordContext): Promise<{ envelope: string; rotated: boolean; keyVersion: string }> {
    const parsed = this.parse(envelope);
    const active = await this.keys.activeVersion();
    if (parsed.keyVersion === active) return { envelope, rotated: false, keyVersion: active };
    const plaintext = await this.open(envelope, context);
    try {
      return { envelope: await this.seal(plaintext, context), rotated: true, keyVersion: active };
    } finally {
      plaintext.fill(0);
    }
  }

  private async open(envelope: string, context: VaultRecordContext): Promise<Uint8Array> {
    const parsed = this.parse(envelope);
    const keyBytes = await this.requiredKey(parsed.keyVersion);
    try {
      const key = await crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["decrypt"]);
      try {
        const decrypted = await crypto.subtle.decrypt(
          { name: "AES-GCM", iv: parsed.nonce, additionalData: authenticatedMetadata(context, parsed.keyVersion), tagLength: 128 },
          key,
          parsed.ciphertext,
        );
        return new Uint8Array(decrypted);
      } catch {
        throw new SecretVaultError("VAULT_AUTHENTICATION_FAILED", "密钥记录认证失败");
      }
    } finally {
      keyBytes.fill(0);
    }
  }

  private parse(envelope: string) {
    const parts = envelope.split(".");
    if (parts.length !== 4 || parts[0] !== "sv1" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/.test(parts[1]))
      throw new SecretVaultError("VAULT_ENVELOPE_INVALID", "密钥信封格式无效");
    const nonce = fromBase64Url(parts[2]);
    const ciphertext = fromBase64Url(parts[3]);
    if (nonce.byteLength !== 12 || ciphertext.byteLength < 17)
      throw new SecretVaultError("VAULT_ENVELOPE_INVALID", "密钥信封格式无效");
    return { keyVersion: parts[1], nonce, ciphertext };
  }

  private async requiredKey(version: string) {
    const key = await this.keys.key(version);
    if (!key || key.byteLength !== 32) throw new SecretVaultError("VAULT_KEY_NOT_FOUND", "密钥版本不可用");
    return key;
  }
}

export function integrationSecretVault(environment: NodeJS.ProcessEnv = process.env) {
  return new AuthenticatedSecretVault(new EnvironmentMasterKeyProvider(environment));
}
