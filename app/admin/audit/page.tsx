import { requireOperatorConsole } from "../../../lib/operator-administration";
import { AuditTrail } from "../AuditTrail";

export const dynamic = "force-dynamic";
export default async function AdminAuditPage(){await requireOperatorConsole();return <><div className="admin-title"><div><span>治理与追踪</span><h1>审计与安全</h1><p>追踪后台高权限操作、作用范围、操作理由和关联链路。</p></div></div><AuditTrail/></>;}
