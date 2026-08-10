import { NextResponse } from "next/server";
import { consumeRateLimit,getCurrentUser,getDatabase,writeAudit } from "../../../lib/auth";
import { approvalDeadline,approvalRisk,ensureApprovalSchema,type ApprovalAction } from "../../../lib/approvals";
import { commerceService,commercialSubject,ensureBillingSchema } from "../../../lib/billing";
import { CommerceError } from "../../../platform/modules/commerce/service";
import { SqliteApprovalGovernanceRepository } from "../../../platform/adapters/sqlite/approval-governance-repository";
import { ApprovalOperationError,ApprovalOperationsService } from "../../../platform/modules/approvals/operations";
import { permissionsForRole,type OrganizationRoleKey } from "../../../platform/modules/identity/authorization";
import { queueApprovedPublish } from "../../../lib/publish-execution";

type ApprovalRow={id:string;projectId:string;projectName:string;projectHost:string;type:string;title:string;description:string;priority:number;status:string;createdAt:number;updatedAt:number;category:string|null;severity:string|null;evidence:string|null;url:string|null;lastAction:ApprovalAction|null;lastNote:string|null;scheduledFor:number|null;decisionAt:number|null};
type GovernedRow={id:string;taskId:string;projectId:string;projectName:string;projectHost:string;capability:string;agentKey:string;agentVersion:string;state:string;stateRevision:number;currentVersion:number;risk:"low"|"medium"|"high"|"critical";confidence:number;estimatedCost:number;expiresAt:number;createdAt:number;updatedAt:number;title:string;impactHypothesis:string;lastAction:string|null;lastNote:string|null;decisionAt:number|null;assignee:string|null};

