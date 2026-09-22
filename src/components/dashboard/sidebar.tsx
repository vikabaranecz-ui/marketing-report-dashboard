"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Bell, CircleHelp, Settings } from "lucide-react";
import { navItems } from "./icons";

export function Sidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const hrefWithScope = (href: string) => {
    const params = new URLSearchParams(searchParams.toString());
    const query = params.toString();
    return query ? `${href}?${query}` : href;
  };

  return (
    <aside className="sidebar print:hidden">
      <div className="wat-brand">
        <div className="wat-wordmark" aria-label="WAT Agency">WAT<span>?</span></div>
        <p>AGENCY</p>
        <small>Marketing intelligence</small>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-5">
        {navItems.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={hrefWithScope(item.href)}
              prefetch={false}
              className={`nav-link ${active ? "nav-link-active" : ""}`}
            >
              <Icon size={17}/>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="wat-side-note">
        <span>STRATEGY</span>
        <span>CREATIVE</span>
        <span>PERFORMANCE</span>
        <strong>REAL IMPACT.</strong>
      </div>

      <div className="sidebar-footer">
        <Link href={hrefWithScope("/settings")} prefetch={false} className={`nav-link w-full ${pathname.startsWith("/settings") ? "nav-link-active" : ""}`}>
          <Settings size={17}/> Settings
        </Link>
        <button className="nav-link w-full"><CircleHelp size={17}/> Help & definitions</button>
        <div className="sidebar-user">
          <div className="sidebar-avatar">W</div>
          <div className="min-w-0 flex-1">
            <p>WAT Agency</p>
            <small>Reporting workspace</small>
          </div>
          <Bell size={16}/>
        </div>
      </div>
    </aside>
  );
}
