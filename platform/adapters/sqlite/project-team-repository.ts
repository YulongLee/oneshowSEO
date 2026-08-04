import type {AppDatabase} from "../../../lib/database";
import {accessLevelForRole,assertExpectedVersion,TeamGovernanceError,type CustomerTeamRole,type MembershipStatus} from "../../modules/projects/team-governance";
import {permissionsForRole,type OrganizationRoleKey} from "../../modules/identity/authorization";

type ListInput={organizationId:string;projectId:string;query:string;role:string;status:string;teamId:string;page:number;pageSize:number;seatLimit:number};
type MemberRow={id:string;userId:string;name:string;email:string;role:string;status:MembershipStatus;lastActiveAt:number|null;joinedAt:number;projectScopeJson:string;version:number;teamsJson:string};

export class SqliteProjectTeamRepository{
 constructor(private readonly database:AppDatabase){}

 private scopedMembershipClause(alias="m"){return `(${alias}.project_scope='[]' OR EXISTS (SELECT 1 FROM json_each(${alias}.project_scope) scope WHERE scope.value=?))`;}

 list(input:ListInput){
  const where=["m.organization_id=?",this.scopedMembershipClause()];const bindings:unknown[]=[input.organizationId,input.projectId];
  if(input.query){where.push("(lower(u.name) LIKE ? OR lower(u.email) LIKE ?)");const term=`%${input.query.toLowerCase()}%`;bindings.push(term,term);}
  if(input.role!=="all"){where.push("r.role_key=?");bindings.push(input.role);}
  if(input.status!=="all"){where.push("m.status=?");bindings.push(input.status);}
  if(input.teamId){where.push("EXISTS (SELECT 1 FROM project_team_members ftm JOIN project_teams ft ON ft.id=ftm.team_id WHERE ftm.membership_id=m.id AND ft.id=? AND ft.organization_id=? AND (ft.project_id IS NULL OR ft.project_id=?))");bindings.push(input.teamId,input.organizationId,input.projectId);}
  const sqlWhere=where.join(" AND ");
  const total=Number(this.database.prepare(`SELECT COUNT(*) AS count FROM identity_memberships m JOIN users u ON u.id=m.user_id JOIN identity_roles r ON r.id=m.role_id WHERE ${sqlWhere}`).bind(...bindings).first<{count:number}>()?.count||0);
  const offset=(input.page-1)*input.pageSize;
  const rows=this.database.prepare(`
    SELECT m.id,u.id AS userId,u.name,u.email,r.role_key AS role,m.status,u.last_login_at AS lastActiveAt,
      COALESCE(m.joined_at,m.created_at) AS joinedAt,m.project_scope AS projectScopeJson,m.version,
      COALESCE((SELECT json_group_array(json_object('id',t.id,'name',t.name)) FROM project_team_members tm JOIN project_teams t ON t.id=tm.team_id WHERE tm.membership_id=m.id AND t.organization_id=m.organization_id AND t.status='active' AND (t.project_id IS NULL OR t.project_id=?)),'[]') AS teamsJson
    FROM identity_memberships m JOIN users u ON u.id=m.user_id JOIN identity_roles r ON r.id=m.role_id
    WHERE ${sqlWhere} ORDER BY CASE r.role_key WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,lower(u.name),m.created_at LIMIT ? OFFSET ?
  `).bind(input.projectId,...bindings,input.pageSize,offset).all<MemberRow>().results;
  const members=rows.map(row=>{let projectScope:string[]=[];let teams:Array<{id:string;name:string}>=[];try{projectScope=JSON.parse(row.projectScopeJson);}catch{}try{teams=JSON.parse(row.teamsJson);}catch{}return{id:row.id,userId:row.userId,name:row.name,email:row.email,role:row.role,status:row.status,lastActiveAt:row.lastActiveAt,joinedAt:row.joinedAt,version:row.version,owner:row.role==="owner",projectAccess:projectScope.length?"current_project":"all_projects",teams};});
  const now=Math.floor(Date.now()/1000);
  this.database.prepare("UPDATE identity_invitations SET status='expired',updated_at=? WHERE organization_id=? AND status='pending' AND expires_at<=?").bind(now,input.organizationId,now).run();
  const invitationRows=this.database.prepare(`SELECT id,email,role_key AS role,status,expires_at AS expiresAt,project_scope AS projectScopeJson,created_at AS createdAt FROM identity_invitations WHERE organization_id=? AND status='pending' AND expires_at>? ORDER BY created_at DESC`).bind(input.organizationId,now).all<{id:string;email:string;role:string;status:string;expiresAt:number;projectScopeJson:string;createdAt:number}>().results;
  const invites=invitationRows.flatMap(row=>{let scope:string[]=[];try{scope=JSON.parse(row.projectScopeJson);}catch{}return scope.length===0||scope.includes(input.projectId)?[{id:row.id,email:row.email,role:row.role,status:row.status,expiresAt:row.expiresAt,projectScope:scope,createdAt:row.createdAt}]:[];});
  const used=Number(this.database.prepare("SELECT COUNT(*) AS count FROM identity_memberships WHERE organization_id=? AND status='active'").bind(input.organizationId).first<{count:number}>()?.count||0);
  const pending=Number(this.database.prepare("SELECT COUNT(*) AS count FROM identity_invitations WHERE organization_id=? AND status='pending' AND expires_at>?").bind(input.organizationId,now).first<{count:number}>()?.count||0);
  const summaryRows=this.database.prepare(`SELECT r.role_key AS role,COUNT(*) AS count,SUM(CASE WHEN m.status='active' THEN 1 ELSE 0 END) AS activeCount FROM identity_memberships m JOIN identity_roles r ON r.id=m.role_id WHERE m.organization_id=? AND m.status!='revoked' AND ${this.scopedMembershipClause()} GROUP BY r.role_key`).bind(input.organizationId,input.projectId).all<{role:string;count:number;activeCount:number}>().results;
  const roleDistribution=Object.fromEntries(summaryRows.map(row=>[row.role,Number(row.count)]));const activeMembers=summaryRows.reduce((sum,row)=>sum+Number(row.activeCount),0);
  const teams=this.database.prepare(`SELECT t.id,t.name,t.description,t.status,t.version,t.project_id AS projectId,t.created_at AS createdAt,t.updated_at AS updatedAt,COUNT(tm.membership_id) AS memberCount FROM project_teams t LEFT JOIN project_team_members tm ON tm.team_id=t.id WHERE t.organization_id=? AND t.status='active' AND (t.project_id IS NULL OR t.project_id=?) GROUP BY t.id ORDER BY lower(t.name)`).bind(input.organizationId,input.projectId).all().results;
  const activities=this.database.prepare(`SELECT e.id,e.action,e.target_type AS targetType,e.target_id AS targetId,e.metadata,e.created_at AS createdAt,u.name AS actorName FROM team_activity_events e LEFT JOIN users u ON u.id=e.actor_user_id WHERE e.organization_id=? AND (e.project_id IS NULL OR e.project_id=?) ORDER BY e.created_at DESC,e.rowid DESC LIMIT 50`).bind(input.organizationId,input.projectId).all<{id:string;action:string;targetType:string;targetId:string|null;metadata:string;createdAt:number;actorName:string|null}>().results.map(row=>{let metadata:Record<string,unknown>={};try{metadata=JSON.parse(row.metadata);}catch{}return{...row,metadata};});
  return {members,invites,teams,activities,seats:{used,pending,limit:input.seatLimit},summary:{activeMembers,roleDistribution},pagination:{page:input.page,pageSize:input.pageSize,total,totalPages:Math.max(1,Math.ceil(total/input.pageSize))}};
 }

