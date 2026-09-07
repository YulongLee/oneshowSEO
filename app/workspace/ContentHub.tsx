"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, CalendarBlank, CheckCircle, Clock, FileText, NotePencil, PaperPlaneTilt, Plus, SpinnerGap, Stack, WarningCircle } from "@phosphor-icons/react";
import ContentPlanCenter from "./ContentPlanCenter";
import ContentCreationStudio from "./ContentCreationStudio";
import ContentLibraryCenter from "./ContentLibraryCenter";
import PublishAgent from "./PublishAgentControl";

type HubView="工作流"|"选题与计划"|"内容编辑"|"内容资产"|"发布";
type Project={id:string;name?:string;siteUrl?:string;host?:string};
type ContentRun={id:string;taskId:string;status:string;title:string;keyword:string;wordCount:number;qualityScore:number;reviewStatus:string;completedAt:number|null};
type ContentVersion={id:string;runId:string;versionNumber:number;reviewStatus:string;qualityScore:number};
type ContentPayload={runs:ContentRun[];versions:ContentVersion[];model?:{ready:boolean;provider:string|null;model:string|null}};
type PlanPayload={plans:Array<{id:string;briefId:string;status:string}>;briefs:Array<{id:string;topic:string;primaryKeyword:string}>};
type PublishPayload={requests:Array<{id:string;contentTaskId:string;title:string;status:string;publishedUrl:string|null}>;connections?:Array<{state:string;writeEnabled:boolean}>};

const viewFor=(value:string):HubView=>({"内容计划":"选题与计划","内容规划":"选题与计划","内容创作":"内容编辑","内容库":"内容资产","AI 内容生产":"发布","发布管理":"发布","内容中心":"工作流"}[value] as HubView)||"工作流";
const stageMeta={planning:{label:"待策划",icon:CalendarBlank},generating:{label:"生成中",icon:SpinnerGap},draft:{label:"待完善",icon:NotePencil},review:{label:"待审核",icon:Clock},publish:{label:"待发布",icon:PaperPlaneTilt},published:{label:"已发布",icon:CheckCircle}} as const;
type Stage=keyof typeof stageMeta;