export async function GET(){
 const user=await getCurrentUser();if(!user)return NextResponse.json({error:"请先登录"},{status:401});
 await ensureApprovalSchema();
 const db=getDatabase();new SqliteApprovalGovernanceRepository(db).ensureSchema();
 const governedRows=db.prepare(`
  SELECT r.id,r.task_id AS taskId,r.project_id AS projectId,p.name AS projectName,p.host AS projectHost,r.capability,r.agent_key AS agentKey,r.agent_version AS agentVersion,
   r.state,r.state_revision AS stateRevision,r.current_version AS currentVersion,r.risk,r.confidence,r.estimated_cost AS estimatedCost,r.expires_at AS expiresAt,r.created_at AS createdAt,r.updated_at AS updatedAt,
   v.title,v.impact_hypothesis AS impactHypothesis,d.decision AS lastAction,d.reason AS lastNote,d.created_at AS decisionAt,u.name AS assignee
  FROM approval_recommendations r JOIN projects p ON p.organization_id=r.organization_id AND p.id=r.project_id
  JOIN approval_recommendation_versions v ON v.recommendation_id=r.id AND v.version=r.current_version
  LEFT JOIN approval_governed_decisions d ON d.id=(SELECT id FROM approval_governed_decisions WHERE recommendation_id=r.id ORDER BY created_at DESC,rowid DESC LIMIT 1)
  LEFT JOIN approval_assignments a ON a.recommendation_id=r.id LEFT JOIN identity_memberships m ON m.id=a.membership_id LEFT JOIN users u ON u.id=m.user_id
  WHERE r.organization_id=? ORDER BY CASE WHEN r.state IN('pending','deferred','changes_requested') THEN 0 ELSE 1 END,r.expires_at,r.updated_at DESC LIMIT 250
 `).bind(user.organization.organizationId).all<GovernedRow>().results;
 const governedItems=governedRows.map(row=>{const evidenceRefs=db.prepare("SELECT id,kind,reference_id AS referenceId,digest,captured_at AS capturedAt,expires_at AS expiresAt,provenance_json AS provenance FROM approval_evidence_refs WHERE organization_id=? AND project_id=? AND recommendation_id=? ORDER BY captured_at DESC").bind(user.organization.organizationId,row.projectId,row.id).all<{id:string;kind:string;referenceId:string;digest:string;capturedAt:number;expiresAt:number;provenance:string}>().results.map(item=>({...item,provenance:JSON.parse(item.provenance)}));const changeSets=db.prepare("SELECT id,target_type AS targetType,target_ref AS targetRef,before_hash AS beforeHash,after_hash AS afterHash,operations_json AS operations,rollback_required AS rollbackRequired FROM approval_change_sets WHERE recommendation_id=? AND version=? ORDER BY id").bind(row.id,row.currentVersion).all<{id:string;targetType:string;targetRef:string;beforeHash:string;afterHash:string;operations:string;rollbackRequired:number}>().results.map(item=>({...item,operations:JSON.parse(item.operations),rollbackRequired:Boolean(item.rollbackRequired)}));return{...row,source:"governed" as const,type:row.capability,description:row.impactHypothesis,priority:row.risk==="critical"?100:row.risk==="high"?90:row.risk==="medium"?60:40,status:row.state,category:row.capability,severity:row.risk,evidence:evidenceRefs[0]?.referenceId??null,url:changeSets[0]?.targetRef??null,scheduledFor:null,deadline:row.expiresAt,evidenceRefs,changeSets}});
 const governedTaskIds=new Set(governedRows.map(row=>row.taskId));
 const rows=db.prepare(`
  SELECT t.id,t.project_id AS projectId,p.name AS projectName,p.host AS projectHost,t.type,t.title,t.description,t.priority,t.status,t.created_at AS createdAt,t.updated_at AS updatedAt,
   f.category,f.severity,f.evidence,f.url,
   d.action AS lastAction,d.note AS lastNote,d.scheduled_for AS scheduledFor,d.created_at AS decisionAt
  FROM seo_tasks t JOIN projects p ON p.id=t.project_id
  LEFT JOIN findings f ON f.id=t.finding_id
  LEFT JOIN approval_decisions d ON d.id=(SELECT id FROM approval_decisions WHERE task_id=t.id ORDER BY created_at DESC LIMIT 1)
  WHERE p.user_id=? AND t.requires_approval=1
  ORDER BY CASE WHEN t.status='proposed' THEN 0 ELSE 1 END,t.priority DESC,t.updated_at DESC LIMIT 250
 `).bind(user.id).all<ApprovalRow>().results;
 const items=[...governedItems,...rows.filter(row=>!governedTaskIds.has(row.id)).map(row=>({...row,source:"legacy" as const,risk:approvalRisk(row.priority),deadline:approvalDeadline(row.createdAt),confidence:null,estimatedCost:null,impactHypothesis:row.description,evidenceRefs:[],changeSets:[],assignee:null,stateRevision:null,currentVersion:null,agentKey:null,agentVersion:null}))];
 const now=Math.floor(Date.now()/1000),todayStart=Math.floor(new Date(new Date().getFullYear(),new Date().getMonth(),new Date().getDate()).getTime()/1000);
 const pending=(status:string)=>status==="proposed"||status==="pending"||status==="deferred"||status==="changes_requested";
 return NextResponse.json({items,summary:{pending:items.filter(i=>pending(i.status)&&i.lastAction!=="schedule").length,highRisk:items.filter(i=>pending(i.status)&&(i.risk==="high"||i.risk==="critical")).length,expiringSoon:items.filter(i=>pending(i.status)&&i.deadline>now&&i.deadline<=now+86400).length,approvedToday:items.filter(i=>["approved","executing","verified"].includes(i.status)&&(i.decisionAt||0)>=todayStart).length,scheduled:items.filter(i=>i.lastAction==="schedule"&&i.status==="approved").length},capabilities:{directPublish:false,automationRules:false}});
}

