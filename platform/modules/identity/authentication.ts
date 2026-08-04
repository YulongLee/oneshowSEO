export type AccountStatus = "active" | "suspended";
export type AccountRole = "user" | "admin";
export type AccountPlan = "trial" | "starter" | "pro" | "business";
export type EmailCodePurpose = "register" | "password_reset";

export type IdentityAccount = {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  role: AccountRole;
  status: AccountStatus;
  plan: AccountPlan;
  trialEndsAt: number | null;
  emailVerifiedAt: number | null;
  createdAt: number;
};

export type PublicIdentityAccount = Omit<IdentityAccount, "passwordHash">;
export type OrganizationStatus = "trial" | "active" | "past_due" | "restricted" | "suspended";
export type MembershipStatus = "active" | "suspended" | "revoked";
export type OrganizationContext = {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  organizationStatus: OrganizationStatus;
  membershipId: string;
  membershipStatus: MembershipStatus;
  roleKey: string;
};
export type AuthenticatedIdentity = PublicIdentityAccount & { organization: OrganizationContext };
export type InitialOrganization = { id: string; slug: string; name: string; roleId: string; membershipId: string };
export type IssuedSession = { token: string; expiresAt: number; organization: OrganizationContext };

export interface IdentityAuthRepository {
  accountByEmail(email: string): Promise<IdentityAccount | null>;
  accountBySession(tokenHash: string, now: number): Promise<AuthenticatedIdentity | null>;
  activeOrganization(accountId: string, preferredOrganizationId: string | null, previousTokenHash: string | null): Promise<OrganizationContext | null>;
  register(input: { account: IdentityAccount; organization: InitialOrganization; codeId: string; now: number }): Promise<void>;
  recordLogin(accountId: string, now: number): Promise<void>;
  rotateSession(input: { accountId: string; organizationId: string; membershipId: string; tokenHash: string; previousTokenHash: string | null; expiresAt: number; now: number }): Promise<void>;
  revokeSession(tokenHash: string, now: number): Promise<void>;
  resetPassword(input: { accountId: string; passwordHash: string; codeId: string; now: number }): Promise<void>;
  verifyEmailToken(tokenHash: string, now: number): Promise<string | null>;
}

export interface PasswordCodec {
  hash(password: string): Promise<string>;
  verify(password: string, encoded: string): Promise<boolean>;
  validate(password: string): string | null;
}

export interface EmailCodeVerifier {
  verify(email: string, purpose: EmailCodePurpose, code: string): Promise<{ id: string } | null>;
}

export interface IdentityAuditPort {
  record(action: string, accountId: string | null, detail?: string): Promise<void>;
}

export class IdentityError extends Error {
  constructor(
    readonly code: "INVALID_REQUEST" | "INVALID_CREDENTIALS" | "ACCOUNT_SUSPENDED" | "EMAIL_UNVERIFIED" | "CONFLICT" | "CODE_INVALID",
    message: string,
    readonly status: number,
  ) { super(message); }
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SESSION_AGE_SECONDS = 60 * 60 * 24 * 30;

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase().slice(0, 254) : "";
}

export function createOpaqueToken(): string {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
}

export async function hashIdentityToken(token: string): Promise<string> {
  return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))));
}

function publicIdentityAccount(account: IdentityAccount): PublicIdentityAccount {
  return {
    id: account.id,
    email: account.email,
    name: account.name,
    role: account.role,
    status: account.status,
    plan: account.plan,
    trialEndsAt: account.trialEndsAt,
    emailVerifiedAt: account.emailVerifiedAt,
    createdAt: account.createdAt,
  };
}

export function safeReturnDestination(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.includes("\\") || /[\u0000-\u001f\u007f]/.test(value)) return "/workspace";
  try {
    const target = new URL(value, "https://oneshowseo.invalid");
    if (target.origin !== "https://oneshowseo.invalid") return "/workspace";
    if (target.pathname === "/login" || target.pathname.startsWith("/login/") || target.pathname === "/register" || target.pathname.startsWith("/register/")) return "/workspace";
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return "/workspace";
  }
}

export class IdentityAuthenticationService {
  constructor(
    private readonly repository: IdentityAuthRepository,
    private readonly passwords: PasswordCodec,
    private readonly codes: EmailCodeVerifier,
    private readonly audit: IdentityAuditPort,
    private readonly administratorEmail: (email: string) => boolean,
  ) {}

  private async issueSession(accountId: string, previousToken: string | null, now: number, preferredOrganizationId: string | null = null): Promise<IssuedSession> {
    const token = createOpaqueToken();
    const expiresAt = now + SESSION_AGE_SECONDS;
    const previousTokenHash = previousToken ? await hashIdentityToken(previousToken) : null;
    const organization = await this.repository.activeOrganization(accountId, preferredOrganizationId, previousTokenHash);
    if (!organization) throw new IdentityError("ACCOUNT_SUSPENDED", "当前组织不可用，请联系组织管理员", 403);
    await this.repository.rotateSession({
      accountId,
      organizationId: organization.organizationId,
      membershipId: organization.membershipId,
      tokenHash: await hashIdentityToken(token),
      previousTokenHash,
      expiresAt,
      now,
    });
    return { token, expiresAt, organization };
  }