export default function ContentHub({project,user,initialView,navigate,refresh}:{project:Project;user:{name:string;email:string};initialView:string;navigate:(value:string)=>void;refresh:()=>Promise<void>}){
  const [view,setView]=useState<HubView>(()=>viewFor(initialView));
  const [content,setContent]=useState<ContentPayload>({runs:[],versions:[]});
  const [planning,setPlanning]=useState<PlanPayload>({plans:[],briefs:[]});
  const [publishing,setPublishing]=useState<PublishPayload>({requests:[]});
  const [loading,setLoading]=useState(true),[error,setError]=useState("");
  const load=useCallback(async()=>{setLoading(true);setError("");try{const responses=await Promise.all(["content","content-plan","publish"].map(endpoint=>fetch(`/api/projects/${project.id}/${endpoint}`,{cache:"no-store"}))),payloads=await Promise.all(responses.map(response=>response.json()));const failed=responses.findIndex(response=>!response.ok);if(failed>=0)throw new Error(payloads[failed]?.error||"内容中心读取失败");setContent(payloads[0]);setPlanning(payloads[1]);setPublishing(payloads[2]);}catch(caught){setError(caught instanceof Error?caught.message:"内容中心读取失败");}finally{setLoading(false);}},[project.id]);
  useEffect(()=>{const timer=window.setTimeout(()=>void load(),0);return()=>window.clearTimeout(timer);},[load]);
  const selectView=(next:HubView)=>{setView(next);if(next==="工作流")void load();};
  const go=(value:string)=>{const mapped=viewFor(value);if(["内容计划","内容规划","内容创作","内容库","AI 内容生产","发布管理","内容中心"].includes(value))selectView(mapped);else navigate(value);};
  const versions=useMemo(()=>{
    const latest=new Map<string,ContentPayload["versions"][number]>();
    for(const version of content.versions){
      const current=latest.get(version.runId);
      if(!current||version.versionNumber>current.versionNumber)latest.set(version.runId,version);
    }
    return latest;
  },[content.versions]);
  const requests=useMemo(()=>new Map(publishing.requests.map(request=>[request.contentTaskId,request])),[publishing.requests]);
  const rows=useMemo(()=>content.runs.map(run=>{const version=versions.get(run.id),request=requests.get(run.taskId)||requests.get(run.id);let stage:Stage="draft";if(request?.status==="published")stage="published";else if(version?.reviewStatus==="approved")stage="publish";else if(version?.reviewStatus==="pending")stage="review";else if(["queued","running","retrying"].includes(run.status))stage="generating";const action=stage==="publish"?"安排发布":stage==="published"?"查看内容":"继续处理";return{run,version,request,stage,action};}),[content.runs,requests,versions]);
  const planningCount=planning.plans.filter(plan=>["UNSCHEDULED","SCHEDULED"].includes(plan.status)).length;
  const counts=Object.fromEntries((Object.keys(stageMeta) as Stage[]).map(stage=>[stage,stage==="planning"?planningCount:rows.filter(row=>row.stage===stage).length])) as Record<Stage,number>;
  const openRow=(row:(typeof rows)[number])=>{sessionStorage.setItem(`oneshowseo:content:${project.id}`,row.run.id);if(row.stage==="publish"){sessionStorage.setItem(`oneshowseo:publish:${project.id}`,row.run.taskId);setView("发布");}else if(row.stage==="published")setView("内容资产");else setView("内容编辑");};
  const childRefresh=async()=>{await Promise.all([refresh(),load()]);};
  return <section className="content-hub">
    <header className="content-hub-header"><div><span>CONTENT WORKFLOW</span><h1>内容中心</h1><p>从选题到发布，在一条连续流程里完成内容生产。</p></div><div>{rows[0]&&<button onClick={()=>openRow(rows[0])}>继续上次内容 <ArrowRight/></button>}<button className="primary" onClick={()=>selectView("选题与计划")}><Plus/>创建内容</button></div></header>
    <nav className="content-hub-tabs" aria-label="内容中心视图">{(["工作流","选题与计划","内容编辑","内容资产","发布"] as HubView[]).map(item=><button key={item} className={view===item?"active":""} onClick={()=>selectView(item)}>{item}</button>)}</nav>
    {view==="工作流"&&<div className="content-hub-flow">
      <section className="content-stage-strip">{(Object.keys(stageMeta) as Stage[]).map((stage,index)=>{const Icon=stageMeta[stage].icon;return <button key={stage} onClick={()=>selectView(stage==="planning"?"选题与计划":stage==="publish"?"发布":stage==="published"?"内容资产":"内容编辑")}><span className={stage}><Icon className={stage==="generating"&&counts[stage]>0?"spin":""}/></span><div><small>步骤 {index+1}</small><strong>{stageMeta[stage].label}</strong></div><b>{counts[stage]}</b></button>})}</section>
      {error&&<div className="content-hub-error"><WarningCircle/>{error}<button onClick={()=>void load()}>重试</button></div>}
      <div className="content-hub-grid"><main><header><div><h2>继续处理</h2><p>系统已按当前阶段排好下一步。</p></div><button onClick={()=>selectView("内容资产")}>查看全部</button></header>{loading?<div className="content-hub-empty"><SpinnerGap className="spin"/><strong>正在整理内容流程…</strong></div>:rows.length?rows.slice(0,8).map(row=>{const Icon=stageMeta[row.stage].icon;return <article key={row.run.id}><span className={row.stage}><Icon/></span><div><strong>{row.run.title}</strong><small>{stageMeta[row.stage].label} · {row.run.keyword||"未设置关键词"}{row.run.wordCount?` · ${row.run.wordCount.toLocaleString("zh-CN")} 字`:""}</small></div><em>{row.run.qualityScore?`${row.run.qualityScore} 分`:"待检查"}</em><button onClick={()=>openRow(row)}>{row.action}<ArrowRight/></button></article>}):<div className="content-hub-empty"><FileText/><strong>还没有内容</strong><p>创建第一个选题，系统会引导你完成生成、审核和发布。</p><button onClick={()=>selectView("选题与计划")}>创建第一篇内容</button></div>}</main>
        <aside><header><h2>当前建议</h2><span>下一步</span></header>{rows.some(row=>row.stage==="review")?<div className="content-next-card review"><Clock/><small>需要审核</small><strong>确认内容事实与品牌表述</strong><p>审核完成后即可进入发布设置。</p><button onClick={()=>setView("内容编辑")}>开始审核 <ArrowRight/></button></div>:rows.some(row=>row.stage==="publish")?<div className="content-next-card publish"><PaperPlaneTilt/><small>准备发布</small><strong>为已批准内容安排发布</strong><p>{publishing.connections?.some(item=>item.state==="connected"&&item.writeEnabled)?"发布连接已就绪。":"需要先连接可写入的 WordPress 站点。"}</p><button onClick={()=>setView("发布")}>安排发布 <ArrowRight/></button></div>:planningCount?<div className="content-next-card plan"><CalendarBlank/><small>计划待执行</small><strong>{planningCount} 个选题等待进入创作</strong><p>选择优先主题并开始生成草稿。</p><button onClick={()=>setView("选题与计划")}>查看计划 <ArrowRight/></button></div>:<div className="content-next-card plan"><Stack/><small>建立内容流水线</small><strong>从一个真实用户问题开始</strong><p>明确主题、关键词和来源后生成第一版内容。</p><button onClick={()=>setView("选题与计划")}>开始规划 <ArrowRight/></button></div>}</aside>
      </div>
    </div>}
    {view==="选题与计划"&&<ContentPlanCenter project={project} navigate={go}/>}
    {view==="内容编辑"&&<ContentCreationStudio project={project} navigate={go} refresh={childRefresh}/>}
    {view==="内容资产"&&<ContentLibraryCenter project={project} user={user} navigate={go}/>}
    {view==="发布"&&<PublishAgent project={project} user={user} navigate={go} refresh={childRefresh}/>}
  </section>;
}
