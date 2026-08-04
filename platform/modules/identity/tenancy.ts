import type { InitialOrganization, OrganizationContext } from "./authentication";

export type OrganizationSummary = OrganizationContext & {
  ownerUserId: string;
  defaultLocale: "zh-CN" | "en";
  timezone: string;
};

export type MembershipRecord = { id: string; organizationId: string; userId: string; roleKey: string; status: "active" | "suspended" | "revoked" };

export interface TenancyRepository {
  listOrganizations(userId: string): Promise<OrganizationSummary[]>;
  createOrganization(input: { userId: string; organization: InitialOrganization; locale: "zh-CN" | "en"; timezone: string; now: number }): Promise<void>;
  membership(membershipId: string): Promise<MembershipRecord | null>;
  activeOwnerCount(organizationId: string): Promise<number>;
}

export class TenancyError extends Error {
  constructor(readonly code: "INVALID_REQUEST" | "CONFLICT" | "OWNER_REQUIRED", message: string, readonly status: number) { super(message); }
}

function organizationSlug(name: string, id: string): string {
  const normalized = name.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,40);
  return `${normalized || "workspace"}-${id.replaceAll("-","").slice(0,8)}`;
}

export class TenancyService {
  constructor(private readonly repository: TenancyRepository) {}

  list(userId: string): Promise<OrganizationSummary[]> { return this.repository.listOrganizations(userId); }

  async create(input: { userId: string; name: unknown; locale: unknown; timezone: unknown }): Promise<OrganizationSummary> {
    const name = typeof input.name === "string" ? input.name.trim().slice(0,80) : "";
    if (name.length < 2) throw new TenancyError("INVALID_REQUEST","组织名称至少需要 2 个字符",400);
    const locale = input.locale === "en" ? "en" : "zh-CN";
    const timezone = typeof input.timezone === "string" && /^[A-Za-z_]+(?:\/[A-Za-z0-9_+\-]+)+$/.test(input.timezone) ? input.timezone : "Asia/Shanghai";
    const id = crypto.randomUUID();
    const organization: InitialOrganization = {id,slug:organizationSlug(name,id),name,roleId:crypto.randomUUID(),membershipId:crypto.randomUUID()};
    try { await this.repository.createOrganization({userId:input.userId,organization,locale,timezone,now:Math.floor(Date.now()/1000)}); }
    catch { throw new TenancyError("CONFLICT","组织创建失败，请更换名称后重试",409); }
    const created = (await this.repository.listOrganizations(input.userId)).find(item=>item.organizationId===id);
    if (!created) throw new TenancyError("CONFLICT","组织创建失败，请稍后重试",409);
    return created;
  }

  async assertOwnerCanBeChanged(membershipId: string): Promise<void> {
    const membership = await this.repository.membership(membershipId);
    if (!membership) throw new TenancyError("INVALID_REQUEST","成员身份不存在",404);
    if (membership.roleKey === "owner" && membership.status === "active" && await this.repository.activeOwnerCount(membership.organizationId) <= 1) {
      throw new TenancyError("OWNER_REQUIRED","组织必须保留至少一位有效 Owner",409);
    }
  }
}
