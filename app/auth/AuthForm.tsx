"use client";

import { FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  DeviceMobile,
  EnvelopeSimple,
  Eye,
  EyeSlash,
  Key,
  LockKey,
  ShieldCheck,
  User,
} from "@phosphor-icons/react";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo") || "/workspace";
  const register = mode === "register";
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [email, setEmail] = useState("");
  const [resendSeconds, setResendSeconds] = useState(0);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [resetComplete, setResetComplete] = useState(false);
  const [authMethod, setAuthMethod] = useState<"email" | "sms">("email");
  const [phone, setPhone] = useState("");
  const [smsCode, setSmsCode] = useState("");
  const [smsSent, setSmsSent] = useState(false);
  const [smsAvailable, setSmsAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/auth/sms/status", { cache: "no-store" })
      .then(async (response) => response.json())
      .then((result) => setSmsAvailable(result.available === true))
      .catch(() => setSmsAvailable(false));
  }, []);

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const timer = window.setInterval(
      () => setResendSeconds((seconds) => Math.max(0, seconds - 1)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [resendSeconds]);

  async function sendCode(purpose: "register" | "password_reset") {
    setError("");
    setNotice("");
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError("请输入有效的邮箱地址");
      return;
    }
    setSendingCode(true);
    try {
      const response = await fetch("/api/auth/send-code", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, purpose }),
      });
      const result = await parseAuthResponse<{
        error?: string;
        retryAfter?: number;
      }>(response);
      if (!response.ok)
        throw new Error(result.error || "验证码发送失败，请稍后重试");
      setResendSeconds(Math.min(result.retryAfter || 60, 3600));
      setNotice("验证码已发送，请检查邮箱");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "验证码发送失败，请稍后重试",
      );
    } finally {
      setSendingCode(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setNotice("");
    const form = new FormData(event.currentTarget);
    const payload = {
      name: String(form.get("name") || ""),
      email,
      code: String(form.get("code") || ""),
      password: String(form.get("password") || ""),
      acceptedTerms: form.get("acceptedTerms") === "on",
      returnTo,
    };
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await parseAuthResponse<{
        error?: string;
        returnTo?: string;
      }>(response);
      if (!response.ok) throw new Error(result.error || "请求失败，请稍后重试");
      window.location.assign(result.returnTo || returnTo);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "请求失败，请稍后重试",
      );
    } finally {
      setLoading(false);
    }
  }

  async function submitReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setNotice("");
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") || "");
    if (password !== String(form.get("confirmPassword") || "")) {
      setError("两次输入的密码不一致");
      setLoading(false);
      return;
    }
    try {
      const response = await fetch("/api/auth/password-reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          code: String(form.get("code") || ""),
          password,
        }),
      });
      const result = await parseAuthResponse<{ error?: string }>(response);
      if (!response.ok)
        throw new Error(result.error || "密码重置失败，请稍后重试");
      setRecoveryMode(false);
      setResetComplete(true);
      setResendSeconds(0);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "密码重置失败，请稍后重试",
      );
    } finally {
      setLoading(false);
    }
  }

  async function sendSmsCode() {
    setError("");
    setNotice("");
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      setError("请输入正确的中国大陆手机号");
      return;
    }
    setSendingCode(true);
    try {
      const response = await fetch("/api/auth/sms/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone, mode }),
      });
      const result = await parseAuthResponse<{
        error?: string;
        retryAfter?: number;
      }>(response);
      if (!response.ok)
        throw new Error(result.error || "验证码发送失败，请稍后重试");
      setSmsSent(true);
      setResendSeconds(Math.min(result.retryAfter || 60, 3600));
      setNotice("验证码已发送，5 分钟内有效");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "验证码发送失败，请稍后重试",
      );
    } finally {
      setSendingCode(false);
    }
  }

  async function submitSms(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setNotice("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/sms/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          phone,
          code: smsCode,
          mode,
          name: String(form.get("name") || ""),
          acceptedTerms: form.get("acceptedTerms") === "on",
          returnTo,
        }),
      });
      const result = await parseAuthResponse<{
        error?: string;
        returnTo?: string;
      }>(response);
      if (!response.ok)
        throw new Error(result.error || "短信登录失败，请稍后重试");
      window.location.assign(result.returnTo || returnTo);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "短信登录失败，请稍后重试",
      );
    } finally {
      setLoading(false);
    }
  }

  const activation = searchParams.get("activation");
  const heading = recoveryMode
    ? ["找回密码", "通过邮箱验证码重置密码", "验证码将在 10 分钟后失效。"]
    : register
      ? [
          "创建账号",
          "开始使用 OneShowSEO",
          "创建你的工作空间，开始 14 天免费试用。",
        ]
      : [
          "欢迎回来",
          "登录 OneShowSEO",
          "进入工作台，查看今天的 SEO 增长结果。",
        ];

  const brand = register
    ? {
        eyebrow: "CREATE YOUR SEO WORKSPACE",
        title: (
          <>
            从第一个项目开始，
            <br />
            建立可控的 AI SEO 增长系统。
          </>
        ),
        description:
          "用一个工作空间统一管理网站诊断、关键词机会、内容生产、发布审批和效果学习。",
        points: [
          "14 天完整功能试用",
          "创建首个网站项目",
          "高风险修改默认需审批",
        ],
        security: "邮箱验证 · 试用到期不自动扣费",
      }
    : {
        eyebrow: "WELCOME BACK",
        title: (
          <>
            继续今天的 SEO 自动化，
            <br />
            每一次运行都有证据。
          </>
        ),
        description:
          "返回你的工作台，检查 Agent 运行记录、待审批变更和最新的站点增长机会。",
        points: [
          "查看今日 Agent 执行结果",
          "处理待审批 SEO 变更",
          "跟踪排名、流量与 AI 可见性",
        ],
        security: "企业级密码加密 · 会话保护 · 权限审计",
      };

  return (
    <main
      className={`auth-page ${register ? "auth-register-page" : "auth-login-page"}`}
      data-auth-mode={mode}
    >
      <section className="auth-brand-panel">
        <Link href="/">
          <Image
            src="/brand/oneshowseo.png"
            alt="OneShowSEO"
            width={180}
            height={46}
            unoptimized
          />
        </Link>
        <div>
          <span>{brand.eyebrow}</span>
          <h1>{brand.title}</h1>
          <p>{brand.description}</p>
          <ul>
            {brand.points.map((point) => (
              <li key={point}>
                <CheckCircle weight="fill" />
                {point}
              </li>
            ))}
          </ul>
        </div>
        <small>
          <ShieldCheck weight="fill" />
          {brand.security}
        </small>
      </section>
      <section className="auth-form-panel">
        <div className="auth-card">
          <div className="auth-heading">
            <span>{heading[0]}</span>
            <h2>{heading[1]}</h2>
            <p>{heading[2]}</p>
          </div>
          {activation === "verified" && !register && (
            <p className="auth-success">
              <CheckCircle weight="fill" />
              邮箱验证成功，现在可以登录了
            </p>
          )}
          {activation === "invalid" && !register && (
            <p className="auth-error" role="alert">
              激活链接无效或已过期，请使用邮箱验证码完成验证
            </p>
          )}
          {resetComplete && !register && (
            <p className="auth-success">
              <CheckCircle weight="fill" />
              密码重置成功，请使用新密码登录
            </p>
          )}

          {!recoveryMode && (
            <div
              className="auth-method-tabs"
              role="tablist"
              aria-label={register ? "注册方式" : "登录方式"}
            >
              <button
                type="button"
                role="tab"
                aria-selected={authMethod === "email"}
                className={authMethod === "email" ? "active" : ""}
                onClick={() => {
                  setAuthMethod("email");
                  setError("");
                  setNotice("");
                }}
              >
                {register ? "邮箱注册" : "邮箱密码"}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={authMethod === "sms"}
                className={authMethod === "sms" ? "active" : ""}
                disabled={smsAvailable === false}
                onClick={() => {
                  setAuthMethod("sms");
                  setError("");
                  setNotice("");
                }}
              >
                {register ? "手机注册" : "手机验证码"}
              </button>
            </div>
          )}

          {recoveryMode ? (
            <form onSubmit={submitReset}>
              <EmailField email={email} setEmail={setEmail} />
              <CodeField
                seconds={resendSeconds}
                sending={sendingCode}
                onSend={() => sendCode("password_reset")}
              />
              <PasswordField
                name="password"
                label="新密码"
                show={showPassword}
                setShow={setShowPassword}
              />
              <PasswordField
                name="confirmPassword"
                label="确认新密码"
                show={showPassword}
                setShow={setShowPassword}
              />
              {notice && (
                <p className="auth-success">
                  <CheckCircle weight="fill" />
                  {notice}
                </p>
              )}
              {error && (
                <p className="auth-error" role="alert">
                  {error}
                </p>
              )}
              <button className="auth-submit" disabled={loading}>
                {loading ? "正在重置…" : "确认重置密码"}
                <ArrowRight />
              </button>
              <button
                className="auth-back"
                type="button"
                onClick={() => {
                  setRecoveryMode(false);
                  setError("");
                  setNotice("");
                }}
              >
                <ArrowLeft />
                返回登录
              </button>
            </form>
          ) : authMethod === "sms" ? (
            <>
              <form onSubmit={submitSms} className="sms-auth-form">
                {register && (
                  <label>
                    <span>姓名</span>
                    <div>
                      <User />
                      <input
                        name="name"
                        autoComplete="name"
                        placeholder="你的姓名"
                        minLength={2}
                        maxLength={60}
                        required
                      />
                    </div>
                  </label>
                )}
                <label>
                  <span>手机号</span>
                  <div className="phone-input">
                    <DeviceMobile />
                    <b>+86</b>
                    <input
                      name="phone"
                      inputMode="numeric"
                      autoComplete="tel"
                      placeholder="请输入 11 位手机号"
                      value={phone}
                      onChange={(event) =>
                        setPhone(
                          event.target.value.replace(/\D/g, "").slice(0, 11),
                        )
                      }
                      pattern="1[3-9]\d{9}"
                      maxLength={11}
                      required
                    />
                  </div>
                </label>
                <label>
                  <span>短信验证码</span>
                  <div className="code-input">
                    <Key />
                    <input
                      name="smsCode"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      placeholder="输入 6 位验证码"
                      value={smsCode}
                      onChange={(event) =>
                        setSmsCode(
                          event.target.value.replace(/\D/g, "").slice(0, 6),
                        )
                      }
                      pattern="\d{6}"
                      maxLength={6}
                      required
                    />
                    <button
                      className="code-send-button"
                      type="button"
                      disabled={
                        sendingCode || resendSeconds > 0 || phone.length !== 11
                      }
                      onClick={sendSmsCode}
                    >
                      {sendingCode
                        ? "发送中…"
                        : resendSeconds > 0
                          ? `${resendSeconds}s`
                          : "获取验证码"}
                    </button>
                  </div>
                </label>
                {register && (
                  <label className="terms">
                    <input type="checkbox" name="acceptedTerms" required />
                    <span>
                      我已阅读并同意
                      <Link href="/terms">《服务条款》</Link>和
                      <Link href="/privacy">《隐私政策》</Link>
                    </span>
                  </label>
                )}
                {notice && (
                  <p className="auth-success">
                    <CheckCircle weight="fill" />
                    {notice}
                  </p>
                )}
                {error && (
                  <p className="auth-error" role="alert">
                    {error}
                  </p>
                )}
                <button
                  className="auth-submit"
                  disabled={loading || !smsSent || smsCode.length !== 6}
                >
                  {loading
                    ? "正在验证…"
                    : register
                      ? "验证并创建账号"
                      : "验证并登录"}
                  <ArrowRight />
                </button>
                <small className="sms-security-note">
                  <ShieldCheck />
                  验证码仅用于{register ? "注册" : "登录"}，手机号不会公开展示
                </small>
              </form>
              <p className="auth-switch">
                {register ? (
                  <>
                    已有账号？
                    <Link
                      href={`/login?returnTo=${encodeURIComponent(returnTo)}`}
                    >
                      直接登录
                    </Link>
                  </>
                ) : (
                  <>
                    还没有账号？
                    <Link
                      href={`/register?returnTo=${encodeURIComponent(returnTo)}`}
                    >
                      免费注册
                    </Link>
                  </>
                )}
              </p>
            </>
          ) : (
            <>
              <form onSubmit={submit}>
                {register && (
                  <label>
                    <span>姓名</span>
                    <div>
                      <User />
                      <input
                        name="name"
                        autoComplete="name"
                        placeholder="你的姓名"
                        minLength={2}
                        maxLength={60}
                        required
                      />
                    </div>
                  </label>
                )}
                <EmailField email={email} setEmail={setEmail} />
                {register && (
                  <CodeField
                    seconds={resendSeconds}
                    sending={sendingCode}
                    onSend={() => sendCode("register")}
                  />
                )}
                <PasswordField
                  name="password"
                  label="密码"
                  show={showPassword}
                  setShow={setShowPassword}
                  current={!register}
                />
                {!register && (
                  <div className="auth-options">
                    <label>
                      <input type="checkbox" name="remember" defaultChecked />
                      保持登录
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setRecoveryMode(true);
                        setError("");
                        setNotice("");
                        setResendSeconds(0);
                      }}
                    >
                      忘记密码？
                    </button>
                  </div>
                )}
                {register && (
                  <label className="terms">
                    <input type="checkbox" name="acceptedTerms" required />
                    <span>
                      我已阅读并同意<Link href="/terms">《服务条款》</Link>和
                      <Link href="/privacy">《隐私政策》</Link>
                    </span>
                  </label>
                )}
                {notice && (
                  <p className="auth-success">
                    <CheckCircle weight="fill" />
                    {notice}
                  </p>
                )}
                {error && (
                  <p className="auth-error" role="alert">
                    {error}
                  </p>
                )}
                <button className="auth-submit" disabled={loading}>
                  {loading
                    ? "正在处理…"
                    : register
                      ? "验证并创建账号"
                      : "登录工作台"}
                  <ArrowRight />
                </button>
              </form>
              <p className="auth-switch">
                {register ? "已经有账号？" : "还没有账号？"}
                <Link
                  href={
                    register
                      ? `/login?returnTo=${encodeURIComponent(returnTo)}`
                      : `/register?returnTo=${encodeURIComponent(returnTo)}`
                  }
                >
                  {register ? "直接登录" : "免费注册"}
                </Link>
              </p>
              {register && (
                <small className="trial-note">免费试用到期后不会自动扣费</small>
              )}
            </>
          )}
        </div>
      </section>
    </main>
  );
}

