import nodemailer from "nodemailer";
import { database } from "./database";

type VerificationEmail = {
  to: string;
  name: string;
  token: string;
  requestUrl: string;
};

export type EmailCodePurpose = "register" | "password_reset";

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

export async function sendEmailCode(to: string, code: string, purpose: EmailCodePurpose): Promise<void> {
  const reset = purpose === "password_reset";
  const subject = reset ? "OneShowSEO 密码重置验证码" : "OneShowSEO 注册验证码";
  const intro = reset ? "你正在重置 OneShowSEO 登录密码" : "你正在注册 OneShowSEO 账号";
  const text = `${intro}。\n\n验证码：${code}\n\n验证码 10 分钟内有效，请勿转发给他人。若非本人操作，请忽略此邮件。`;
  if (process.env.EMAIL_PROVIDER === "outbox" && process.env.NODE_ENV !== "production") {
    database().prepare(`
      INSERT INTO email_outbox (id, recipient, kind, subject, text, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(crypto.randomUUID(), to, purpose, subject, text, Math.floor(Date.now() / 1000)).run();
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
      subject,
      text,
      html: `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#18213a;line-height:1.7;max-width:560px;margin:auto;padding:28px"><h2 style="margin:0 0 12px">${subject}</h2><p>${intro}，请输入以下验证码：</p><div style="font-size:32px;letter-spacing:10px;font-weight:800;color:#5265f7;background:#f3f5ff;border-radius:10px;padding:16px 18px;text-align:center;margin:24px 0">${code}</div><p style="font-size:12px;color:#7a8498">验证码 10 分钟内有效，请勿转发给他人。若非本人操作，请忽略此邮件。</p></div>`,
    });
  } catch {
    throw Object.assign(new Error("EMAIL_DELIVERY_FAILED"), { status: 502 });
  } finally {
    transport.close();
  }
}

export async function sendInvitationEmail(input:{to:string;organizationName:string;inviterName:string;token:string;requestUrl:string}):Promise<void>{
  const appUrl=(process.env.APP_URL||new URL(input.requestUrl).origin).replace(/\/$/,"");
  const invitationUrl=`${appUrl}/workspace?invitation=${encodeURIComponent(input.token)}`;
  const subject=`${input.inviterName} 邀请你加入 ${input.organizationName}`;
  const text=`你已被邀请加入 OneShowSEO 组织「${input.organizationName}」。\n\n请在 7 天内登录对应邮箱账号并接受邀请：\n${invitationUrl}\n\n此链接仅可使用一次。`;
  if(process.env.EMAIL_PROVIDER==="outbox"&&process.env.NODE_ENV!=="production"){
    database().prepare(`INSERT INTO email_outbox (id,recipient,kind,subject,text,created_at) VALUES (?,?,'invitation',?,?,?)`).bind(crypto.randomUUID(),input.to,subject,text,Math.floor(Date.now()/1000)).run();return;
  }
  const config=emailConfig();const transport=nodemailer.createTransport({host:config.host,port:config.port,secure:config.secure,auth:{user:config.user,pass:config.password},connectionTimeout:10_000,greetingTimeout:10_000,socketTimeout:20_000,tls:{minVersion:"TLSv1.2",servername:config.host}});
  try{await transport.sendMail({from:config.from,to:input.to,subject,text,html:`<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#18213a;line-height:1.7;max-width:560px;margin:auto;padding:28px"><h2>加入 ${escapeHtml(input.organizationName)}</h2><p>${escapeHtml(input.inviterName)} 邀请你加入 OneShowSEO 团队。</p><p style="margin:28px 0"><a href="${invitationUrl}" style="display:inline-block;background:#5265f7;color:#fff;text-decoration:none;padding:12px 22px;border-radius:7px;font-weight:700">接受邀请 / Accept invitation</a></p><p style="font-size:12px;color:#7a8498">链接 7 天内有效且仅可使用一次。</p></div>`});}
  catch{throw Object.assign(new Error("EMAIL_DELIVERY_FAILED"),{status:502});}finally{transport.close();}
}

export async function sendNotificationEmail(input:{to:string;title:string;body:string;recoveryUrl:string|null;locale:"zh-CN"|"en"}):Promise<{providerReference:string|null}>{
  const action=input.locale==="zh-CN"?"查看并处理":"Review and recover",footer=input.locale==="zh-CN"?"如果你不认识这项活动，请直接登录 OneShowSEO 检查账户安全。":"If you do not recognize this activity, sign in to OneShowSEO and review account security.";
  const text=`${input.title}\n\n${input.body}${input.recoveryUrl?`\n\n${action}: ${input.recoveryUrl}`:""}\n\n${footer}`;
  if(process.env.EMAIL_PROVIDER==="outbox"&&process.env.NODE_ENV!=="production"){
    const id=crypto.randomUUID();database().prepare("INSERT INTO email_outbox (id,recipient,kind,subject,text,created_at) VALUES (?,?,'notification',?,?,?)").bind(id,input.to,input.title,text,Math.floor(Date.now()/1000)).run();return{providerReference:id};
  }
  const config=emailConfig(),transport=nodemailer.createTransport({host:config.host,port:config.port,secure:config.secure,auth:{user:config.user,pass:config.password},connectionTimeout:10_000,greetingTimeout:10_000,socketTimeout:20_000,tls:{minVersion:"TLSv1.2",servername:config.host}});
  try{const result=await transport.sendMail({from:config.from,to:input.to,subject:input.title,text,html:`<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#18213a;line-height:1.7;max-width:560px;margin:auto;padding:28px"><h2>${escapeHtml(input.title)}</h2><p>${escapeHtml(input.body)}</p>${input.recoveryUrl?`<p style="margin:28px 0"><a href="${escapeHtml(input.recoveryUrl)}" style="display:inline-block;background:#5265f7;color:#fff;text-decoration:none;padding:12px 22px;border-radius:7px;font-weight:700">${action}</a></p>`:""}<p style="font-size:12px;color:#7a8498">${footer}</p></div>`});return{providerReference:result.messageId||null};}
  catch(error){const code=error&&typeof error==="object"&&"code" in error?String(error.code):"EMAIL_DELIVERY_FAILED";throw new Error(code);}
  finally{transport.close();}
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
