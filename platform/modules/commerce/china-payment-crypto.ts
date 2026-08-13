import {
  createDecipheriv,
  createPrivateKey,
  createPublicKey,
  createSign,
  createVerify,
  randomBytes,
} from "node:crypto";

export type AlipayNotification = Record<string, string>;

export function normalizePem(value: string, kind: "PRIVATE" | "PUBLIC") {
  const trimmed = value.trim();
  if (trimmed.includes("-----BEGIN")) return trimmed.replace(/\\n/g, "\n");
  const lines =
    trimmed
      .replace(/\s+/g, "")
      .match(/.{1,64}/g)
      ?.join("\n") ?? trimmed;
  return `-----BEGIN ${kind} KEY-----\n${lines}\n-----END ${kind} KEY-----`;
}

export function assertPrivateKey(value: string) {
  createPrivateKey(normalizePem(value, "PRIVATE"));
}
export function assertPublicKey(value: string) {
  createPublicKey(normalizePem(value, "PUBLIC"));
}

export function alipayCanonical(params: Record<string, string>) {
  return Object.entries(params)
    .filter(
      ([key, value]) => key !== "sign" && key !== "sign_type" && value !== "",
    )
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}

export function alipaySign(params: Record<string, string>, privateKey: string) {
  const signer = createSign("RSA-SHA256");
  signer.update(alipayCanonical(params), "utf8");
  signer.end();
  return signer.sign(normalizePem(privateKey, "PRIVATE"), "base64");
}

export function verifyAlipayNotification(
  params: AlipayNotification,
  publicKey: string,
) {
  if (params.sign_type !== "RSA2" || !params.sign) return false;
  const verifier = createVerify("RSA-SHA256");
  verifier.update(alipayCanonical(params), "utf8");
  verifier.end();
  return verifier.verify(
    normalizePem(publicKey, "PUBLIC"),
    params.sign,
    "base64",
  );
}

export function buildAlipayPagePayment(input: {
  gatewayUrl: string;
  appId: string;
  privateKey: string;
  notifyUrl: string;
  returnUrl: string;
  orderNo: string;
  amountFen: number;
  subject: string;
  timestamp?: Date;
}) {
  const biz_content = JSON.stringify({
    out_trade_no: input.orderNo,
    total_amount: (input.amountFen / 100).toFixed(2),
    subject: input.subject,
    product_code: "FAST_INSTANT_TRADE_PAY",
  });
  const params: Record<string, string> = {
    app_id: input.appId,
    method: "alipay.trade.page.pay",
    format: "JSON",
    charset: "utf-8",
    sign_type: "RSA2",
    timestamp: (input.timestamp ?? new Date())
      .toISOString()
      .slice(0, 19)
      .replace("T", " "),
    version: "1.0",
    notify_url: input.notifyUrl,
    return_url: input.returnUrl,
    biz_content,
  };
  params.sign = alipaySign(params, input.privateKey);
  const url = new URL(input.gatewayUrl);
  for (const [key, value] of Object.entries(params))
    url.searchParams.set(key, value);
  return url.toString();
}

export function wechatAuthorization(input: {
  method: string;
  path: string;
  body: string;
  mchId: string;
  serialNo: string;
  privateKey: string;
  timestamp?: number;
  nonce?: string;
}) {
  const timestamp = input.timestamp ?? Math.floor(Date.now() / 1000),
    nonce = input.nonce ?? randomBytes(16).toString("hex");
  const message = `${input.method.toUpperCase()}\n${input.path}\n${timestamp}\n${nonce}\n${input.body}\n`,
    signer = createSign("RSA-SHA256");
  signer.update(message, "utf8");
  signer.end();
  const signature = signer.sign(
    normalizePem(input.privateKey, "PRIVATE"),
    "base64",
  );
  return `WECHATPAY2-SHA256-RSA2048 mchid="${input.mchId}",nonce_str="${nonce}",timestamp="${timestamp}",serial_no="${input.serialNo}",signature="${signature}"`;
}

export function verifyWechatNotification(input: {
  timestamp: string;
  nonce: string;
  body: string;
  signature: string;
  serial: string;
  expectedSerial: string;
  publicKey: string;
  now?: number;
}) {
  if (
    !/^\d{10}$/.test(input.timestamp) ||
    input.serial !== input.expectedSerial ||
    input.signature.startsWith("WECHATPAY/SIGNTEST/")
  )
    return false;
  const now = input.now ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(input.timestamp)) > 300) return false;
  const verifier = createVerify("RSA-SHA256");
  verifier.update(
    `${input.timestamp}\n${input.nonce}\n${input.body}\n`,
    "utf8",
  );
  verifier.end();
  return verifier.verify(
    normalizePem(input.publicKey, "PUBLIC"),
    input.signature,
    "base64",
  );
}

export function decryptWechatResource(
  resource: {
    algorithm: string;
    nonce: string;
    associated_data?: string;
    ciphertext: string;
  },
  apiV3Key: string,
) {
  if (
    resource.algorithm !== "AEAD_AES_256_GCM" ||
    Buffer.byteLength(apiV3Key) !== 32
  )
    throw new Error("WECHAT_RESOURCE_INVALID");
  const encrypted = Buffer.from(resource.ciphertext, "base64");
  if (encrypted.length <= 16) throw new Error("WECHAT_RESOURCE_INVALID");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    Buffer.from(apiV3Key, "utf8"),
    Buffer.from(resource.nonce, "utf8"),
  );
  decipher.setAuthTag(encrypted.subarray(encrypted.length - 16));
  decipher.setAAD(Buffer.from(resource.associated_data ?? "", "utf8"));
  return JSON.parse(
    Buffer.concat([
      decipher.update(encrypted.subarray(0, -16)),
      decipher.final(),
    ]).toString("utf8"),
  ) as Record<string, unknown>;
}
