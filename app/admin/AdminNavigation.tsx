"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Buildings, Gear, Plug, Pulse, Queue, Receipt, ShieldCheck, Users } from "@phosphor-icons/react";

const primary = [
  { href: "/admin", label: "运营总览", icon: Pulse },
  { href: "/admin/organizations", label: "项目与租户", icon: Buildings },
  { href: "/admin/users", label: "用户与权限", icon: Users },
  { href: "/admin/operations", label: "任务与运行", icon: Queue },
  { href: "/admin/integrations", label: "集成与数据源", icon: Plug },
  { href: "/admin/commerce", label: "套餐、支付与 Credits", icon: Receipt },
  { href: "/admin/audit", label: "审计与安全", icon: ShieldCheck },
  { href: "/admin/settings", label: "平台设置", icon: Gear },
] as const;

export function AdminNavigation({ platformAdmin }: { platformAdmin: boolean }) {
  const pathname = usePathname();
  const visible = platformAdmin ? primary : primary.filter((item) => ["/admin", "/admin/operations", "/admin/audit"].includes(item.href));
  return <nav aria-label="后台管理导航">{visible.map(({ href, label, icon: Icon }) => {
    const active = href === "/admin" ? pathname === href : pathname.startsWith(href);
    return <Link href={href} className={active ? "admin-nav-active" : ""} aria-current={active ? "page" : undefined} key={href}><Icon />{label}</Link>;
  })}</nav>;
}