 createTeam(input:{organizationId:string;projectId:string;name:string;description:string;actorUserId:string}){
  const now=Math.floor(Date.now()/1000),id=crypto.randomUUID();
  try{this.database.prepare(`INSERT INTO project_teams (id,organization_id,project_id,name,description,status,version,created_by,created_at,updated_at) VALUES (?,?,?,?,?,'active',1,?,?,?)`).bind(id,input.organizationId,input.projectId,input.name,input.description.slice(0,300),input.actorUserId,now,now).run();}
  catch{throw new TeamGovernanceError("CONFLICT","当前项目已有同名团队",409);}
  this.activity(input.organizationId,input.projectId,input.actorUserId,"team_created","team",id,{name:input.name},now);return{id,name:input.name,description:input.description,status:"active",version:1,memberCount:0,createdAt:now,updatedAt:now};
 }

 updateMembership(input:{organizationId:string;projectId:string;membershipId:string;actorUserId:string;role?:CustomerTeamRole;status?:MembershipStatus;projectScope?:string[];teamIds?:string[];expectedVersion?:unknown}){
  const current=this.database.prepare(`SELECT m.id,m.status,m.project_scope AS projectScope,m.version,r.role_key AS role FROM identity_memberships m JOIN identity_roles r ON r.id=m.role_id WHERE m.id=? AND m.organization_id=? LIMIT 1`).bind(input.membershipId,input.organizationId).first<{id:string;status:MembershipStatus;projectScope:string;version:number;role:OrganizationRoleKey}>();
  if(!current)throw new TeamGovernanceError("NOT_FOUND","成员不存在",404);if(current.role==="owner")throw new TeamGovernanceError("OWNER_REQUIRED","所有者权限不可在此修改",409);assertExpectedVersion(input.expectedVersion,current.version);
  const now=Math.floor(Date.now()/1000);this.database.exec("BEGIN IMMEDIATE");
  try{
   let roleId:string|undefined;if(input.role){roleId=`role_${input.role}_${input.organizationId}`;this.database.prepare(`INSERT OR IGNORE INTO identity_roles (id,organization_id,role_key,name,permissions,is_system,created_at,updated_at) VALUES (?,?,?,?,?,1,?,?)`).bind(roleId,input.organizationId,input.role,input.role,JSON.stringify([...permissionsForRole(input.role)]),now,now).run();}
   const fields=["updated_at=?","version=version+1"],values:unknown[]=[now];if(roleId){fields.push("role_id=?");values.push(roleId);}if(input.status){fields.push("status=?");values.push(input.status);if(input.status==="suspended")fields.push("suspended_at="+now);if(input.status==="revoked")fields.push("revoked_at="+now);if(input.status==="active")fields.push("suspended_at=NULL","revoked_at=NULL");}if(input.projectScope){fields.push("project_scope=?");values.push(JSON.stringify(input.projectScope));}
   values.push(input.membershipId,input.organizationId,current.version);const changed=this.database.prepare(`UPDATE identity_memberships SET ${fields.join(",")} WHERE id=? AND organization_id=? AND version=?`).bind(...values).run();if(!changed.meta.changes)throw new TeamGovernanceError("VERSION_CONFLICT","成员信息已更新，请刷新后重试",409);
   if(input.status==="suspended"||input.status==="revoked")this.database.prepare("UPDATE sessions SET status='revoked',revoked_at=? WHERE membership_id=? AND status='active'").bind(now,input.membershipId).run();
   if(input.teamIds){this.database.prepare("DELETE FROM project_team_members WHERE membership_id=? AND team_id IN (SELECT id FROM project_teams WHERE organization_id=? AND (project_id IS NULL OR project_id=?))").bind(input.membershipId,input.organizationId,input.projectId).run();for(const teamId of [...new Set(input.teamIds)].slice(0,50)){const team=this.database.prepare("SELECT id FROM project_teams WHERE id=? AND organization_id=? AND status='active' AND (project_id IS NULL OR project_id=?)").bind(teamId,input.organizationId,input.projectId).first();if(team)this.database.prepare("INSERT OR IGNORE INTO project_team_members (team_id,membership_id,created_at) VALUES (?,?,?)").bind(teamId,input.membershipId,now).run();}}
   const effectiveRole=(input.role||current.role) as OrganizationRoleKey;const scope=input.projectScope??JSON.parse(current.projectScope) as string[];
   if(scope.length===0||scope.includes(input.projectId))this.database.prepare(`INSERT INTO project_access (id,organization_id,project_id,membership_id,access_level,granted_by,version,created_at,updated_at) VALUES (?,?,?,?,?,?,1,?,?) ON CONFLICT(project_id,membership_id) DO UPDATE SET access_level=excluded.access_level,granted_by=excluded.granted_by,version=project_access.version+1,updated_at=excluded.updated_at`).bind(`access_${input.projectId}_${input.membershipId}`,input.organizationId,input.projectId,input.membershipId,accessLevelForRole(effectiveRole),input.actorUserId,now,now).run();else this.database.prepare("DELETE FROM project_access WHERE project_id=? AND membership_id=? AND organization_id=?").bind(input.projectId,input.membershipId,input.organizationId).run();
   this.activity(input.organizationId,input.projectId,input.actorUserId,"membership_updated","membership",input.membershipId,{role:input.role,status:input.status,projectScope:input.projectScope,teamIds:input.teamIds},now);this.database.exec("COMMIT");return{version:current.version+1};
  }catch(error){this.database.exec("ROLLBACK");throw error;}
 }

