import type { AppDatabase } from "../../../lib/database";
import type { InitialOrganization } from "../../modules/identity/authentication";
import type { MembershipRecord, OrganizationSummary, TenancyRepository } from "../../modules/identity/tenancy";

export class SqliteTenancyRepository implements TenancyRepository {
  constructor(private readonly database: AppDatabase) {}

  async listOrganizations(userId: string): Promise<OrganizationSummary[]> {
    return this.database.prepare(`
      SELECT o.id AS organizationId,o.name AS organizationName,o.slug AS organizationSlug,o.status AS organizationStatus,
        o.owner_user_id AS ownerUserId,o.default_locale AS defaultLocale,o.timezone,
        m.id AS membershipId,m.status AS membershipStatus,r.role_key AS roleKey
      FROM identity_memberships m JOIN identity_organizations o ON o.id=m.organization_id
      JOIN identity_roles r ON r.id=m.role_id
      WHERE m.user_id=? AND m.status!='revoked' AND o.status!='suspended'
      ORDER BY m.joined_at,m.created_at
    `).bind(userId).all<OrganizationSummary>().results;
  }

  async createOrganization(input: { userId: string; organization: InitialOrganization; locale: "zh-CN" | "en"; timezone: string; now: number }): Promise<void> {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.database.prepare(`INSERT INTO identity_organizations (id,slug,name,status,default_locale,timezone,owner_user_id,created_at,updated_at) VALUES (?,?,?,'trial',?,?,?,?,?)`)
        .bind(input.organization.id,input.organization.slug,input.organization.name,input.locale,input.timezone,input.userId,input.now,input.now).run();
      this.database.prepare(`INSERT INTO identity_roles (id,organization_id,role_key,name,permissions,is_system,created_at,updated_at) VALUES (?,?,'owner','Owner','["*"]',1,?,?)`)
        .bind(input.organization.roleId,input.organization.id,input.now,input.now).run();
      this.database.prepare(`INSERT INTO identity_memberships (id,organization_id,user_id,role_id,status,joined_at,created_at,updated_at) VALUES (?,?,?,?,'active',?,?,?)`)
        .bind(input.organization.membershipId,input.organization.id,input.userId,input.organization.roleId,input.now,input.now,input.now).run();
      this.database.exec("COMMIT");
    } catch (error) { this.database.exec("ROLLBACK"); throw error; }
  }

  async membership(membershipId: string): Promise<MembershipRecord | null> {
    return this.database.prepare(`SELECT m.id,m.organization_id AS organizationId,m.user_id AS userId,r.role_key AS roleKey,m.status FROM identity_memberships m JOIN identity_roles r ON r.id=m.role_id WHERE m.id=? LIMIT 1`)
      .bind(membershipId).first<MembershipRecord>();
  }

  async activeOwnerCount(organizationId: string): Promise<number> {
    return Number(this.database.prepare(`SELECT COUNT(*) AS count FROM identity_memberships m JOIN identity_roles r ON r.id=m.role_id WHERE m.organization_id=? AND m.status='active' AND r.role_key='owner'`)
      .bind(organizationId).first<{count:number}>()?.count || 0);
  }
}
