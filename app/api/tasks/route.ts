import { NextResponse } from "next/server";
import { getCurrentUser,getDatabase,writeAudit } from "../../../lib/auth";
import { ensureProductSchema, ownedProject } from "../../../lib/product";
export async function POST(request:Request){
 const user=await getCurrentUser(); if(!user)return NextResponse.json({error:"请先登录"},{status:401});
 const body=await request.json().catch(()=>null) as {projectId?:string;title?:string;keyword?:string;contentType?:string;knowledgeType?:string;source?:string;mode?:string;platform?:string;scheduleAt?:string;location?:string;device?:string;engine?:string}|null;
 if(!body?.projectId||!body.title?.trim()||body.title.trim().length>160)return NextResponse.json({error:body?.mode==="publish"?"请选择有效的待发布内容":"请填写有效的内容标题"},{status:400});
 const project=await ownedProject(user.id,body.projectId); if(!project)return NextResponse.json({error:"项目不存在"},{status:404});
 await ensureProductSchema(); const db=getDatabase(); const now=Math.floor(Date.now()/1000); const id=crypto.randomUUID();
 const keyword=(body.keyword||"").trim();
 if(body.mode==="publish"){
  const platform=["wordpress","medium","linkedin","facebook","x"].includes(body.platform||"")?body.platform:"wordpress"; const scheduleAt=(body.scheduleAt||"").trim(); const description=`发布平台：${platform}；计划时间：${scheduleAt||"审批通过后安排"}${keyword?`；目标关键词：${keyword}`:""}`;
  db.prepare(`INSERT INTO seo_tasks (id,project_id,type,title,description,priority,status,requires_approval,created_at,updated_at) VALUES (?,?,?,?,?,70,'proposed',1,?,?)`).bind(id,project.id,`publish_${platform}`,body.title.trim(),description,now,now).run();
  await writeAudit("publish_task_created",user.id,request,JSON.stringify({projectId:project.id,taskId:id,platform,scheduleAt}));
  return NextResponse.json({task:{id,title:body.title.trim(),description,type:`publish_${platform}`,priority:70,status:"proposed",createdAt:now}});
 }
 if(body.mode==="knowledge"){
  const knowledgeType=["document","web_page","internal_note","faq","dataset"].includes(body.knowledgeType||"")?body.knowledgeType:"internal_note"; const source=(body.source||"").trim(); const description=source?`知识来源：${source}`:"知识来源：手动添加";
  db.prepare(`INSERT INTO seo_tasks (id,project_id,type,title,description,priority,status,requires_approval,created_at,updated_at) VALUES (?,?,?,?,?,70,'proposed',1,?,?)`).bind(id,project.id,`knowledge_${knowledgeType}`,body.title.trim(),description,now,now).run();
  await writeAudit("knowledge_asset_created",user.id,request,JSON.stringify({projectId:project.id,taskId:id,knowledgeType}));
  return NextResponse.json({task:{id,title:body.title.trim(),description,type:`knowledge_${knowledgeType}`,priority:70,status:"proposed",createdAt:now}});
 }
 if(body.mode==="rank"){
  const location=(body.location||project.market||"GLOBAL").trim().slice(0,40);const device=["desktop","mobile"].includes(body.device||"")?body.device:"desktop";const engine=["google","bing","baidu"].includes(body.engine||"")?body.engine:"google";
  const existing=db.prepare("SELECT id FROM seo_tasks WHERE project_id=? AND type='rank_keyword' AND lower(title)=lower(?) AND status!='dismissed'").bind(project.id,body.title.trim()).first();
  if(existing)return NextResponse.json({error:"该关键词已在监控列表中"},{status:409});
  const description=`地区：${location}；设备：${device}；搜索引擎：${engine}`;
  db.prepare(`INSERT INTO seo_tasks (id,project_id,type,title,description,priority,status,requires_approval,created_at,updated_at) VALUES (?,?,?,?,?,50,'approved',0,?,?)`).bind(id,project.id,"rank_keyword",body.title.trim(),description,now,now).run();
  await writeAudit("rank_keyword_added",user.id,request,JSON.stringify({projectId:project.id,taskId:id,location,device,engine}));
  return NextResponse.json({task:{id,title:body.title.trim(),description,type:"rank_keyword",priority:50,status:"approved",createdAt:now}});
 }
 const contentType=["blog_post","guide","landing_page","content_refresh"].includes(body.contentType||"")?body.contentType:"blog_post"; const description=keyword?`目标关键词：${keyword}`:"等待补充目标关键词";
 db.prepare(`INSERT INTO seo_tasks (id,project_id,type,title,description,priority,status,requires_approval,created_at,updated_at) VALUES (?,?,?,?,?,60,'proposed',1,?,?)`).bind(id,project.id,`content_${contentType}`,body.title.trim(),description,now,now).run();
 await writeAudit("content_draft_created",user.id,request,JSON.stringify({projectId:project.id,taskId:id,contentType}));
 return NextResponse.json({task:{id,title:body.title.trim(),description,type:`content_${contentType}`,priority:60,status:"proposed",createdAt:now}});
}
export async function PATCH(request:Request){
 const user=await getCurrentUser(); if(!user)return NextResponse.json({error:"请先登录"},{status:401});
 const body=await request.json().catch(()=>null) as {id?:string;status?:string}|null; if(!body?.id||!["approved","dismissed"].includes(body.status||""))return NextResponse.json({error:"参数无效"},{status:400});
 await ensureProductSchema(); const db=getDatabase(); const now=Math.floor(Date.now()/1000);
 const result=db.prepare(`UPDATE seo_tasks SET status=?,updated_at=? WHERE id=? AND status='proposed' AND project_id IN (SELECT id FROM projects WHERE user_id=?)`).bind(body.status,now,body.id,user.id).run();
 if(!result.meta.changes)return NextResponse.json({error:"任务不存在或状态已变化"},{status:409});
 await writeAudit("seo_task_decision",user.id,request,JSON.stringify(body)); return NextResponse.json({ok:true});
}
