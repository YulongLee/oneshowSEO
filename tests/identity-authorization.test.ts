import assert from "node:assert/strict";
import test from "node:test";
import { AuthorizationError, authorizeOrganization, authorizePlatform, authorizePlatformAccount, can, permissions, permissionsForRole, platformRoleForAccount, type OrganizationRoleKey } from "../platform/modules/identity/authorization";

test("commercial organization roles expose explicit least-privilege grants",()=>{
  const roles:OrganizationRoleKey[]=["owner","admin","seo_manager","content_manager","editor","writer","analyst","viewer","support","finance","operations","security"];
  for(const role of roles) assert.ok(permissionsForRole(role).size>0,`${role} must have explicit permissions`);
  assert.equal(can("owner",permissions.organizationDelete),true);
  assert.equal(can("viewer",permissions.projectsRead),true);
  assert.equal(can("viewer",permissions.projectsUpdate),false);
  assert.equal(can("writer",permissions.contentEdit),true);
  assert.equal(can("writer",permissions.contentPublish),false);
  assert.equal(can("finance",permissions.billingManage),true);
  assert.equal(can("finance",permissions.contentRead),false);
  assert.equal(can("security",permissions.securitySessions),true);
  assert.equal(can("support",permissions.operationsManage),false);
});

test("organization authorization rejects cross-tenant identifiers before permission evaluation",()=>{
  assert.throws(()=>authorizeOrganization({role:"owner",permission:permissions.projectsRead,activeOrganizationId:"org-a",resourceOrganizationId:"org-b"}),
    (error:unknown)=>error instanceof AuthorizationError&&error.code==="TENANT_MISMATCH");
  assert.throws(()=>authorizeOrganization({role:"viewer",permission:permissions.projectsUpdate,activeOrganizationId:"org-a",resourceOrganizationId:"org-a"}),
    (error:unknown)=>error instanceof AuthorizationError&&error.code==="FORBIDDEN");
});

test("platform administration is independent from customer organization roles",()=>{
  assert.doesNotThrow(()=>authorizePlatform("platform_admin",permissions.platformAdmin));
  assert.throws(()=>authorizePlatform("owner",permissions.platformAdmin),AuthorizationError);
  assert.throws(()=>authorizePlatform("platform_admin",permissions.projectsUpdate),AuthorizationError);
  assert.equal(platformRoleForAccount("admin"),"platform_admin");
  assert.equal(platformRoleForAccount("user"),null);
  assert.doesNotThrow(()=>authorizePlatformAccount("admin"));
  assert.throws(()=>authorizePlatformAccount("user"),AuthorizationError);
});

test("commercial role matrix protects sensitive organization capabilities",()=>{
  const roles:OrganizationRoleKey[]=["owner","admin","seo_manager","content_manager","editor","writer","analyst","viewer","support","finance","operations","security"];
  const expected: Array<[typeof permissions[keyof typeof permissions],OrganizationRoleKey[]]> = [
    [permissions.membersManage,["owner","admin"]],
    [permissions.projectsDelete,["owner","admin"]],
    [permissions.contentPublish,["owner","admin","content_manager"]],
    [permissions.reportsExport,["owner","admin","seo_manager","analyst"]],
    [permissions.billingManage,["owner","finance"]],
    [permissions.apiManage,["owner","admin"]],
    [permissions.operationsManage,["owner","operations"]],
    [permissions.securitySessions,["owner","security"]],
  ];
  for(const [permission,allowed] of expected){
    for(const role of roles)assert.equal(can(role,permission),allowed.includes(role),`${role}:${permission}`);
  }
});
