import { ensureAuthSchema, getDatabase } from "./auth";
import {
  assertPrivateKey,
  assertPublicKey,
} from "../platform/modules/commerce/china-payment-crypto";

export type ChinaPaymentProvider = "alipay" | "wechatpay";
type Field = {
  key: string;
  label: string;
  required: boolean;
  secret: boolean;
  placeholder?: string;
};
export const paymentProviderDefinitions: Record<
  ChinaPaymentProvider,
  { name: string; description: string; fields: Field[] }
> = {
  alipay: {
    name: "支付宝",
    description: "电脑网站支付（RSA2）",
    fields: [
      { key: "appId", label: "应用 ID", required: true, secret: false },
      {
        key: "gatewayUrl",
        label: "支付宝网关",
        required: true,
        secret: false,
        placeholder: "https://openapi.alipay.com/gateway.do",
      },
      {
        key: "appPrivateKey",
        label: "应用私钥（PEM）",
        required: true,
        secret: true,
      },
      {
        key: "alipayPublicKey",
        label: "支付宝公钥（PEM）",
        required: true,
        secret: true,
      },
    ],
  },
  wechatpay: {
    name: "微信支付",
    description: "API v3 Native 扫码支付",
    fields: [
      { key: "appId", label: "AppID", required: true, secret: false },
      { key: "mchId", label: "商户号", required: true, secret: false },
      {
        key: "merchantSerialNo",
        label: "商户证书序列号",
        required: true,
        secret: false,
      },
      {
        key: "apiV3Key",
        label: "API v3 密钥（32 位）",
        required: true,
        secret: true,
      },
      {
        key: "merchantPrivateKey",
        label: "商户私钥（PEM）",
        required: true,
        secret: true,
      },
      {
        key: "wechatPayPublicKeyId",
        label: "微信支付公钥 ID",
        required: true,
        secret: false,
      },
      {
        key: "wechatPayPublicKey",
        label: "微信支付公钥（PEM）",
        required: true,
        secret: true,
      },
    ],
  },
};
const encoder = new TextEncoder(),
  decoder = new TextDecoder();
function b64(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("base64url");
}
function unb64(value: string) {
  return new Uint8Array(Buffer.from(value, "base64url"));
}
async function key() {
  const secret = (
    process.env.PAYMENT_CONFIG_ENCRYPTION_KEY ||
    process.env.DATA_SOURCE_ENCRYPTION_KEY
  )?.trim();
  if (!secret || secret.length < 24)
    throw new Error("PAYMENT_ENCRYPTION_KEY_MISSING");
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}
async function encrypt(config: Record<string, string>) {
  const iv = crypto.getRandomValues(new Uint8Array(12)),
    payload = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      await key(),
      encoder.encode(JSON.stringify(config)),
    );
  return `v1.${b64(iv)}.${b64(new Uint8Array(payload))}`;
}
async function decrypt(value: string | null) {
  if (!value) return {};
  const [v, iv, payload] = value.split(".");
  if (v !== "v1" || !iv || !payload) throw new Error("PAYMENT_CONFIG_INVALID");
  const clear = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: unb64(iv) },
    await key(),
    unb64(payload),
  );
  return JSON.parse(decoder.decode(clear)) as Record<string, string>;
}
export function paymentEncryptionReady() {
  const secret = (
    process.env.PAYMENT_CONFIG_ENCRYPTION_KEY ||
    process.env.DATA_SOURCE_ENCRYPTION_KEY
  )?.trim();
  return Boolean(secret && secret.length >= 24);
}

export async function ensurePaymentSchema() {
  const db = getDatabase();
  await ensureAuthSchema(db);
  db.exec(`
 CREATE TABLE IF NOT EXISTS platform_payment_providers(provider TEXT PRIMARY KEY CHECK(provider IN ('alipay','wechatpay')),enabled INTEGER NOT NULL DEFAULT 0,encrypted_config TEXT,last_test_status TEXT,last_tested_at INTEGER,last_error TEXT,updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,updated_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS billing_payment_orders(id TEXT PRIMARY KEY,order_no TEXT NOT NULL UNIQUE,organization_id TEXT NOT NULL REFERENCES identity_organizations(id) ON DELETE CASCADE,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,provider TEXT NOT NULL CHECK(provider IN ('alipay','wechatpay')),plan_key TEXT NOT NULL CHECK(plan_key IN ('starter','pro','business')),catalog_version TEXT NOT NULL,price_version TEXT NOT NULL,amount_fen INTEGER NOT NULL CHECK(amount_fen>0),currency TEXT NOT NULL CHECK(currency='CNY'),status TEXT NOT NULL CHECK(status IN ('created','pending','paid','closed','failed','refunded')),provider_transaction_id TEXT,checkout_payload TEXT,expires_at INTEGER NOT NULL,paid_at INTEGER,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL);
 CREATE INDEX IF NOT EXISTS billing_payment_orders_org_idx ON billing_payment_orders(organization_id,created_at DESC);
 CREATE TABLE IF NOT EXISTS billing_payment_notifications(id TEXT PRIMARY KEY,provider TEXT NOT NULL,provider_event_id TEXT NOT NULL,payload_sha256 TEXT NOT NULL,received_at INTEGER NOT NULL,processed_at INTEGER,status TEXT NOT NULL,error_code TEXT,UNIQUE(provider,provider_event_id));
 `);
  const now = Math.floor(Date.now() / 1000);
  for (const provider of Object.keys(paymentProviderDefinitions))
    db.prepare(
      "INSERT OR IGNORE INTO platform_payment_providers(provider,enabled,updated_at) VALUES (?,0,?)",
    )
      .bind(provider, now)
      .run();
}

