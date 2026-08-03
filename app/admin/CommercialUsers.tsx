"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowClockwise, MagnifyingGlass, UserCircle } from "@phosphor-icons/react";

type ManagedUser = { id:string; email:string; name:string; role:"user"|"admin"; status:"active"|"suspended"; plan:"trial"|"starter"|"pro"|"business"; trialEndsAt:number|null; lastLoginAt:number|null; createdAt:number };

export function CommercialUsers({notify}:{notify?:(message:string)=>void} = {}){
  const [users,setUsers]=useState<ManagedUser[]>([]); const [query,setQuery]=useState(""); const [loading,setLoading]=useState(true);
  const [message,setMessage]=useState(""); const announce=useCallback((value:string)=>{if(notify)notify(value);else{setMessage(value);setTimeout(()=>setMessage(""),2200)}},[notify]);
  const load=useCallback(async()=>{setLoading(true);try{const response=await fetch("/api/admin/users");const data=await response.json() as {users?:ManagedUser[];error?:string};if(!response.ok)throw new Error(data.error);setUsers(data.users||[])}catch(error){announce(error instanceof Error?error.message:"用户数据加载失败")}finally{setLoading(false)}},[announce]);
  useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer)},[load]);
  const shown=useMemo(()=>users.filter(user=>`${user.name} ${user.email}`.toLowerCase().includes(query.toLowerCase())),[users,query]);
  async function update(user:ManagedUser,field:"role"|"status"|"plan",value:string){const response=await fetch("/api/admin/users",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({id:user.id,[field]:value})});const result=await response.json() as {error?:string};if(!response.ok){announce(result.error||"更新失败");return}setUsers(current=>current.map(item=>item.id===user.id?{...item,[field]:value}:item) as ManagedUser[]);announce(`${user.name} 的账号设置已更新`)}
  return <section className="admin-panel commercial-users"><div className="commercial-toolbar"><div><span>真实账号数据</span><h2>用户与商业化管理</h2><p>管理注册用户、套餐、权限和账号状态；所有变更都会写入审计记录。</p></div><label><MagnifyingGlass/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="搜索姓名或邮箱"/></label><button onClick={load} aria-label="刷新用户数据"><ArrowClockwise/>刷新</button></div>
    <div className="commercial-summary"><span><b>{users.length}</b>总用户</span><span><b>{users.filter(user=>user.status==="active").length}</b>活跃账号</span><span><b>{users.filter(user=>user.plan==="trial").length}</b>试用中</span><span><b>{users.filter(user=>user.role==="admin").length}</b>管理员</span></div>
    <div className="commercial-head"><span>用户</span><span>套餐</span><span>角色</span><span>账号状态</span><span>注册时间</span></div>
    {loading?<div className="commercial-empty">正在加载真实账号数据…</div>:shown.length===0?<div className="commercial-empty">没有匹配的用户</div>:shown.map(user=><div className="commercial-row" key={user.id}><div><UserCircle weight="fill"/><span><strong>{user.name}</strong><small>{user.email}</small></span></div><select aria-label={`${user.name} 套餐`} value={user.plan} onChange={event=>update(user,"plan",event.target.value)}><option value="trial">14 天试用</option><option value="starter">Starter</option><option value="pro">Pro</option><option value="business">Business</option></select><select aria-label={`${user.name} 角色`} value={user.role} onChange={event=>update(user,"role",event.target.value)}><option value="user">普通用户</option><option value="admin">管理员</option></select><select aria-label={`${user.name} 状态`} value={user.status} onChange={event=>update(user,"status",event.target.value)}><option value="active">正常</option><option value="suspended">已暂停</option></select><time>{new Date(user.createdAt*1000).toLocaleDateString("zh-CN")}</time></div>)}
    {message&&<div className="toast">{message}</div>}
  </section>
}
