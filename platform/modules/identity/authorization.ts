export const permissions = {
  organizationRead:"organization.read",organizationUpdate:"organization.update",organizationDelete:"organization.delete",
  membersRead:"members.read",membersInvite:"members.invite",membersManage:"members.manage",
  projectsRead:"projects.read",projectsCreate:"projects.create",projectsUpdate:"projects.update",projectsDelete:"projects.delete",
  auditsRead:"audits.read",auditsRun:"audits.run",researchRead:"research.read",researchRun:"research.run",
  keywordsRead:"keywords.read",keywordsManage:"keywords.manage",contentRead:"content.read",contentCreate:"content.create",
  contentEdit:"content.edit",contentReview:"content.review",contentPublish:"content.publish",
  approvalsRead:"approvals.read",approvalsDecide:"approvals.decide",integrationsRead:"integrations.read",integrationsManage:"integrations.manage",
  reportsRead:"reports.read",reportsExport:"reports.export",billingRead:"billing.read",billingManage:"billing.manage",
  apiRead:"api.read",apiManage:"api.manage",securityAudit:"security.audit",securitySessions:"security.sessions",
  operationsRead:"operations.read",operationsManage:"operations.manage",platformAdmin:"platform.admin",
} as const;

export type Permission = typeof permissions[keyof typeof permissions];
export type OrganizationRoleKey = "owner"|"admin"|"seo_manager"|"content_manager"|"editor"|"writer"|"analyst"|"viewer"|"support"|"finance"|"operations"|"security";
export type PlatformRoleKey = "platform_admin";

const readOnly: Permission[] = [permissions.organizationRead,permissions.projectsRead,permissions.auditsRead,permissions.researchRead,permissions.keywordsRead,permissions.contentRead,permissions.reportsRead];
const rolePermissions: Record<OrganizationRoleKey,ReadonlySet<Permission|"*">> = {
  owner:new Set(["*"]),
  admin:new Set([permissions.organizationRead,permissions.organizationUpdate,permissions.membersRead,permissions.membersInvite,permissions.membersManage,permissions.projectsRead,permissions.projectsCreate,permissions.projectsUpdate,permissions.projectsDelete,permissions.auditsRead,permissions.auditsRun,permissions.researchRead,permissions.researchRun,permissions.keywordsRead,permissions.keywordsManage,permissions.contentRead,permissions.contentCreate,permissions.contentEdit,permissions.contentReview,permissions.contentPublish,permissions.approvalsRead,permissions.approvalsDecide,permissions.integrationsRead,permissions.integrationsManage,permissions.reportsRead,permissions.reportsExport,permissions.apiRead,permissions.apiManage]),
  seo_manager:new Set([permissions.organizationRead,permissions.membersRead,permissions.projectsRead,permissions.projectsCreate,permissions.projectsUpdate,permissions.auditsRead,permissions.auditsRun,permissions.researchRead,permissions.researchRun,permissions.keywordsRead,permissions.keywordsManage,permissions.contentRead,permissions.contentCreate,permissions.contentEdit,permissions.contentReview,permissions.approvalsRead,permissions.approvalsDecide,permissions.integrationsRead,permissions.reportsRead,permissions.reportsExport]),
  content_manager:new Set([permissions.organizationRead,permissions.membersRead,permissions.projectsRead,permissions.researchRead,permissions.keywordsRead,permissions.keywordsManage,permissions.contentRead,permissions.contentCreate,permissions.contentEdit,permissions.contentReview,permissions.contentPublish,permissions.approvalsRead,permissions.approvalsDecide,permissions.reportsRead]),
  editor:new Set([permissions.organizationRead,permissions.projectsRead,permissions.researchRead,permissions.keywordsRead,permissions.contentRead,permissions.contentCreate,permissions.contentEdit,permissions.contentReview,permissions.approvalsRead]),
  writer:new Set([permissions.organizationRead,permissions.projectsRead,permissions.researchRead,permissions.keywordsRead,permissions.contentRead,permissions.contentCreate,permissions.contentEdit]),
  analyst:new Set([...readOnly,permissions.reportsExport]),
  viewer:new Set(readOnly),
  support:new Set([permissions.organizationRead,permissions.membersRead,permissions.projectsRead,permissions.auditsRead,permissions.reportsRead,permissions.operationsRead]),
  finance:new Set([permissions.organizationRead,permissions.billingRead,permissions.billingManage,permissions.reportsRead]),
  operations:new Set([permissions.organizationRead,permissions.projectsRead,permissions.auditsRead,permissions.researchRead,permissions.integrationsRead,permissions.operationsRead,permissions.operationsManage,permissions.reportsRead]),
  security:new Set([permissions.organizationRead,permissions.membersRead,permissions.projectsRead,permissions.integrationsRead,permissions.apiRead,permissions.securityAudit,permissions.securitySessions,permissions.operationsRead]),
};

export class AuthorizationError extends Error {
  constructor(readonly code:"FORBIDDEN"|"TENANT_MISMATCH",message="没有执行此操作的权限",readonly status=403){super(message);}
}

export function permissionsForRole(role: OrganizationRoleKey): ReadonlySet<Permission|"*"> { return rolePermissions[role]; }

export function can(role: OrganizationRoleKey, permission: Permission): boolean {
  const granted=rolePermissions[role];
  return granted.has("*")||granted.has(permission);
}

export function authorizeOrganization(input:{role:OrganizationRoleKey;permission:Permission;activeOrganizationId:string;resourceOrganizationId:string}):void{
  if(input.activeOrganizationId!==input.resourceOrganizationId) throw new AuthorizationError("TENANT_MISMATCH");
  if(!can(input.role,input.permission)) throw new AuthorizationError("FORBIDDEN");
}

export function authorizePlatform(role:PlatformRoleKey|OrganizationRoleKey,permission:Permission):void{
  if(role!=="platform_admin"||permission!==permissions.platformAdmin) throw new AuthorizationError("FORBIDDEN");
}

export function platformRoleForAccount(accountRole: "user"|"admin"): PlatformRoleKey|null {
  return accountRole === "admin" ? "platform_admin" : null;
}

export function authorizePlatformAccount(accountRole: "user"|"admin"): void {
  const platformRole = platformRoleForAccount(accountRole);
  if (!platformRole) throw new AuthorizationError("FORBIDDEN");
  authorizePlatform(platformRole, permissions.platformAdmin);
}
