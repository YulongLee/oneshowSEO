import { getDatabase,type AppUser } from "./auth";
import { ownedProject } from "./product";

export function contentProjectAllowed(user:AppUser,projectId:string) {
 const member=getDatabase().prepare("SELECT project_scope AS scope FROM identity_memberships WHERE id=? AND organization_id=? AND status='active'").bind(user.organization.membershipId,user.organization.organizationId).first<{scope:string}>();
 if(!member)return false;
 try{const scope:unknown=JSON.parse(member.scope);return Array.isArray(scope)&&(scope.length===0||scope.includes(projectId));}catch{return false;}
}
export async function accessibleContentProject(user:AppUser,projectId:string){
 if(!contentProjectAllowed(user,projectId))return null;
 return ownedProject(user.organization.organizationId,projectId);
}