  async login(input: { email: unknown; password: unknown; previousToken: string | null }): Promise<{ account: PublicIdentityAccount; session: IssuedSession }> {
    const email = normalizeEmail(input.email);
    const password = typeof input.password === "string" ? input.password : "";
    const account = await this.repository.accountByEmail(email);
    if (!account || !(await this.passwords.verify(password, account.passwordHash))) {
      await this.audit.record("login_failed", account?.id ?? null, "invalid_credentials");
      throw new IdentityError("INVALID_CREDENTIALS", "邮箱或密码错误", 401);
    }
    if (account.status !== "active") {
      await this.audit.record("login_failed", account.id, "suspended");
      throw new IdentityError("ACCOUNT_SUSPENDED", "账号已暂停，请联系管理员", 403);
    }
    if (!account.emailVerifiedAt) {
      await this.audit.record("login_failed", account.id, "email_unverified");
      throw new IdentityError("EMAIL_UNVERIFIED", "请先使用邮箱验证码完成验证", 403);
    }
    const now = Math.floor(Date.now() / 1000);
    await this.repository.recordLogin(account.id, now);
    const session = await this.issueSession(account.id, input.previousToken, now);
    await this.audit.record("login_success", account.id);
    return { account: publicIdentityAccount(account), session };
  }

  async register(input: { name: unknown; email: unknown; password: unknown; code: unknown; acceptedTerms: unknown; previousToken: string | null }): Promise<{ account: PublicIdentityAccount; session: IssuedSession }> {
    const name = typeof input.name === "string" ? input.name.trim().slice(0, 60) : "";
    const email = normalizeEmail(input.email);
    const password = typeof input.password === "string" ? input.password : "";
    const code = typeof input.code === "string" ? input.code.trim() : "";
    if (name.length < 2) throw new IdentityError("INVALID_REQUEST", "请输入至少 2 个字符的姓名", 400);
    if (!emailPattern.test(email)) throw new IdentityError("INVALID_REQUEST", "请输入有效的邮箱地址", 400);
    const passwordError = this.passwords.validate(password);
    if (passwordError) throw new IdentityError("INVALID_REQUEST", passwordError, 400);
    if (!/^\d{6}$/.test(code)) throw new IdentityError("INVALID_REQUEST", "请输入 6 位邮箱验证码", 400);
    if (input.acceptedTerms !== true) throw new IdentityError("INVALID_REQUEST", "请阅读并同意服务条款和隐私政策", 400);
    const existing = await this.repository.accountByEmail(email);
    if (existing) {
      await this.audit.record("register_failed", existing.id, "duplicate_email");
      throw new IdentityError("CONFLICT", "该邮箱已注册，请直接登录", 409);
    }
    const emailCode = await this.codes.verify(email, "register", code);
    if (!emailCode) throw new IdentityError("CODE_INVALID", "邮箱验证码错误或已过期", 400);
    const now = Math.floor(Date.now() / 1000);
    const account: IdentityAccount = {
      id: crypto.randomUUID(), email, name, passwordHash: await this.passwords.hash(password),
      role: this.administratorEmail(email) ? "admin" : "user", status: "active", plan: "trial",
      trialEndsAt: now + 14 * 24 * 60 * 60, emailVerifiedAt: now, createdAt: now,
    };
    const organization: InitialOrganization = {
      id: crypto.randomUUID(),
      slug: `workspace-${account.id.slice(0, 12).toLowerCase()}`,
      name: `${name} Workspace`,
      roleId: crypto.randomUUID(),
      membershipId: crypto.randomUUID(),
    };
    try { await this.repository.register({ account, organization, codeId: emailCode.id, now }); }
    catch { throw new IdentityError("CONFLICT", "验证码已使用，请重新获取", 409); }
    const session = await this.issueSession(account.id, input.previousToken, now);
    await this.audit.record("register_success", account.id, account.role);
    return { account: publicIdentityAccount(account), session };
  }

  async resetPassword(input: { email: unknown; code: unknown; password: unknown }): Promise<void> {
    const email = normalizeEmail(input.email);
    const code = typeof input.code === "string" ? input.code.trim() : "";
    const password = typeof input.password === "string" ? input.password : "";
    if (!/^\d{6}$/.test(code)) throw new IdentityError("INVALID_REQUEST", "请输入 6 位邮箱验证码", 400);
    const passwordError = this.passwords.validate(password);
    if (passwordError) throw new IdentityError("INVALID_REQUEST", passwordError, 400);
    const account = await this.repository.accountByEmail(email);
    const emailCode = account?.status === "active" && account.emailVerifiedAt ? await this.codes.verify(email, "password_reset", code) : null;
    if (!account || !emailCode) throw new IdentityError("CODE_INVALID", "邮箱验证码错误或已过期", 400);
    try {
      await this.repository.resetPassword({ accountId: account.id, passwordHash: await this.passwords.hash(password), codeId: emailCode.id, now: Math.floor(Date.now() / 1000) });
    } catch {
      throw new IdentityError("CONFLICT", "验证码已使用，请重新获取", 409);
    }
    await this.audit.record("password_reset_success", account.id);
  }

  async logout(token: string | null): Promise<void> {
    if (token) await this.repository.revokeSession(await hashIdentityToken(token), Math.floor(Date.now() / 1000));
  }

  async switchOrganization(input: { accountId: string; organizationId: unknown; previousToken: string | null }): Promise<IssuedSession> {
    const organizationId = typeof input.organizationId === "string" ? input.organizationId.trim() : "";
    if (!organizationId || !input.previousToken) throw new IdentityError("INVALID_REQUEST", "请选择有效的组织", 400);
    const session = await this.issueSession(input.accountId, input.previousToken, Math.floor(Date.now() / 1000), organizationId);
    await this.audit.record("organization_switched", input.accountId, organizationId);
    return session;
  }

  async verifyEmailToken(rawToken: string): Promise<boolean> {
    if (!rawToken) return false;
    const accountId = await this.repository.verifyEmailToken(await hashIdentityToken(rawToken), Math.floor(Date.now() / 1000));
    await this.audit.record(accountId ? "verification_success" : "verification_failed", accountId, accountId ? undefined : "invalid_or_expired");
    return Boolean(accountId);
  }
}
