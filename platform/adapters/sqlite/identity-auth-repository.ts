import type { AppDatabase } from "../../../lib/database";
import type { AuthenticatedIdentity, IdentityAccount, IdentityAuthRepository, InitialOrganization, OrganizationContext } from "../../modules/identity/authentication";

type AccountRow = IdentityAccount;

export class SqliteIdentityAuthRepository implements IdentityAuthRepository {
  constructor(private readonly database: AppDatabase) {}

  async accountByEmail(email: string): Promise<IdentityAccount | null> {
    return this.database.prepare(`
      SELECT id,email,name,password_hash AS passwordHash,role,status,plan,trial_ends_at AS trialEndsAt,
             email_verified_at AS emailVerifiedAt,created_at AS createdAt
      FROM users WHERE email=? LIMIT 1
    `).bind(email).first<AccountRow>();
  }

  async accountBySession(tokenHash: string, now: number): Promise<AuthenticatedIdentity | null> {
    const account = this.database.prepare(`
      SELECT u.id,u.email,u.name,u.role,u.status,u.plan,u.trial_ends_at AS trialEndsAt,
             u.email_verified_at AS emailVerifiedAt,u.created_at AS createdAt,
             o.id AS organizationId,o.name AS organizationName,o.slug AS organizationSlug,o.status AS organizationStatus,
             m.id AS membershipId,m.status AS membershipStatus,r.role_key AS roleKey
      FROM sessions s JOIN users u ON u.id=s.user_id
      JOIN identity_organizations o ON o.id=s.active_organization_id
      JOIN identity_memberships m ON m.id=s.membership_id AND m.organization_id=o.id AND m.user_id=u.id
      JOIN identity_roles r ON r.id=m.role_id AND r.organization_id=o.id
      WHERE s.id=? AND s.status='active' AND s.expires_at>? AND m.status='active'
        AND o.status IN ('trial','active','past_due','restricted') LIMIT 1
    `).bind(tokenHash, now).first<Omit<AuthenticatedIdentity,"organization"> & OrganizationContext>();
    if (account) this.database.prepare("UPDATE sessions SET last_seen_at=? WHERE id=? AND status='active'").bind(now, tokenHash).run();
    else this.database.prepare("UPDATE sessions SET status='expired' WHERE id=? AND status='active' AND expires_at<=?").bind(tokenHash, now).run();
    if (!account) return null;
    return {
      id:account.id,email:account.email,name:account.name,role:account.role,status:account.status,plan:account.plan,
      trialEndsAt:account.trialEndsAt,emailVerifiedAt:account.emailVerifiedAt,createdAt:account.createdAt,
      organization:{organizationId:account.organizationId,organizationName:account.organizationName,organizationSlug:account.organizationSlug,
        organizationStatus:account.organizationStatus,membershipId:account.membershipId,membershipStatus:account.membershipStatus,roleKey:account.roleKey},
    };
  }

  async activeOrganization(accountId: string, preferredOrganizationId: string | null, previousTokenHash: string | null): Promise<OrganizationContext | null> {
    const preferred = preferredOrganizationId || (previousTokenHash ? this.database.prepare("SELECT active_organization_id AS organizationId FROM sessions WHERE id=? AND user_id=? LIMIT 1")
      .bind(previousTokenHash,accountId).first<{organizationId:string}>()?.organizationId : null);
    const row = this.database.prepare(`
      SELECT o.id AS organizationId,o.name AS organizationName,o.slug AS organizationSlug,o.status AS organizationStatus,
             m.id AS membershipId,m.status AS membershipStatus,r.role_key AS roleKey
      FROM identity_memberships m JOIN identity_organizations o ON o.id=m.organization_id
      JOIN identity_roles r ON r.id=m.role_id
      WHERE m.user_id=? AND m.status='active' AND o.status IN ('trial','active','past_due','restricted')
      ORDER BY CASE WHEN o.id=? THEN 0 ELSE 1 END,m.joined_at,m.created_at LIMIT 1
    `).bind(accountId,preferred).first<OrganizationContext>();
    if (preferred && row?.organizationId !== preferred) return null;
    return row;
  }