async function parseAuthResponse<T extends Record<string, unknown>>(
  response: Response,
): Promise<T> {
  const text = await response.text();
  if (!text) throw new Error("账户服务暂时不可用，请稍后重试");
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("账户服务响应异常，请稍后重试");
  }
}

function EmailField({
  email,
  setEmail,
}: {
  email: string;
  setEmail: (value: string) => void;
}) {
  return (
    <label>
      <span>工作邮箱</span>
      <div>
        <EnvelopeSimple />
        <input
          name="email"
          type="email"
          autoComplete="email"
          placeholder="name@company.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </div>
    </label>
  );
}

function CodeField({
  seconds,
  sending,
  onSend,
}: {
  seconds: number;
  sending: boolean;
  onSend: () => void;
}) {
  return (
    <label>
      <span>邮箱验证码</span>
      <div className="code-input">
        <Key />
        <input
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="输入 6 位验证码"
          pattern="\d{6}"
          maxLength={6}
          required
        />
        <button
          className="code-send-button"
          type="button"
          disabled={sending || seconds > 0}
          onClick={onSend}
        >
          {sending ? "发送中…" : seconds > 0 ? `${seconds}s` : "获取验证码"}
        </button>
      </div>
    </label>
  );
}

function PasswordField({
  name,
  label,
  show,
  setShow,
  current = false,
}: {
  name: string;
  label: string;
  show: boolean;
  setShow: (value: boolean) => void;
  current?: boolean;
}) {
  return (
    <label>
      <span>{label}</span>
      <div>
        <LockKey />
        <input
          name={name}
          type={show ? "text" : "password"}
          autoComplete={current ? "current-password" : "new-password"}
          placeholder={current ? "输入你的密码" : "至少 10 位，包含字母和数字"}
          minLength={10}
          required
        />
        <button
          type="button"
          aria-label={show ? "隐藏密码" : "显示密码"}
          onClick={() => setShow(!show)}
        >
          {show ? <EyeSlash /> : <Eye />}
        </button>
      </div>
    </label>
  );
}
