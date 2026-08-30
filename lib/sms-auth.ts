import {
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "node:crypto";
import DysmsapiPackage, { SendSmsRequest } from "@alicloud/dysmsapi20170525";
import { SqliteIdentityAuthRepository } from "../platform/adapters/sqlite/identity-auth-repository";
import {
  consumeRateLimit,
  ensureAuthSchema,
  getDatabase,
  hashAuthToken,
  writeAudit,
} from "./auth";
import { hashPassword } from "./password";

const CODE_TTL_DEFAULT = 300;
const AliyunSmsClient = (
  DysmsapiPackage as unknown as { default: typeof DysmsapiPackage }
).default;

export class SmsAuthError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
    readonly retryAfter?: number,
  ) {
    super(message);
  }
}

function envValue(...names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return "";
}

export function smsAuthStatus() {
  const enabled =
    envValue("SMS_AUTH_ENABLED", "OFFERSTEADY_AUTH_SMS_ENABLED") === "true";
  const accessKeyId = envValue(
    "ALIYUN_SMS_ACCESS_KEY_ID",
    "OFFERSTEADY_AUTH_SMS_ALIYUN_ACCESS_KEY_ID",
  );
  const accessKeySecret = envValue(
    "ALIYUN_SMS_ACCESS_KEY_SECRET",
    "OFFERSTEADY_AUTH_SMS_ALIYUN_ACCESS_KEY_SECRET",
  );
  const signName = envValue(
    "ALIYUN_SMS_SIGN_NAME",
    "OFFERSTEADY_AUTH_SMS_ALIYUN_SIGN_NAME",
  );
  const templateCode = envValue(
    "ALIYUN_SMS_TEMPLATE_CODE",
    "OFFERSTEADY_AUTH_SMS_ALIYUN_TEMPLATE_CODE",
  );
  const phoneHashKey = envValue(
    "SMS_PHONE_HASH_KEY",
    "OFFERSTEADY_AUTH_SMS_CODE_PEPPER",
    "DATA_SOURCE_ENCRYPTION_KEY",
  );
  return {
    enabled,
    configured:
      enabled &&
      Boolean(
        accessKeyId &&
        accessKeySecret &&
        signName &&
        templateCode &&
        phoneHashKey.length >= 32,
      ),
  };
}

export function normalizeMainlandPhone(value: unknown) {
  const compact = String(value ?? "")
    .trim()
    .replace(/[\s()-]/g, "");
  const local = compact.startsWith("+86")
    ? compact.slice(3)
    : compact.startsWith("0086")
      ? compact.slice(4)
      : compact;
  if (!/^1[3-9]\d{9}$/.test(local))
    throw new SmsAuthError("INVALID_PHONE", "请输入正确的中国大陆手机号");
  return {
    e164: `+86${local}`,
    local,
    last4: local.slice(-4),
    countryCode: "+86",
  };
}

function phoneHash(phone: ReturnType<typeof normalizeMainlandPhone>) {
  const key = envValue(
    "SMS_PHONE_HASH_KEY",
    "OFFERSTEADY_AUTH_SMS_CODE_PEPPER",
    "DATA_SOURCE_ENCRYPTION_KEY",
  );
  if (key.length < 32)
    throw new SmsAuthError("SMS_AUTH_UNAVAILABLE", "短信登录暂未配置完成", 503);
  return createHmac("sha256", key).update(phone.e164).digest("hex");
}

function hashCode(identity: string, code: string, salt: string) {
  return createHmac("sha256", salt).update(`${identity}:${code}`).digest("hex");
}

function matchesCode(
  identity: string,
  code: string,
  salt: string,
  expected: string,
) {
  const actual = Buffer.from(hashCode(identity, code, salt), "hex");
  const stored = Buffer.from(expected, "hex");
  return actual.length === stored.length && timingSafeEqual(actual, stored);
}

function codeTtl() {
  const value = Number(process.env.SMS_CODE_TTL_SECONDS || CODE_TTL_DEFAULT);
  return Number.isInteger(value)
    ? Math.max(120, Math.min(600, value))
    : CODE_TTL_DEFAULT;
}

