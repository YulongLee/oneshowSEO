import { requirePlatformAdministrator } from "../../../lib/operator-administration";
import { DataSourceSettings } from "../DataSourceSettings";

export const dynamic = "force-dynamic";
export default async function AdminIntegrationsPage(){await requirePlatformAdministrator();return <><div className="admin-title"><div><span>平台连接能力</span><h1>集成与数据源</h1><p>统一配置平台级数据服务；客户凭据仍按租户和项目隔离。</p></div></div><DataSourceSettings/></>;}
