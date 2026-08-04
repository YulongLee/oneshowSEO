import { NextResponse } from "next/server";
import { consumeRateLimit,getCurrentUser,getDatabase,writeAudit } from "../../../lib/auth";
import { approvalDeadline,approvalRisk,ensureApprovalSchema,type ApprovalAction } from "../../../lib/approvals";

type ApprovalRow={id:string;projectId:string;projectName:string;projectHost:string;type:string;title:string;description:string;priority:number;status:string;createdAt:number;updatedAt:number;category:string|null;severity:string|null;evidence:string|null;url:string|null;lastAction:ApprovalAction|null;lastNote:string|null;scheduledFor:number|null;decisionAt:number|null};

export async function GET(){
 const user=await getCurrentUser();if(!user)return NextResponse.json({error:"请先登录"},{status:401});
 await ensureApprovalSchema();
 const rows=getDatabase().prepare(`
  SELECT t.id,t.project_id AS projectId,p.name AS projectName,p.host AS projectHost,t.type,t.title,t.description,t.priority,t.status,t.created_at AS createdAt,t.updated_at AS updatedAt,
   f.category,f.severity,f.evidence,f.url,
   d.action AS lastAction,d.note AS lastNote,d.scheduled_for AS scheduledFor,d.created_at AS decisionAt
  FROM seo_tasks t JOIN projects p ON p.id=t.project_id
  LEFT JOIN findings f ON f.id=t.finding_id
  LEFT JOIN approval_decisions d ON d.id=(SELECT id FROM approval_decisions WHERE task_id=t.id ORDER BY created_at DESC LIMIT 1)
  WHERE p.user_id=? AND t.requires_approval=1
  ORDER BY CASE WHEN t.status='proposed' THEN 0 ELSE 1 END,t.priority DESC,t.updated_at DESC LIMIT 250
 `).bind(user.id).all<ApprovalRow>().results;
 const items=rows.map(row=>({...row,risk:approvalRisk(row.priority),deadline:approvalDeadline(row.createdAt)}));
 const now=Math.floor(Date.now()/1000),todayStart=Math.floor(new Date(new Date().getFullYear(),new Date().getMonth(),new Date().getDate()).getTime()/1000);
 return NextResponse.json({items,summary:{pending:items.filter(i=>i.status==="proposed"&&i.lastAction!=="schedule").length,highRisk:items.filter(i=>i.status==="proposed"&&i.risk==="high").length,expiringSoon:items.filter(i=>i.status==="proposed"&&i.deadline>now&&i.deadline<=now+86400).length,approvedToday:items.filter(i=>i.status==="approved"&&(i.decisionAt||0)>=todayStart).length,scheduled:items.filter(i=>i.lastAction==="schedule"&&i.status==="approved").length},capabilities:{directPublish:false,automationRules:false}});
}

export async function POST(request:Request){
 const user=await getCurrentUser();if(!user)return NextResponse.json({error:"请先登录"},{status:401});
 if(await consumeRateLimit("approval_decision",user.id,request,30,60))return NextResponse.json({error:"操作过于频繁，请稍后再试"},{status:429});
 const body=await request.json().catch(()=>null) as {taskId?:string;action?:ApprovalAction;note?:string;scheduledFor?:number}|null;
 if(!body?.taskId||!body.action||!["approve","reject","request_changes","defer","schedule"].includes(body.action))return NextResponse.json({error:"审批参数无效"},{status:400});
 await ensureApprovalSchema();const db=getDatabase(),now=Math.floor(Date.now()/1000);
 const task=db.prepare("SELECT t.id,t.status,t.type FROM seo_tasks t JOIN projects p ON p.id=t.project_id WHERE t.id=? AND p.user_id=? AND t.requires_approval=1").bind(body.taskId,user.id).first<{id:string;status:string;type:string}>();
 if(!task||task.status!=="proposed")return NextResponse.json({error:"审批项不存在或状态已经变化"},{status:409});
 if(body.action==="request_changes"&&!body.note?.trim())return NextResponse.json({error:"请求修改时请填写具体说明"},{status:400});
 if(body.action==="schedule"&&(!body.scheduledFor||body.scheduledFor<=now))return NextResponse.json({error:"请选择未来的执行时间"},{status:400});
 const nextStatus=body.action==="approve"||body.action==="schedule"?"approved":body.action==="reject"?"dismissed":"proposed";
 if(nextStatus!=="proposed")db.prepare("UPDATE seo_tasks SET status=?,updated_at=? WHERE id=? AND status='proposed'").bind(nextStatus,now,task.id).run();
 db.prepare("INSERT INTO approval_decisions (id,task_id,user_id,action,note,scheduled_for,created_at) VALUES (?,?,?,?,?,?,?)").bind(crypto.randomUUID(),task.id,user.id,body.action,(body.note||"").trim().slice(0,1000)||null,body.action==="schedule"?body.scheduledFor||null:null,now).run();
 await writeAudit("approval_decision",user.id,request,JSON.stringify({taskId:task.id,action:body.action,scheduledFor:body.scheduledFor||null}));
 return NextResponse.json({ok:true,status:nextStatus,publishQueued:body.action==="approve"&&task.type.startsWith("publish_")});
}
