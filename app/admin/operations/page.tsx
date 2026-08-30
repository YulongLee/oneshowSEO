import { requireOperatorConsole } from "../../../lib/operator-administration";
import { ObservabilityConsole } from "../ObservabilityConsole";
import { OperationsConsole } from "../OperationsConsole";

export const dynamic = "force-dynamic";
export default async function AdminOperationsPage(){const {role}=await requireOperatorConsole();return <><div className="admin-title"><div><span>{role}</span><h1>任务与运行</h1><p>查看任务队列、隔离任务、通知投递、事故、功能开关和服务目标。</p></div></div><OperationsConsole/><ObservabilityConsole/></>;}