  async register({ account, organization, codeId, now }: { account: IdentityAccount; organization: InitialOrganization; codeId: string; now: number }): Promise<void> {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const consumed = this.database.prepare("UPDATE email_codes SET consumed_at=? WHERE id=? AND consumed_at IS NULL").bind(now, codeId).run();
      if (!consumed.meta.changes) throw new Error("CODE_ALREADY_USED");
      this.database.prepare(`
        INSERT INTO users (id,email,name,password_hash,role,status,plan,trial_ends_at,email_verified_at,created_at,updated_at)
        VALUES (?,?,?,?,?,'active','trial',?,?,?,?)
      `).bind(account.id,account.email,account.name,account.passwordHash,account.role,account.trialEndsAt,account.emailVerifiedAt,now,now).run();
      this.database.prepare(`INSERT INTO identity_organizations (id,slug,name,status,owner_user_id,created_at,updated_at) VALUES (?,?,?,'trial',?,?,?)`)
        .bind(organization.id,organization.slug,organization.name,account.id,now,now).run();
      this.database.prepare(`INSERT INTO identity_roles (id,organization_id,role_key,name,permissions,is_system,created_at,updated_at) VALUES (?,?,'owner','Owner','["*"]',1,?,?)`)
        .bind(organization.roleId,organization.id,now,now).run();
      this.database.prepare(`INSERT INTO identity_memberships (id,organization_id,user_id,role_id,status,joined_at,created_at,updated_at) VALUES (?,?,?,?,'active',?,?,?)`)
        .bind(organization.membershipId,organization.id,account.id,organization.roleId,now,now,now).run();
      this.database.exec("COMMIT");
    } catch (error) { this.database.exec("ROLLBACK"); throw error; }
  }

  async recordLogin(accountId: string, now: number): Promise<void> {
    this.database.prepare("UPDATE users SET last_login_at=?,updated_at=? WHERE id=?").bind(now,now,accountId).run();
  }

  async rotateSession(input: { accountId: string; organizationId: string; membershipId: string; tokenHash: string; previousTokenHash: string | null; expiresAt: number; now: number }): Promise<void> {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      let rotatedFrom: string | null = null;
      if (input.previousTokenHash) {
        const previous = this.database.prepare("SELECT id,user_id AS userId FROM sessions WHERE id=? AND status='active' LIMIT 1")
          .bind(input.previousTokenHash).first<{ id: string; userId: string }>();
        if (previous) {
          const sameAccount = previous.userId === input.accountId;
          this.database.prepare("UPDATE sessions SET status=?,revoked_at=? WHERE id=? AND status='active'")
            .bind(sameAccount ? "rotated" : "revoked",input.now,previous.id).run();
          if (sameAccount) rotatedFrom = previous.id;
        }
      }
      this.database.prepare(`
        INSERT INTO sessions (id,user_id,active_organization_id,membership_id,status,expires_at,rotated_from_id,last_seen_at,created_at)
        VALUES (?,?,?,?,'active',?,?,?,?)
      `).bind(input.tokenHash,input.accountId,input.organizationId,input.membershipId,input.expiresAt,rotatedFrom,input.now,input.now).run();
      this.database.exec("COMMIT");
    } catch (error) { this.database.exec("ROLLBACK"); throw error; }
  }

  async revokeSession(tokenHash: string, now: number): Promise<void> {
    this.database.prepare("UPDATE sessions SET status='revoked',revoked_at=? WHERE id=? AND status='active'").bind(now,tokenHash).run();
  }

  async resetPassword(input: { accountId: string; passwordHash: string; codeId: string; now: number }): Promise<void> {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const consumed = this.database.prepare("UPDATE email_codes SET consumed_at=? WHERE id=? AND consumed_at IS NULL").bind(input.now,input.codeId).run();
      if (!consumed.meta.changes) throw new Error("CODE_ALREADY_USED");
      this.database.prepare("UPDATE users SET password_hash=?,updated_at=? WHERE id=?").bind(input.passwordHash,input.now,input.accountId).run();
      this.database.prepare("UPDATE sessions SET status='revoked',revoked_at=? WHERE user_id=? AND status='active'").bind(input.now,input.accountId).run();
      this.database.exec("COMMIT");
    } catch (error) { this.database.exec("ROLLBACK"); throw error; }
  }

  async verifyEmailToken(tokenHash: string, now: number): Promise<string | null> {
    const token = this.database.prepare(`SELECT id,user_id AS userId FROM email_verification_tokens WHERE token_hash=? AND consumed_at IS NULL AND expires_at>? LIMIT 1`)
      .bind(tokenHash,now).first<{ id: string; userId: string }>();
    if (!token) return null;
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const consumed = this.database.prepare("UPDATE email_verification_tokens SET consumed_at=? WHERE id=? AND consumed_at IS NULL AND expires_at>?")
        .bind(now,token.id,now).run();
      if (!consumed.meta.changes) throw new Error("TOKEN_ALREADY_USED");
      this.database.prepare("UPDATE users SET email_verified_at=?,updated_at=? WHERE id=?").bind(now,now,token.userId).run();
      this.database.exec("COMMIT");
      return token.userId;
    } catch (error) { this.database.exec("ROLLBACK"); throw error; }
  }
}
