import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import DysmsapiPackage from "@alicloud/dysmsapi20170525";

const directory = await mkdtemp(path.join(os.tmpdir(), "oneshowseo-sms-auth-"));
process.env.DATABASE_PATH = path.join(directory, "sms.sqlite");
process.env.SMS_AUTH_ENABLED = "true";
process.env.ALIYUN_SMS_ACCESS_KEY_ID = "test-access-id";
process.env.ALIYUN_SMS_ACCESS_KEY_SECRET = "test-access-secret";
process.env.ALIYUN_SMS_SIGN_NAME = "OneShowSEO测试";
process.env.ALIYUN_SMS_TEMPLATE_CODE = "SMS_TEST_LOGIN";
process.env.SMS_PHONE_HASH_KEY =
  "a-stable-test-phone-hash-key-with-more-than-32-characters";
globalThis.__oneShowSeoDatabase = undefined;

const AliyunSmsClient = (
  DysmsapiPackage as unknown as { default: typeof DysmsapiPackage }
).default;
let deliveredCode = "";
let providerCalls = 0;
const originalSendSms = AliyunSmsClient.prototype.sendSms;
AliyunSmsClient.prototype.sendSms = async function (parameters) {
  providerCalls += 1;
  deliveredCode = JSON.parse(parameters.templateParam || "{}").code;
  assert.match(parameters.phoneNumbers || "", /^1[3-9]\d{9}$/);
  assert.equal(parameters.signName, "OneShowSEO测试");
  assert.equal(parameters.templateCode, "SMS_TEST_LOGIN");
  return {
    body: { code: "OK", requestId: "request-1", bizId: "biz-1" },
  } as never;
};

const sms = await import("../lib/sms-auth");
const auth = await import("../lib/auth");
const request = () =>
  new Request("https://oneshowseo.test/api/auth/sms", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "192.0.2.20",
    },
  });

test("SMS endpoints reject browser requests from another origin", async () => {
  const crossOriginRequest = new Request(
    "https://oneshowseo.test/api/auth/sms/send",
    {
      method: "POST",
      headers: { origin: "https://attacker.example" },
    },
  );
  await assert.rejects(
    sms.sendSmsLoginCode("13800138000", crossOriginRequest),
    (error) =>
      error instanceof sms.SmsAuthError &&
      error.code === "ORIGIN_NOT_ALLOWED" &&
      error.status === 403,
  );
  assert.equal(providerCalls, 0);
});

test("Aliyun SMS registration creates one privacy-preserving tenant and consumes the code once", async () => {
  const sent = await sms.sendSmsLoginCode("138 0013 8000", request());
  assert.equal(sent.retryAfter, 60);
  assert.equal(providerCalls, 1);
  assert.match(deliveredCode, /^\d{6}$/);
  const db = auth.getDatabase();
  const stored = db
    .prepare(
      "SELECT code_hash codeHash,phone_hash phoneHash FROM sms_verification_codes LIMIT 1",
    )
    .first<{ codeHash: string; phoneHash: string }>();
  assert.notEqual(stored?.codeHash, deliveredCode);
  assert.doesNotMatch(stored?.phoneHash || "", /13800138000/);

  await assert.rejects(
    sms.verifySmsLogin(
      {
        phone: "13800138000",
        code: "999999",
        mode: "register",
        name: "测试用户",
        acceptedTerms: true,
      },
      request(),
    ),
    (error) =>
      error instanceof sms.SmsAuthError && error.code === "SMS_CODE_INVALID",
  );
  const verified = await sms.verifySmsLogin(
    {
      phone: "+8613800138000",
      code: deliveredCode,
      mode: "register",
      name: "测试用户",
      acceptedTerms: true,
    },
    request(),
  );
  assert.equal(verified.created, true);
  assert.equal(verified.maskedPhone, "+86 **** 8000");
  assert.equal(
    db.prepare("SELECT COUNT(*) count FROM users").first<{ count: number }>()
      ?.count,
    1,
  );
  assert.equal(
    db
      .prepare("SELECT COUNT(*) count FROM identity_organizations")
      .first<{ count: number }>()?.count,
    1,
  );
  assert.equal(
    db
      .prepare("SELECT COUNT(*) count FROM identity_policy_acceptances")
      .first<{ count: number }>()?.count,
    2,
  );
  assert.equal(
    db
      .prepare(
        "SELECT consumed_at consumedAt FROM sms_verification_codes LIMIT 1",
      )
      .first<{ consumedAt: number | null }>()?.consumedAt !== null,
    true,
  );

  await assert.rejects(
    sms.verifySmsLogin(
      {
        phone: "13800138000",
        code: deliveredCode,
        mode: "register",
        name: "测试用户",
        acceptedTerms: true,
      },
      request(),
    ),
    (error) =>
      error instanceof sms.SmsAuthError && error.code === "SMS_CODE_INVALID",
  );
});

test("SMS sending enforces the one-minute phone cooldown", async () => {
  await assert.rejects(
    sms.sendSmsLoginCode("13800138000", request()),
    (error) =>
      error instanceof sms.SmsAuthError &&
      error.code === "SMS_RATE_LIMITED" &&
      error.status === 429,
  );
  assert.equal(providerCalls, 1);
});

test("SMS login requires an existing phone account and logs in without creating another tenant", async () => {
  const db = auth.getDatabase();
  db.prepare(
    "UPDATE sms_verification_codes SET created_at=created_at-61",
  ).run();
  await sms.sendSmsLoginCode("13800138000", request());
  const loggedIn = await sms.verifySmsLogin(
    {
      phone: "13800138000",
      code: deliveredCode,
      mode: "login",
      name: "",
      acceptedTerms: false,
    },
    request(),
  );
  assert.equal(loggedIn.created, false);
  assert.equal(
    db.prepare("SELECT COUNT(*) count FROM users").first<{ count: number }>()
      ?.count,
    1,
  );

  await sms.sendSmsLoginCode("13900139000", request());
  await assert.rejects(
    sms.verifySmsLogin(
      {
        phone: "13900139000",
        code: deliveredCode,
        mode: "login",
        name: "",
        acceptedTerms: false,
      },
      request(),
    ),
    (error) =>
      error instanceof sms.SmsAuthError &&
      error.code === "PHONE_ACCOUNT_NOT_FOUND" &&
      error.status === 404,
  );
  assert.equal(
    db.prepare("SELECT COUNT(*) count FROM users").first<{ count: number }>()
      ?.count,
    1,
  );
});

test("SMS UI and API keep secrets server-side and preserve email login", async () => {
  const { readFile } = await import("node:fs/promises");
  const form = await readFile(
    new URL("../app/auth/AuthForm.tsx", import.meta.url),
    "utf8",
  );
  const provider = await readFile(
    new URL("../lib/sms-auth.ts", import.meta.url),
    "utf8",
  );
  assert.match(form, /手机验证码/);
  assert.match(form, /手机注册/);
  assert.match(form, /邮箱注册/);
  assert.match(form, /mode,/);
  assert.match(form, /\/api\/auth\/sms\/send/);
  assert.match(form, /\/api\/auth\/sms\/verify/);
  assert.match(form, /邮箱密码/);
  assert.match(provider, /dysmsapi\.aliyuncs\.com/);
  assert.doesNotMatch(form, /ALIYUN_SMS_ACCESS_KEY_SECRET|SMS_PHONE_HASH_KEY/);
});

test.after(async () => {
  AliyunSmsClient.prototype.sendSms = originalSendSms;
  await rm(directory, { recursive: true, force: true });
});
