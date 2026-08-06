export type OperatorRole="platform_admin"|"support"|"finance"|"operations"|"security";
export type OperatorPermission="tenants.read"|"users.read"|"entitlements.read"|"ledger.read"|"ledger.reconcile"|"providers.read"|"jobs.read"|"jobs.recover"|"flags.read"|"flags.manage"|"incidents.read"|"incidents.manage"|"notifications.read"|"audit.read"|"sessions.revoke"|"credentials.revoke"|"retention.manage"|"exports.manage";
export type OperatorAssignment={id:string;accountId:string;role:OperatorRole;organizationScopes:"*"|string[];projectScopes:"*"|string[];active:boolean;grantedByAccountId:string;grantedAt:number;revokedAt:number|null};
export type ElevatedAction={id:string;actorAccountId:string;actorRole:OperatorRole;permission:OperatorPermission;organizationId:string|null;projectId:string|null;targetType:string;targetId:string|null;reason:string|null;outcome:"success"|"denied"|"failed";correlationId:string;metadata:Record<string,unknown>;occurredAt:number};
export interface OperatorAdministrationRepository{assignments(accountId:string):OperatorAssignment[];appendAction(action:ElevatedAction):void;}

const grants:Record<OperatorRole,ReadonlySet<OperatorPermission|"*">>={
 platform_admin:new Set(["*"]),
 support:new Set(["tenants.read","users.read","entitlements.read","providers.read","jobs.read","jobs.recover","incidents.read","notifications.read","audit.read"]),
 finance:new Set(["tenants.read","entitlements.read","ledger.read","ledger.reconcile","audit.read"]),
 operations:new Set(["tenants.read","entitlements.read","providers.read","jobs.read","jobs.recover","flags.read","flags.manage","incidents.read","incidents.manage","notifications.read","audit.read"]),
 security:new Set(["tenants.read","users.read","providers.read","incidents.read","incidents.manage","audit.read","sessions.revoke","credentials.revoke","retention.manage","exports.manage"]),
};
const reasonRequired=new Set<OperatorPermission>(["ledger.reconcile","jobs.recover","flags.manage","incidents.manage","sessions.revoke","credentials.revoke","retention.manage","exports.manage"]);
const sensitive=/secret|token|password|authorization|cookie|content/i;
const safeMetadata=(value:Record<string,unknown>)=>Object.fromEntries(Object.entries(value).map(([key,item])=>[key,sensitive.test(key)||typeof item==="string"&&/(bearer\s+|osseo_live_|whsec_)/i.test(item)?"[REDACTED]":item]));
export class OperatorAuthorizationError extends Error{constructor(readonly code:"OPERATOR_FORBIDDEN"|"OPERATOR_SCOPE_MISMATCH"|"ACTION_REASON_REQUIRED",message:string){super(message);}}
export class OperatorAdministrationService{
 constructor(private readonly repository:OperatorAdministrationRepository,private readonly now=()=>Math.floor(Date.now()/1000)){}
 authorize(input:{actorAccountId:string;accountRole:"user"|"admin";permission:OperatorPermission;organizationId?:string|null;projectId?:string|null;reason?:string|null;targetType:string;targetId?:string|null;correlationId:string;metadata?:Record<string,unknown>}):{role:OperatorRole;record:(outcome:ElevatedAction["outcome"],metadata?:Record<string,unknown>)=>ElevatedAction}{
  const assignment=input.accountRole==="admin"?({role:"platform_admin",organizationScopes:"*",projectScopes:"*"}as const):this.repository.assignments(input.actorAccountId).find(item=>item.active&&grants[item.role].has(input.permission));
  const role=assignment?.role;if(!role||(!grants[role].has("*")&&!grants[role].has(input.permission)))throw new OperatorAuthorizationError("OPERATOR_FORBIDDEN","没有后台操作权限");
  const organizationId=input.organizationId??null,projectId=input.projectId??null;
  if(organizationId&&assignment.organizationScopes!=="*"&&!assignment.organizationScopes.includes(organizationId))throw new OperatorAuthorizationError("OPERATOR_SCOPE_MISMATCH","目标租户不在授权范围内");
  if(projectId&&assignment.projectScopes!=="*"&&!assignment.projectScopes.includes(projectId))throw new OperatorAuthorizationError("OPERATOR_SCOPE_MISMATCH","目标项目不在授权范围内");
  const reason=input.reason?.trim()||null;if(reasonRequired.has(input.permission)&&(!reason||reason.length<8||reason.length>500))throw new OperatorAuthorizationError("ACTION_REASON_REQUIRED","敏感后台操作必须填写 8–500 字理由");
  return{role,record:(outcome,metadata={})=>{const action:ElevatedAction={id:crypto.randomUUID(),actorAccountId:input.actorAccountId,actorRole:role,permission:input.permission,organizationId,projectId,targetType:input.targetType,targetId:input.targetId??null,reason,outcome,correlationId:input.correlationId,metadata:safeMetadata({...input.metadata,...metadata}),occurredAt:this.now()};this.repository.appendAction(action);return action;}};
 }
}
export function operatorPermissions(role:OperatorRole){return grants[role];}
