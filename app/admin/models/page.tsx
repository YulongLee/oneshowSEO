import { requirePlatformAdministrator } from "../../../lib/operator-administration";
import { ModelProviderSettings } from "../ModelProviderSettings";
export const dynamic="force-dynamic";
export default async function AdminModelsPage(){await requirePlatformAdministrator();return <><div className="admin-title"><div><span>AI 能力中心</span><h1>模型与内容生成</h1><p>配置平台级模型、默认生成策略与密钥安全，不向租户暴露供应商凭据。</p></div></div><ModelProviderSettings/></>}
