"use client";

import { FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, CheckCircle, Eye, EyeSlash, LockKey, ShieldCheck, User, EnvelopeSimple } from "@phosphor-icons/react";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo") || "/workspace";
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pendingEmail, setPendingEmail] = useState("");
  const [resendSeconds, setResendSeconds] = useState(0);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const timer = window.setInterval(() => setResendSeconds((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [resendSeconds]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true); setError("");
    const form = new FormData(event.currentTarget);
    const payload = {
      name: String(form.get("name") || ""),
      email: String(form.get("email") || ""),
      password: String(form.get("password") || ""),
      acceptedTerms: form.get("acceptedTerms") === "on",
      returnTo,
    };
    try {
      const response = await fetch(`/api/auth/${mode}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json() as { error?: string; returnTo?: string; user?: { role?: string }; verificationRequired?: boolean; email?: string; retryAfter?: number };
      if (!response.ok) throw new Error(result.error || "请求失败，请稍后重试");
      if (register && result.verificationRequired) {
        setPendingEmail(result.email || payload.email);
        setResendSeconds(result.retryAfter || 60);
        return;
      }
      window.location.assign(result.user?.role === "admin" && returnTo === "/workspace" ? "/admin" : result.returnTo || returnTo);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "请求失败，请稍后重试");
    } finally { setLoading(false); }
  }

  const register = mode === "register";
  const activation = searchParams.get("activation");

  async function resendVerification() {
    if (!pendingEmail || resendSeconds > 0) return;
    setLoading(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: pendingEmail }),
      });
      const result = await response.json() as { error?: string; retryAfter?: number };
      if (!response.ok) throw new Error(result.error || "发送失败，请稍后重试");
      setResendSeconds(result.retryAfter || 60);
      setNotice("激活邮件已重新发送，请检查收件箱");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "发送失败，请稍后重试");
    } finally { setLoading(false); }
  }
  return <main className="auth-page">
    <section className="auth-brand-panel">
      <Link href="/"><Image src="/brand/oneshowseo.png" alt="OneShowSEO" width={180} height={46} unoptimized/></Link>
      <div><span>AI SEO OPERATING SYSTEM</span><h1>把自然流量增长，<br/>变成每天自动运行的系统。</h1><p>从机会发现、任务决策到内容发布和效果学习，OneShowSEO 帮团队建立可控的增长闭环。</p><ul><li><CheckCircle weight="fill"/>14 天完整功能试用</li><li><CheckCircle weight="fill"/>所有自动修改均可审批</li><li><CheckCircle weight="fill"/>数据与项目严格隔离</li></ul></div>
      <small><ShieldCheck weight="fill"/>企业级密码加密 · 安全会话 · 权限审计</small>
    </section>
    <section className="auth-form-panel"><div className="auth-card"><div className="auth-heading"><span>{register ? "创建账号" : "欢迎回来"}</span><h2>{register ? "开始使用 OneShowSEO" : "登录 OneShowSEO"}</h2><p>{register ? "创建你的工作空间，开始 14 天免费试用。" : "进入工作台，查看今天的 SEO 增长结果。"}</p></div>
      {activation === "verified" && !register && <p className="auth-success"><CheckCircle weight="fill"/>邮箱验证成功，现在可以登录了</p>}
      {activation === "invalid" && !register && <p className="auth-error" role="alert">激活链接无效或已过期，请重新注册或申请重发</p>}
      {pendingEmail ? <div className="verification-pending">
        <CheckCircle weight="fill"/>
        <h3>激活邮件已发送</h3>
        <p>我们已向 <strong>{pendingEmail}</strong> 发送验证邮件。请在 1 小时内点击邮件中的链接激活账号。</p>
        {notice && <p className="auth-success compact">{notice}</p>}
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="auth-submit" type="button" disabled={loading || resendSeconds > 0} onClick={resendVerification}>{loading ? "正在发送…" : resendSeconds > 0 ? `${resendSeconds} 秒后可重发` : "重新发送激活邮件"}</button>
        <Link className="verification-login" href={`/login?returnTo=${encodeURIComponent(returnTo)}`}>已完成验证，前往登录</Link>
      </div> : <><form onSubmit={submit}>
        {register && <label><span>姓名</span><div><User/><input name="name" autoComplete="name" placeholder="你的姓名" minLength={2} maxLength={60} required/></div></label>}
        <label><span>工作邮箱</span><div><EnvelopeSimple/><input name="email" type="email" autoComplete="email" placeholder="name@company.com" required/></div></label>
        <label><span>密码</span><div><LockKey/><input name="password" type={showPassword ? "text" : "password"} autoComplete={register ? "new-password" : "current-password"} placeholder={register ? "至少 10 位，包含字母和数字" : "输入你的密码"} minLength={10} required/><button type="button" aria-label={showPassword ? "隐藏密码" : "显示密码"} onClick={()=>setShowPassword(!showPassword)}>{showPassword?<EyeSlash/>:<Eye/>}</button></div></label>
        {!register && <div className="auth-options"><label><input type="checkbox" name="remember" defaultChecked/>保持登录</label><button type="button" onClick={()=>setError("密码找回邮件能力将在邮件服务接入后开放")}>忘记密码？</button></div>}
        {register && <label className="terms"><input type="checkbox" name="acceptedTerms" required/><span>我已阅读并同意<a href="#terms">《服务条款》</a>和<a href="#privacy">《隐私政策》</a></span></label>}
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="auth-submit" disabled={loading}>{loading ? "正在处理…" : register ? "免费创建账号" : "登录工作台"}<ArrowRight/></button>
      </form>
      <p className="auth-switch">{register ? "已经有账号？" : "还没有账号？"}<Link href={register ? `/login?returnTo=${encodeURIComponent(returnTo)}` : `/register?returnTo=${encodeURIComponent(returnTo)}`}>{register ? "直接登录" : "免费注册"}</Link></p>
      {register && <small className="trial-note">免费试用到期后不会自动扣费</small>}</>}
    </div></section>
  </main>;
}
