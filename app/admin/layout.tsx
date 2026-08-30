import { requireOperatorConsole } from "../../lib/operator-administration";
import Link from "next/link";
import Image from "next/image";
import { UserCircle } from "@phosphor-icons/react/dist/ssr";
import { AdminNavigation } from "./AdminNavigation";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, role } = await requireOperatorConsole();
  return <main className="admin-shell">
    <aside className="admin-sidebar">
      <Link href="/" className="admin-brand-link"><Image src="/brand/oneshowseo.png" alt="OneShowSEO" width={164} height={42} unoptimized /></Link>
      <span className="admin-badge">{role === "platform_admin" ? "ADMIN CONSOLE" : `${role.toUpperCase()} CONSOLE`}</span>
      <AdminNavigation platformAdmin={role === "platform_admin"} />
      <Link href="/workspace" className="admin-back-link">返回产品工作台</Link>
      <div className="admin-user"><UserCircle weight="fill"/><div><strong>{user.name}</strong><small>{user.email}</small></div></div>
    </aside>
    <section className="admin-main"><header><strong>OneShowSEO 商业化运营后台</strong><span>{role === "platform_admin" ? "平台管理员" : role}</span></header><div className="admin-inner">{children}</div></section>
  </main>;
}
