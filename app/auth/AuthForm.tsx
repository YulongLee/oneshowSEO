"use client";

import { FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, CheckCircle, EnvelopeSimple, Eye, EyeSlash, Key, LockKey, ShieldCheck, User } from "@phosphor-icons/react";

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

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const timer = window.setInterval(() => setResendSeconds((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [resendSeconds]);

  async function sendCode(purpose: "register" | "password_reset") {
    setError(""); setNotice("");
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setError("请输入有效的邮箱地址"); return; }
    setSendingCode(true);
    try {
      const response = await fetch("/api/auth/send-code", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, purpose }),
      });
      const result = await response.json() as { error?: string; retryAfter?: number };
      if (!response.ok) throw new Error(result.error || "验证码发送失败，请稍后重试");
      setResendSeconds(Math.min(result.retryAfter || 60, 3600));
      setNotice("验证码已发送，请检查邮箱");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "验证码发送失败，请稍后重试");
    } finally { setSendingCode(false); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true); setError(""); setNotice("");
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
      const response = await fetch(`/api/auth/${mode}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json() as { error?: string; returnTo?: string; user?: { role?: string } };
      if (!response.ok) throw new Error(result.error || "请求失败，请稍后重试");
      window.location.assign(result.user?.role === "admin" && returnTo === "/workspace" ? "/admin" : result.returnTo || returnTo);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "请求失败，请稍后重试");
    } finally { setLoading(false); }
  }

  async function submitReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true); setError(""); setNotice("");
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") || "");
    if (password !== String(form.get("confirmPassword") || "")) {
      setError("两次输入的密码不一致"); setLoading(false); return;
    }
    try {
      const response = await fetch("/api/auth/password-reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, code: String(form.get("code") || ""), password }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "密码重置失败，请稍后重试");
      setRecoveryMode(false); setResetComplete(true); setResendSeconds(0);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "密码重置失败，请稍后重试");
    } finally { setLoading(false); }
  }

  const activation = searchParams.get("activation");
  const heading = recoveryMode
    ? ["找回密码", "通过邮箱验证码重置密码", "验证码将在 10 分钟后失效。"]
    : register
      ? ["创建账号", "开始使用 OneShowSEO", "创建你的工作空间，开始 14 天免费试用。"]
      : ["欢迎回来", "登录 OneShowSEO", "进入工作台，查看今天的 SEO 增长结果。"];

  return <main className="auth-page">
    <section className="auth-brand-panel">
      <Link href="/"><Image src="/brand/oneshowseo.png" alt="OneShowSEO" width={180} height={46} unoptimized/></Link>
      <div><span>AI SEO OPERATING SYSTEM</span><h1>把自然流量增长，<br/>变成每天自动运行的系统。</h1><p>从机会发现、任务决策到内容发布和效果学习，OneShowSEO 帮团队建立可控的增长闭环。</p><ul><li><CheckCircle weight="fill"/>14 天完整功能试用</li><li><CheckCircle weight="fill"/>所有自动修改均可审批</li><li><CheckCircle weight="fill"/>数据与项目严格隔离</li></ul></div>
      <small><ShieldCheck weight="fill"/>企业级密码加密 · 邮箱验证 · 权限审计</small>
    </section>
    <section className="auth-form-panel"><div className="auth-card">
      <div className="auth-heading"><span>{heading[0]}</span><h2>{heading[1]}</h2><p>{heading[2]}</p></div>
      {activation === "verified" && !register && <p className="auth-success"><CheckCircle weight="fill"/>邮箱验证成功，现在可以登录了</p>}
      {activation === "invalid" && !register && <p className="auth-error" role="alert">激活链接无效或已过期，请使用邮箱验证码完成验证</p>}
      {resetComplete && !register && <p className="auth-success"><CheckCircle weight="fill"/>密码重置成功，请使用新密码登录</p>}

      {recoveryMode ? <form onSubmit={submitReset}>
        <EmailField email={email} setEmail={setEmail}/>
        <CodeField seconds={resendSeconds} sending={sendingCode} onSend={() => sendCode("password_reset")}/>
        <PasswordField name="password" label="新密码" show={showPassword} setShow={setShowPassword}/>
        <PasswordField name="confirmPassword" label="确认新密码" show={showPassword} setShow={setShowPassword}/>
        {notice && <p className="auth-success"><CheckCircle weight="fill"/>{notice}</p>}
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="auth-submit" disabled={loading}>{loading ? "正在重置…" : "确认重置密码"}<ArrowRight/></button>
        <button className="auth-back" type="button" onClick={() => { setRecoveryMode(false); setError(""); setNotice(""); }}><ArrowLeft/>返回登录</button>
      </form> : <>
        <form onSubmit={submit}>
          {register && <label><span>姓名</span><div><User/><input name="name" autoComplete="name" placeholder="你的姓名" minLength={2} maxLength={60} required/></div></label>}
          <EmailField email={email} setEmail={setEmail}/>
          {register && <CodeField seconds={resendSeconds} sending={sendingCode} onSend={() => sendCode("register")}/>}
          <PasswordField name="password" label="密码" show={showPassword} setShow={setShowPassword} current={!register}/>
          {!register && <div className="auth-options"><label><input type="checkbox" name="remember" defaultChecked/>保持登录</label><button type="button" onClick={() => { setRecoveryMode(true); setError(""); setNotice(""); setResendSeconds(0); }}>忘记密码？</button></div>}
          {register && <label className="terms"><input type="checkbox" name="acceptedTerms" required/><span>我已阅读并同意<a href="#terms">《服务条款》</a>和<a href="#privacy">《隐私政策》</a></span></label>}
          {notice && <p className="auth-success"><CheckCircle weight="fill"/>{notice}</p>}
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button className="auth-submit" disabled={loading}>{loading ? "正在处理…" : register ? "验证并创建账号" : "登录工作台"}<ArrowRight/></button>
        </form>
        <p className="auth-switch">{register ? "已经有账号？" : "还没有账号？"}<Link href={register ? `/login?returnTo=${encodeURIComponent(returnTo)}` : `/register?returnTo=${encodeURIComponent(returnTo)}`}>{register ? "直接登录" : "免费注册"}</Link></p>
        {register && <small className="trial-note">免费试用到期后不会自动扣费</small>}
      </>}
    </div></section>
  </main>;
}

function EmailField({ email, setEmail }: { email: string; setEmail: (value: string) => void }) {
  return <label><span>工作邮箱</span><div><EnvelopeSimple/><input name="email" type="email" autoComplete="email" placeholder="name@company.com" value={email} onChange={(event) => setEmail(event.target.value)} required/></div></label>;
}

function CodeField({ seconds, sending, onSend }: { seconds: number; sending: boolean; onSend: () => void }) {
  return <label><span>邮箱验证码</span><div className="code-input"><Key/><input name="code" inputMode="numeric" autoComplete="one-time-code" placeholder="输入 6 位验证码" pattern="\d{6}" maxLength={6} required/><button className="code-send-button" type="button" disabled={sending || seconds > 0} onClick={onSend}>{sending ? "发送中…" : seconds > 0 ? `${seconds}s` : "获取验证码"}</button></div></label>;
}

function PasswordField({ name, label, show, setShow, current = false }: { name: string; label: string; show: boolean; setShow: (value: boolean) => void; current?: boolean }) {
  return <label><span>{label}</span><div><LockKey/><input name={name} type={show ? "text" : "password"} autoComplete={current ? "current-password" : "new-password"} placeholder={current ? "输入你的密码" : "至少 10 位，包含字母和数字"} minLength={10} required/><button type="button" aria-label={show ? "隐藏密码" : "显示密码"} onClick={() => setShow(!show)}>{show ? <EyeSlash/> : <Eye/>}</button></div></label>;
}
