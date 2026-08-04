import type { OrganizationRoleKey } from "../identity/authorization";

export const customerTeamRoles = ["admin","seo_manager","content_manager","editor","writer","analyst","viewer"] as const;
export type CustomerTeamRole = typeof customerTeamRoles[number];
export type MembershipStatus = "active"|"suspended"|"revoked";

export class TeamGovernanceError extends Error {
  constructor(readonly code:"INVALID_REQUEST"|"CONFLICT"|"NOT_FOUND"|"OWNER_REQUIRED"|"VERSION_CONFLICT", message:string, readonly status:number){super(message);}
}

export function isCustomerTeamRole(value:unknown): value is CustomerTeamRole {
  return typeof value==="string" && customerTeamRoles.includes(value as CustomerTeamRole);
}

export function parseTeamListQuery(url:string){
  const params=new URL(url).searchParams;
  const page=Math.max(1,Math.min(100000,Number.parseInt(params.get("page")||"1",10)||1));
  const pageSize=Math.max(5,Math.min(100,Number.parseInt(params.get("pageSize")||"20",10)||20));
  const query=(params.get("query")||"").trim().slice(0,100);
  const role=params.get("role")||"all";
  const status=params.get("status")||"all";
  const teamId=(params.get("teamId")||"").trim().slice(0,100);
  if(role!=="all"&&role!=="owner"&&!isCustomerTeamRole(role))throw new TeamGovernanceError("INVALID_REQUEST","角色筛选无效",400);
  if(!["all","active","suspended","revoked"].includes(status))throw new TeamGovernanceError("INVALID_REQUEST","状态筛选无效",400);
  return {page,pageSize,query,role,status,teamId};
}

export function normalizeTeamName(value:unknown){
  const name=typeof value==="string"?value.trim().replace(/\s+/g," ").slice(0,80):"";
  if(name.length<2)throw new TeamGovernanceError("INVALID_REQUEST","团队名称至少需要 2 个字符",400);
  return name;
}

export function normalizeProjectScope(value:unknown,projectId:string){
  if(value===undefined)return [projectId];
  if(!Array.isArray(value))throw new TeamGovernanceError("INVALID_REQUEST","项目权限范围无效",400);
  const scope=[...new Set(value.filter((item):item is string=>typeof item==="string"&&item.length>0&&item.length<=100))].slice(0,50);
  return scope;
}

export function accessLevelForRole(role:OrganizationRoleKey){
  if(role==="owner"||role==="admin"||role==="seo_manager")return "manager" as const;
  if(role==="content_manager"||role==="editor")return "editor" as const;
  if(role==="viewer"||role==="analyst")return "viewer" as const;
  return "contributor" as const;
}

export function assertExpectedVersion(expected:unknown,current:number){
  if(expected===undefined)return;
  const version=Number(expected);
  if(!Number.isInteger(version)||version<1)throw new TeamGovernanceError("INVALID_REQUEST","成员版本无效",400);
  if(version!==current)throw new TeamGovernanceError("VERSION_CONFLICT","成员信息已被其他操作更新，请刷新后重试",409);
}
