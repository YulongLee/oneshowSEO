import { requirePlatformAdministrator } from "../../../lib/operator-administration";
import { PaymentProviderSettings } from "../PaymentProviderSettings";
import { PlanPricingSettings } from "../PlanPricingSettings";
import { UsageReconciliation } from "../UsageReconciliation";

export const dynamic = "force-dynamic";
export default async function AdminCommercePage(){await requirePlatformAdministrator();return <><div className="admin-title"><div><span>收入与权益</span><h1>套餐、支付与 Credits</h1><p>管理统一定价、支付渠道、订阅权益、用量与 Credits 对账。</p></div></div><PlanPricingSettings/><PaymentProviderSettings/><UsageReconciliation/></>;}