function validate(
  provider: ChinaPaymentProvider,
  config: Record<string, string>,
) {
  const definition = paymentProviderDefinitions[provider];
  if (
    !definition.fields.every(
      (field) => !field.required || config[field.key]?.trim(),
    )
  )
    throw new Error("PAYMENT_REQUIRED_FIELDS_MISSING");
  if (provider === "alipay") {
    assertPrivateKey(config.appPrivateKey);
    assertPublicKey(config.alipayPublicKey);
    if (
      ![
        "https://openapi.alipay.com/gateway.do",
        "https://openapi-sandbox.dl.alipaydev.com/gateway.do",
      ].includes(config.gatewayUrl)
    )
      throw new Error("PAYMENT_URL_INVALID");
  } else {
    if (Buffer.byteLength(config.apiV3Key) !== 32)
      throw new Error("PAYMENT_API_V3_KEY_INVALID");
    assertPrivateKey(config.merchantPrivateKey);
    assertPublicKey(config.wechatPayPublicKey);
    if (!/^PUB_KEY_ID_\d+$/.test(config.wechatPayPublicKeyId))
      throw new Error("PAYMENT_CONFIG_INVALID");
  }
}

export async function listPaymentProviders() {
  await ensurePaymentSchema();
  const rows = getDatabase()
    .prepare(
      "SELECT provider,enabled,encrypted_config AS encryptedConfig,last_test_status AS lastTestStatus,last_tested_at AS lastTestedAt,last_error AS lastError,updated_at AS updatedAt FROM platform_payment_providers ORDER BY provider",
    )
    .all<{
      provider: ChinaPaymentProvider;
      enabled: number;
      encryptedConfig: string | null;
      lastTestStatus: string | null;
      lastTestedAt: number | null;
      lastError: string | null;
      updatedAt: number;
    }>().results;
  const output = [];
  for (const row of rows) {
    let config: Record<string, string> = {};
    try {
      config = await decrypt(row.encryptedConfig);
    } catch {}
    const definition = paymentProviderDefinitions[row.provider];
    output.push({
      provider: row.provider,
      enabled: Boolean(row.enabled),
      configured: definition.fields.every(
        (field) => !field.required || Boolean(config[field.key]),
      ),
      configuredFields: definition.fields.filter((field) =>
        Boolean(config[field.key]),
      ).length,
      totalFields: definition.fields.length,
      lastTestStatus: row.lastTestStatus,
      lastTestedAt: row.lastTestedAt,
      lastError: row.lastError,
      updatedAt: row.updatedAt,
    });
  }
  return output;
}
export async function savePaymentProvider(
  provider: ChinaPaymentProvider,
  values: Record<string, string>,
  enabled: boolean,
  adminId: string,
) {
  await ensurePaymentSchema();
  const row = getDatabase()
    .prepare(
      "SELECT encrypted_config AS encryptedConfig FROM platform_payment_providers WHERE provider=?",
    )
    .bind(provider)
    .first<{ encryptedConfig: string | null }>();
  const config = await decrypt(row?.encryptedConfig ?? null);
  const allowed = new Set(
    paymentProviderDefinitions[provider].fields.map((field) => field.key),
  );
  for (const [k, v] of Object.entries(values))
    if (allowed.has(k) && v.trim()) config[k] = v.trim();
  if (enabled) validate(provider, config);
  const encrypted = Object.keys(config).length ? await encrypt(config) : null,
    now = Math.floor(Date.now() / 1000);
  getDatabase()
    .prepare(
      "UPDATE platform_payment_providers SET enabled=?,encrypted_config=?,last_test_status=?,last_tested_at=?,last_error=NULL,updated_by=?,updated_at=? WHERE provider=?",
    )
    .bind(
      enabled ? 1 : 0,
      encrypted,
      enabled ? "validated" : "saved",
      enabled ? now : null,
      adminId,
      now,
      provider,
    )
    .run();
}
export async function clearPaymentProvider(
  provider: ChinaPaymentProvider,
  adminId: string,
) {
  await ensurePaymentSchema();
  getDatabase()
    .prepare(
      "UPDATE platform_payment_providers SET enabled=0,encrypted_config=NULL,last_test_status=NULL,last_tested_at=NULL,last_error=NULL,updated_by=?,updated_at=? WHERE provider=?",
    )
    .bind(adminId, Math.floor(Date.now() / 1000), provider)
    .run();
}
export async function enabledPaymentConfig(provider: ChinaPaymentProvider) {
  await ensurePaymentSchema();
  const row = getDatabase()
    .prepare(
      "SELECT enabled,encrypted_config AS encryptedConfig FROM platform_payment_providers WHERE provider=?",
    )
    .bind(provider)
    .first<{ enabled: number; encryptedConfig: string | null }>();
  if (!row?.enabled || !row.encryptedConfig) return null;
  const config = await decrypt(row.encryptedConfig);
  validate(provider, config);
  return config;
}
export async function publicPaymentState() {
  const providers = (await listPaymentProviders())
    .filter((item) => item.enabled && item.configured)
    .map((item) => ({
      id: item.provider,
      name: paymentProviderDefinitions[item.provider].name,
    }));
  const live = process.env.BILLING_LIVE_ENABLED === "true";
  return {
    enabled: live && providers.length > 0,
    configured: providers.length > 0,
    providers: live ? providers : [],
    reason:
      live && providers.length
        ? null
        : providers.length
          ? "PAYMENT_LIVE_DISABLED"
          : "PAYMENT_PROVIDER_NOT_CONFIGURED",
  };
}
