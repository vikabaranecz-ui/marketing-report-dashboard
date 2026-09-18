"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Bell, CircleHelp, PanelLeftClose, Settings } from "lucide-react";
import { navItems } from "./icons";

export function Sidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const month = searchParams.get("month");
  const hrefWithMonth = (href: string) => month ? `${href}?month=${encodeURIComponent(month)}` : href;
  return (
    <aside className="sidebar print:hidden">
      <div className="flex h-[72px] items-center justify-between border-b border-white/10 px-5"><div><div className="text-[11px] font-medium uppercase tracking-[.2em] text-white/45">WAT Agency</div><div className="mt-1 text-sm font-semibold tracking-tight text-white">Reporting desk</div></div><PanelLeftClose size={17} className="text-white/40"/></div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-5">{navItems.map((item) => { const active = pathname === item.href || pathname.startsWith(`${item.href}/`); const Icon = item.icon; return <Link key={item.href} href={hrefWithMonth(item.href)} className={`nav-link ${active ? "nav-link-active" : ""}`}><Icon size={17}/><span>{item.label}</span>{active && <span className="ml-auto h-1.5 w-1.5 bg-[var(--accent)]"/>}</Link>; })}</nav>
      <div className="border-t border-white/10 p-3"><Link href={hrefWithMonth("/settings")} className={`nav-link w-full ${pathname.startsWith("/settings") ? "nav-link-active" : ""}`}><Settings size={17}/> Settings</Link><button className="nav-link w-full"><CircleHelp size={17}/> Help & definitions</button><div className="mt-2 flex items-center gap-3 px-3 py-3"><div className="grid h-8 w-8 place-items-center bg-white text-xs font-bold text-black">VB</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-white">Agency admin</p><p className="truncate text-xs text-white/45">WAT Agency</p></div><Bell size={16} className="text-white/50"/></div></div>
    </aside>
  );
}