 cancelInvitation(input:{organizationId:string;projectId:string;invitationId:string;actorUserId:string}){const now=Math.floor(Date.now()/1000);const changed=this.database.prepare("UPDATE identity_invitations SET status='cancelled',cancelled_at=?,updated_at=? WHERE id=? AND organization_id=? AND status='pending'").bind(now,now,input.invitationId,input.organizationId).run();if(!changed.meta.changes)throw new TeamGovernanceError("NOT_FOUND","邀请不存在或已处理",404);this.activity(input.organizationId,input.projectId,input.actorUserId,"invitation_cancelled","invitation",input.invitationId,{},now);}
 archiveTeam(input:{organizationId:string;projectId:string;teamId:string;actorUserId:string}){const now=Math.floor(Date.now()/1000);const changed=this.database.prepare("UPDATE project_teams SET status='archived',version=version+1,updated_at=? WHERE id=? AND organization_id=? AND project_id=? AND status='active'").bind(now,input.teamId,input.organizationId,input.projectId).run();if(!changed.meta.changes)throw new TeamGovernanceError("NOT_FOUND","团队不存在或已归档",404);this.activity(input.organizationId,input.projectId,input.actorUserId,"team_archived","team",input.teamId,{},now);}
 recordInvitation(input:{organizationId:string;projectId:string;actorUserId:string;invitationId:string;email:string;role:string}){this.activity(input.organizationId,input.projectId,input.actorUserId,"invitation_created","invitation",input.invitationId,{email:input.email,role:input.role},Math.floor(Date.now()/1000));}
 private activity(organizationId:string,projectId:string,actorUserId:string,action:string,targetType:string,targetId:string|null,metadata:Record<string,unknown>,createdAt:number){this.database.prepare("INSERT INTO team_activity_events (id,organization_id,project_id,actor_user_id,action,target_type,target_id,metadata,created_at) VALUES (?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(),organizationId,projectId,actorUserId,action,targetType,targetId,JSON.stringify(metadata),createdAt).run();}
}
