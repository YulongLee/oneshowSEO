import Link from "next/link";
import Image from "next/image";
import { publicProductPlans } from "../../lib/plan-pricing";

export const dynamic = "force-dynamic";

export default async function Pricing() {
  const plans = (await publicProductPlans()).filter((plan) => plan.id === "trial" || plan.available);
  return <main className="legal-page pricing-page"><header><Link href="/"><Image src="/brand/oneshowseo.png" alt="OneShowSEO" width={170} height={43} unoptimized/></Link><Link href="/login">登录</Link></header><section className="legal-hero"><span>透明的能力边界</span><h1>按项目与抓取规模选择套餐</h1><p>所有价格均来自平台当前生效的产品定价；免费试用不会自动扣款。</p></section><div className="pricing-grid">{plans.map((plan) => <article key={plan.id} className={plan.featured ? "featured" : ""}><span>{plan.name}</span><h2>{plan.id === "trial" ? "免费 14 天" : `¥${(plan.monthlyPriceCents / 100).toFixed(2)} / 月`}</h2><ul><li>{plan.projectLimit} 个项目</li><li>{plan.pageLimit.toLocaleString("zh-CN")} 页/次</li><li>{plan.aiCreditLimit.toLocaleString("zh-CN")} AI Credits</li><li>{plan.teamSeatLimit} 个团队席位</li><li>{plan.integrations ? "支持授权数据连接" : "公开网站数据"}</li></ul><Link href={plan.id === "trial" ? "/register" : "/login"}>{plan.id === "trial" ? "免费开始" : `开通 ${plan.name}`}</Link></article>)}</div></main>;
}