export async function ensureSmsAuthSchema() {
  const db = getDatabase();
  await ensureAuthSchema(db);
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_phone_identities (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      phone_hash TEXT NOT NULL UNIQUE,
      phone_last4 TEXT NOT NULL,
      country_code TEXT NOT NULL DEFAULT '+86',
      verified_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sms_verification_codes (
      id TEXT PRIMARY KEY,
      phone_hash TEXT NOT NULL,
      purpose TEXT NOT NULL DEFAULT 'login' CHECK(purpose IN ('login')),
      code_hash TEXT NOT NULL,
      code_salt TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 5,
      expires_at INTEGER NOT NULL,
      consumed_at INTEGER,
      provider_request_id TEXT,
      provider_biz_id TEXT,
      ip_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sms_verification_lookup_idx ON sms_verification_codes(phone_hash,purpose,created_at DESC);
    CREATE INDEX IF NOT EXISTS sms_verification_expiry_idx ON sms_verification_codes(expires_at,consumed_at);
    CREATE TABLE IF NOT EXISTS identity_policy_acceptances (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      policy_type TEXT NOT NULL CHECK(policy_type IN ('terms','privacy')),
      policy_version TEXT NOT NULL,
      source TEXT NOT NULL,
      accepted_at INTEGER NOT NULL,
      UNIQUE(user_id,policy_type,policy_version)
    );
  `);
}

async function sendWithAliyun(
  phone: ReturnType<typeof normalizeMainlandPhone>,
  code: string,
) {
  if (!smsAuthStatus().configured)
    throw new SmsAuthError("SMS_AUTH_UNAVAILABLE", "短信登录暂未配置完成", 503);
  const endpointValue =
    envValue("ALIYUN_SMS_ENDPOINT", "OFFERSTEADY_AUTH_SMS_ALIYUN_ENDPOINT") ||
    "https://dysmsapi.aliyuncs.com/";
  const endpoint = new URL(endpointValue);
  if (
    endpoint.protocol !== "https:" ||
    endpoint.hostname !== "dysmsapi.aliyuncs.com"
  )
    throw new SmsAuthError("SMS_ENDPOINT_INVALID", "短信服务地址配置无效", 503);
  const client = new AliyunSmsClient({
    accessKeyId: envValue(
      "ALIYUN_SMS_ACCESS_KEY_ID",
      "OFFERSTEADY_AUTH_SMS_ALIYUN_ACCESS_KEY_ID",
    ),
    accessKeySecret: envValue(
      "ALIYUN_SMS_ACCESS_KEY_SECRET",
      "OFFERSTEADY_AUTH_SMS_ALIYUN_ACCESS_KEY_SECRET",
    ),
    endpoint: endpoint.host,
    regionId:
      envValue(
        "ALIYUN_SMS_REGION_ID",
        "OFFERSTEADY_AUTH_SMS_ALIYUN_REGION_ID",
      ) || "cn-qingdao",
    connectTimeout: Number(process.env.ALIYUN_SMS_TIMEOUT_MS || 10000),
    readTimeout: Number(process.env.ALIYUN_SMS_TIMEOUT_MS || 10000),
  });
  let body: Record<string, unknown>;
  try {
    const response = await client.sendSms(
      new SendSmsRequest({
        phoneNumbers: phone.local,
        signName: envValue(
          "ALIYUN_SMS_SIGN_NAME",
          "OFFERSTEADY_AUTH_SMS_ALIYUN_SIGN_NAME",
        ),
        templateCode: envValue(
          "ALIYUN_SMS_TEMPLATE_CODE",
          "OFFERSTEADY_AUTH_SMS_ALIYUN_TEMPLATE_CODE",
        ),
        templateParam: JSON.stringify({ code }),
      }),
    );
    body = (response.body || {}) as unknown as Record<string, unknown>;
  } catch (error) {
    const providerCode =
      typeof error === "object" && error && "code" in error
        ? String(error.code)
        : "";
    if (
      [
        "InvalidAccessKeyId.NotFound",
        "InvalidAccessKeyId",
        "SignatureDoesNotMatch",
      ].includes(providerCode)
    )
      throw new SmsAuthError(
        "SMS_PROVIDER_AUTH_FAILED",
        "短信服务认证失败，请联系管理员",
        503,
      );
    throw new SmsAuthError(
      providerCode === "ETIMEDOUT"
        ? "SMS_PROVIDER_TIMEOUT"
        : "SMS_PROVIDER_UNAVAILABLE",
      "短信服务暂时不可用，请稍后重试",
      502,
    );
  }
  const providerCode = String(body.code || body.Code || "");
  if (providerCode !== "OK") {
    const mapped: Record<string, [string, string, number]> = {
      "isv.BUSINESS_LIMIT_CONTROL": [
        "SMS_RATE_LIMITED",
        "发送过于频繁，请稍后再试",
        429,
      ],
      "isv.MOBILE_NUMBER_ILLEGAL": [
        "INVALID_PHONE",
        "请输入正确的中国大陆手机号",
        400,
      ],
      "isv.AMOUNT_NOT_ENOUGH": [
        "SMS_PROVIDER_BALANCE_INSUFFICIENT",
        "短信服务余额不足，请联系管理员",
        503,
      ],
      "isv.SIGN_NAME_ILLEGAL": ["SMS_SIGN_INVALID", "短信签名配置无效", 503],
      "isv.TEMPLATE_MISSING_PARAMETERS": [
        "SMS_TEMPLATE_INVALID",
        "短信模板配置无效",
        503,
      ],
      "isv.TEMPLATE_PARAMS_ILLEGAL": [
        "SMS_TEMPLATE_INVALID",
        "短信模板配置无效",
        503,
      ],
    };
    const [mappedCode, message, status] = mapped[providerCode] || [
      "SMS_SEND_FAILED",
      "验证码发送失败，请稍后重试",
      502,
    ];
    throw new SmsAuthError(mappedCode, message, status);
  }
  return {
    requestId: String(body.requestId || body.RequestId || "") || null,
    bizId: String(body.bizId || body.BizId || "") || null,
  };
}

function requestIp(request: Request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "local"
  );
}

function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return;
  const requestOrigin = new URL(request.url).origin;
  const configuredOrigin = process.env.APP_URL
    ? new URL(process.env.APP_URL).origin
    : requestOrigin;
  if (origin !== requestOrigin && origin !== configuredOrigin)
    throw new SmsAuthError(
      "ORIGIN_NOT_ALLOWED",
      "请求来源无效，请刷新页面后重试",
      403,
    );
}

export async function sendSmsLoginCode(rawPhone: unknown, request: Request) {
  assertSameOrigin(request);
  const phone = normalizeMainlandPhone(rawPhone);
  const identity = phoneHash(phone);
  await ensureSmsAuthSchema();
  const db = getDatabase();
  const now = Math.floor(Date.now() / 1000);
  const latest = db
    .prepare(
      "SELECT created_at createdAt FROM sms_verification_codes WHERE phone_hash=? AND purpose='login' ORDER BY created_at DESC LIMIT 1",
    )
    .bind(identity)
    .first<{ createdAt: number }>();
  const hour =
    db
      .prepare(
        "SELECT COUNT(*) count FROM sms_verification_codes WHERE phone_hash=? AND purpose='login' AND created_at>?",
      )
      .bind(identity, now - 3600)
      .first<{ count: number }>()?.count ?? 0;
  const day =
    db
      .prepare(
        "SELECT COUNT(*) count FROM sms_verification_codes WHERE phone_hash=? AND purpose='login' AND created_at>?",
      )
      .bind(identity, now - 86400)
      .first<{ count: number }>()?.count ?? 0;
  const retryAfter =
    latest && now - latest.createdAt < 60
      ? 60 - (now - latest.createdAt)
      : hour >= 5
        ? 3600
        : day >= 10
          ? 86400
          : 0;
  const sourceLimited = await consumeRateLimit(
    "sms-send",
    "request",
    request,
    10,
    3600,
  );
  if (retryAfter || sourceLimited) {
    const effectiveRetryAfter = retryAfter || 3600;
    await writeAudit(
      "sms_send_rate_limited",
      null,
      request,
      JSON.stringify({ last4: phone.last4, retryAfter: effectiveRetryAfter }),
    );
    throw new SmsAuthError(
      "SMS_RATE_LIMITED",
      "发送过于频繁，请稍后再试",
      429,
      effectiveRetryAfter,
    );
  }
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const salt = randomBytes(24).toString("base64url");
  let delivery: Awaited<ReturnType<typeof sendWithAliyun>>;
  try {
    delivery = await sendWithAliyun(phone, code);
  } catch (error) {
    await writeAudit(
      "sms_send_failed",
      null,
      request,
      error instanceof SmsAuthError ? error.code : "SMS_SEND_FAILED",
    );
    throw error;
  }
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare(
      "UPDATE sms_verification_codes SET consumed_at=? WHERE phone_hash=? AND purpose='login' AND consumed_at IS NULL",
    )
      .bind(now, identity)
      .run();
    db.prepare(
      `INSERT INTO sms_verification_codes(id,phone_hash,purpose,code_hash,code_salt,attempts,max_attempts,expires_at,provider_request_id,provider_biz_id,ip_hash,created_at) VALUES (?,?,'login',?,?,0,5,?,?,?,?,?)`,
    )
      .bind(
        crypto.randomUUID(),
        identity,
        hashCode(identity, code, salt),
        salt,
        now + codeTtl(),
        delivery.requestId,
        delivery.bizId,
        await hashAuthToken(requestIp(request)),
        now,
      )
      .run();
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  await writeAudit(
    "sms_send_accepted",
    null,
    request,
    JSON.stringify({ last4: phone.last4 }),
  );
  return { retryAfter: 60, expiresIn: codeTtl() };
}

export async function verifySmsLogin(
  input: { phone: unknown; code: unknown; acceptedTerms: unknown },
  request: Request,
) {
  assertSameOrigin(request);
  const phone = normalizeMainlandPhone(input.phone);
  const code = typeof input.code === "string" ? input.code.trim() : "";
  if (!/^\d{6}$/.test(code))
    throw new SmsAuthError("INVALID_SMS_CODE", "请输入 6 位短信验证码");
  const identity = phoneHash(phone);
  await ensureSmsAuthSchema();
  if (await consumeRateLimit("sms-verify", identity, request, 10, 600))
    throw new SmsAuthError(
      "SMS_RATE_LIMITED",
      "验证尝试过于频繁，请稍后再试",
      429,
      600,
    );
  const db = getDatabase();
  const now = Math.floor(Date.now() / 1000);
  const verification = db
    .prepare(
      "SELECT id,code_hash codeHash,code_salt codeSalt,attempts,max_attempts maxAttempts,expires_at expiresAt FROM sms_verification_codes WHERE phone_hash=? AND purpose='login' AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 1",
    )
    .bind(identity)
    .first<{
      id: string;
      codeHash: string;
      codeSalt: string;
      attempts: number;
      maxAttempts: number;
      expiresAt: number;
    }>();
  if (
    !verification ||
    verification.expiresAt <= now ||
    verification.attempts >= verification.maxAttempts
  ) {
    await writeAudit(
      "sms_login_failed",
      null,
      request,
      verification?.expiresAt && verification.expiresAt <= now
        ? "expired"
        : "invalid",
    );
    throw new SmsAuthError(
      verification?.expiresAt && verification.expiresAt <= now
        ? "SMS_CODE_EXPIRED"
        : "SMS_CODE_INVALID",
      verification?.expiresAt && verification.expiresAt <= now
        ? "验证码已过期，请重新获取"
        : "短信验证码不正确",
    );
  }
  db.prepare("UPDATE sms_verification_codes SET attempts=attempts+1 WHERE id=?")
    .bind(verification.id)
    .run();
  if (
    !matchesCode(identity, code, verification.codeSalt, verification.codeHash)
  ) {
    await writeAudit("sms_login_failed", null, request, "invalid_code");
    throw new SmsAuthError("SMS_CODE_INVALID", "短信验证码不正确");
  }
  const existing = db
    .prepare(
      "SELECT p.user_id userId,u.status FROM user_phone_identities p JOIN users u ON u.id=p.user_id WHERE p.phone_hash=?",
    )
    .bind(identity)
    .first<{ userId: string; status: string }>();
  if (existing && existing.status !== "active")
    throw new SmsAuthError(
      "ACCOUNT_SUSPENDED",
      "账号已暂停，请联系管理员",
      403,
    );
  let userId = existing?.userId;
  let created = false;
  if (!userId) {
    if (input.acceptedTerms !== true)
      throw new SmsAuthError(
        "LEGAL_CONSENT_REQUIRED",
        "首次使用请阅读并同意服务条款和隐私政策",
      );
    userId = crypto.randomUUID();
    const organizationId = crypto.randomUUID();
    const roleId = crypto.randomUUID();
    const membershipId = crypto.randomUUID();
    const internalEmail = `phone-${identity.slice(0, 32)}@phone.oneshowseo.invalid`;
    const passwordHash = await hashPassword(
      randomBytes(32).toString("base64url"),
    );
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare(
        "INSERT INTO users(id,email,name,password_hash,role,status,plan,trial_ends_at,email_verified_at,created_at,updated_at) VALUES (?,?,?,?,'user','active','trial',?,NULL,?,?)",
      )
        .bind(
          userId,
          internalEmail,
          `用户_${phone.last4}`,
          passwordHash,
          now + 14 * 86400,
          now,
          now,
        )
        .run();
      db.prepare(
        "INSERT INTO identity_organizations(id,slug,name,status,owner_user_id,created_at,updated_at) VALUES (?,?,?,'trial',?,?,?)",
      )
        .bind(
          organizationId,
          `workspace-${userId.slice(0, 12).toLowerCase()}`,
          `用户_${phone.last4} Workspace`,
          userId,
          now,
          now,
        )
        .run();
      db.prepare(
        "INSERT INTO identity_roles(id,organization_id,role_key,name,permissions,is_system,created_at,updated_at) VALUES (?,?,'owner','Owner','[\"*\"]',1,?,?)",
      )
        .bind(roleId, organizationId, now, now)
        .run();
      db.prepare(
        "INSERT INTO identity_memberships(id,organization_id,user_id,role_id,status,joined_at,created_at,updated_at) VALUES (?,?,?,?,'active',?,?,?)",
      )
        .bind(membershipId, organizationId, userId, roleId, now, now, now)
        .run();
      db.prepare(
        "INSERT INTO user_phone_identities(user_id,phone_hash,phone_last4,country_code,verified_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?)",
      )
        .bind(userId, identity, phone.last4, phone.countryCode, now, now, now)
        .run();
      for (const policy of ["terms", "privacy"])
        db.prepare(
          "INSERT INTO identity_policy_acceptances(id,user_id,policy_type,policy_version,source,accepted_at) VALUES (?,?,?,?,?,?)",
        )
          .bind(
            crypto.randomUUID(),
            userId,
            policy,
            "2026-08-30",
            "sms_registration",
            now,
          )
          .run();
      const consumed = db
        .prepare(
          "UPDATE sms_verification_codes SET consumed_at=? WHERE id=? AND consumed_at IS NULL",
        )
        .bind(now, verification.id)
        .run();
      if (!consumed.meta.changes) throw new Error("SMS_CODE_ALREADY_USED");
      db.exec("COMMIT");
      created = true;
    } catch (error) {
      db.exec("ROLLBACK");
      const raced = db
        .prepare(
          "SELECT user_id userId FROM user_phone_identities WHERE phone_hash=?",
        )
        .bind(identity)
        .first<{ userId: string }>();
      if (!raced) throw error;
      userId = raced.userId;
      const consumed = db
        .prepare(
          "UPDATE sms_verification_codes SET consumed_at=? WHERE id=? AND consumed_at IS NULL",
        )
        .bind(now, verification.id)
        .run();
      if (!consumed.meta.changes)
        throw new SmsAuthError(
          "SMS_CODE_INVALID",
          "验证码已使用，请重新获取",
          409,
        );
    }
  } else {
    const consumed = db
      .prepare(
        "UPDATE sms_verification_codes SET consumed_at=? WHERE id=? AND consumed_at IS NULL",
      )
      .bind(now, verification.id)
      .run();
    if (!consumed.meta.changes)
      throw new SmsAuthError(
        "SMS_CODE_INVALID",
        "验证码已使用，请重新获取",
        409,
      );
  }
  db.prepare("UPDATE users SET last_login_at=?,updated_at=? WHERE id=?")
    .bind(now, now, userId)
    .run();
  const token = randomBytes(32).toString("hex");
  const expiresAt = now + 30 * 86400;
  const repository = new SqliteIdentityAuthRepository(db);
  const organization = await repository.activeOrganization(userId, null, null);
  if (!organization)
    throw new SmsAuthError(
      "ACCOUNT_SUSPENDED",
      "当前工作空间不可用，请联系管理员",
      403,
    );
  await repository.rotateSession({
    accountId: userId,
    organizationId: organization.organizationId,
    membershipId: organization.membershipId,
    tokenHash: await hashAuthToken(token),
    previousTokenHash: null,
    expiresAt,
    now,
  });
  await writeAudit(
    created ? "sms_register_success" : "sms_login_success",
    userId,
    request,
    JSON.stringify({ last4: phone.last4 }),
  );
  return {
    userId,
    token,
    expiresAt,
    created,
    maskedPhone: `+86 **** ${phone.last4}`,
  };
}