export async function POST(request:Request){
 const user=await getCurrentUser();if(!user)return NextResponse.json({error:"请先登录"},{status:401});
 if(await consumeRateLimit("approval_decision",user.id,request,30,60))return NextResponse.json({error:"操作过于频繁，请稍后再试"},{status:429});
 const body=await request.json().catch(()=>null) as {taskId?:string;source?:"governed"|"legacy";expectedStateRevision?:number|null;action?:ApprovalAction;note?:string;scheduledFor?:number}|null;
 if(!body?.taskId||!body.action||!["approve","reject","request_changes","defer","schedule"].includes(body.action))return NextResponse.json({error:"审批参数无效"},{status:400});
 if(body.action==="approve"||body.action==="schedule")try{await ensureBillingSchema();commerceService().authorizeAccess(commercialSubject(user));}catch(error){if(error instanceof CommerceError)return NextResponse.json({error:error.message,code:error.code},{status:error.status});throw error;}
 await ensureApprovalSchema();const db=getDatabase(),now=Math.floor(Date.now()/1000);
 if(body.source==="governed"){
  if(body.action==="schedule")return NextResponse.json({error:"治理审批请先批准，再由执行队列安排时间"},{status:400});
  const repository=new SqliteApprovalGovernanceRepository(db);repository.ensureSchema();
  const recommendationScope=db.prepare("SELECT project_id AS projectId FROM approval_recommendations WHERE id=? AND organization_id=?").bind(body.taskId,user.organization.organizationId).first<{projectId:string}>();
  if(!recommendationScope)return NextResponse.json({error:"审批项不存在"},{status:404});
  const projectId=recommendationScope.projectId;
  const membership=db.prepare("SELECT project_scope AS scope FROM identity_memberships WHERE id=? AND organization_id=? AND status='active'").bind(user.organization.membershipId,user.organization.organizationId).first<{scope:string}>();
  let scope:string[]=[];try{scope=JSON.parse(membership?.scope||"[]");}catch{}
  try{const result=new ApprovalOperationsService(repository,()=>now).decide({id:user.id,membershipId:user.organization.membershipId,kind:"human",organizationId:user.organization.organizationId,active:user.status==="active"&&user.organization.membershipStatus==="active",projectIds:scope.length?new Set(scope):"*",permissions:permissionsForRole(user.organization.roleKey as OrganizationRoleKey)},{organizationId:user.organization.organizationId,projectId,recommendationId:body.taskId,action:body.action,reason:(body.note||"").trim()||"用户在 Approval Center 确认此决策",expectedStateRevision:Number(body.expectedStateRevision),correlationId:`approval:${crypto.randomUUID()}`,policy:null});return NextResponse.json({ok:true,status:result.state,publishQueued:false});}catch(error){if(error instanceof ApprovalOperationError)return NextResponse.json({error:error.message,code:error.code},{status:error.status});throw error;}
 }
 const task=db.prepare("SELECT t.id,t.project_id AS projectId,t.status,t.type,p.language FROM seo_tasks t JOIN projects p ON p.id=t.project_id WHERE t.id=? AND p.organization_id=? AND t.requires_approval=1").bind(body.taskId,user.organization.organizationId).first<{id:string;projectId:string;status:string;type:string;language:string}>();
 if(!task||task.status!=="proposed")return NextResponse.json({error:"审批项不存在或状态已经变化"},{status:409});
 if(body.action==="request_changes"&&!body.note?.trim())return NextResponse.json({error:"请求修改时请填写具体说明"},{status:400});
 if(body.action==="schedule"&&(!body.scheduledFor||body.scheduledFor<=now))return NextResponse.json({error:"请选择未来的执行时间"},{status:400});
 let publishExecutionTaskId:string|null=null;if(task.type.startsWith("publish_")&&(body.action==="approve"||body.action==="schedule")){try{if(body.action==="schedule"&&body.scheduledFor)db.prepare("UPDATE publish_requests SET scheduled_for=?,updated_at=? WHERE id=? AND status='awaiting_approval'").bind(body.scheduledFor,now,task.id).run();const queued=await queueApprovedPublish({organizationId:user.organization.organizationId,projectId:task.projectId,requestId:task.id,accountId:user.id,role:user.organization.roleKey as OrganizationRoleKey,subject:commercialSubject(user),locale:task.language.startsWith("en")?"en":"zh-CN"});publishExecutionTaskId=queued.taskId;}catch(error){console.error("Failed to queue approved publication",error);return NextResponse.json({error:"发布执行任务创建失败，审批状态未改变",code:error instanceof Error?error.message:"PUBLISH_QUEUE_FAILED"},{status:409});}}
 const nextStatus=body.action==="approve"||body.action==="schedule"?"approved":body.action==="reject"?"dismissed":"proposed";
 if(nextStatus!=="proposed")db.prepare("UPDATE seo_tasks SET status=?,updated_at=? WHERE id=? AND status='proposed'").bind(nextStatus,now,task.id).run();
 if(task.type.startsWith("publish_")&&nextStatus==="dismissed")db.prepare("UPDATE publish_requests SET status='cancelled',error='PUBLISH_APPROVAL_REJECTED',updated_at=? WHERE id=? AND status='awaiting_approval'").bind(now,task.id).run();
 db.prepare("INSERT INTO approval_decisions (id,task_id,user_id,action,note,scheduled_for,created_at) VALUES (?,?,?,?,?,?,?)").bind(crypto.randomUUID(),task.id,user.id,body.action,(body.note||"").trim().slice(0,1000)||null,body.action==="schedule"?body.scheduledFor||null:null,now).run();
 await writeAudit("approval_decision",user.id,request,JSON.stringify({taskId:task.id,action:body.action,scheduledFor:body.scheduledFor||null}));
 return NextResponse.json({ok:true,status:nextStatus,publishQueued:Boolean(publishExecutionTaskId),publishExecutionTaskId});
}
