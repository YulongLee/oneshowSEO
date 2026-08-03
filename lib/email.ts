import nodemailer from "nodemailer";
import { database } from "./database";

type VerificationEmail = {
  to: string;
  name: string;
  token: string;
  requestUrl: string;
};

function emailConfig() {
  const host = process.env.EMAIL_SMTP_HOST;
  const user = process.env.EMAIL_SMTP_USER;
  const password = process.env.EMAIL_SMTP_PASSWORD;
  const from = process.env.EMAIL_FROM;
  if (!host || !user || !password || !from) {
    throw Object.assign(new Error("EMAIL_NOT_CONFIGURED"), { status: 503 });
  }
  return {
    host,
    port: Number(process.env.EMAIL_SMTP_PORT || 465),
    secure: process.env.EMAIL_SMTP_SECURE !== "false",
    user,
    password,
    from,
  };
}

export async function sendVerificationEmail({ to, name, token, requestUrl }: VerificationEmail): Promise<void> {
  const appUrl = (process.env.APP_URL || new URL(requestUrl).origin).replace(/\/$/, "");
  const activationUrl = `${appUrl}/api/auth/verify?token=${encodeURIComponent(token)}`;
  if (process.env.EMAIL_PROVIDER === "outbox" && process.env.NODE_ENV !== "production") {
    database().prepare(`
      INSERT INTO email_outbox (id, recipient, kind, subject, text, created_at)
      VALUES (?, ?, 'verify', ?, ?, ?)
    `).bind(crypto.randomUUID(), to, "激活你的 OneShowSEO 账号", activationUrl, Math.floor(Date.now() / 1000)).run();
    return;
  }
  const config = emailConfig();
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.password },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    tls: { minVersion: "TLSv1.2", servername: config.host },
  });
  try {
    await transport.sendMail({
      from: config.from,
      to,
      subject: "激活你的 OneShowSEO 账号",
      text: `你好，${name}：\n\n请在 1 小时内点击下面的链接激活 OneShowSEO 账号：\n${activationUrl}\n\n如果不是你发起的注册，请忽略此邮件。`,
      html: `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#18213a;line-height:1.7;max-width:560px;margin:auto;padding:28px"><h2 style="margin:0 0 12px">激活 OneShowSEO</h2><p>你好，${escapeHtml(name)}：</p><p>请在 1 小时内完成邮箱验证，激活你的 14 天免费试用。</p><p style="margin:28px 0"><a href="${activationUrl}" style="display:inline-block;background:#5265f7;color:#fff;text-decoration:none;padding:12px 22px;border-radius:7px;font-weight:700">验证邮箱并激活账号</a></p><p style="font-size:12px;color:#7a8498;word-break:break-all">按钮无法打开时，请复制此链接：<br>${activationUrl}</p><p style="font-size:12px;color:#7a8498">如果不是你发起的注册，请忽略此邮件。</p></div>`,
    });
  } catch {
    throw Object.assign(new Error("EMAIL_DELIVERY_FAILED"), { status: 502 });
  } finally {
    transport.close();
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character] || character);
}
