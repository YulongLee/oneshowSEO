import { requirePlatformAdministrator } from "../../../lib/operator-administration";
import { CommercialUsers } from "../CommercialUsers";

export const dynamic = "force-dynamic";
export default async function AdminUsersPage(){await requirePlatformAdministrator();return <><div className="admin-title"><div><span>客户与权限</span><h1>用户管理</h1><p>查询真实注册账户，管理套餐、平台权限与账号状态。</p></div></div><CommercialUsers/></>;}
