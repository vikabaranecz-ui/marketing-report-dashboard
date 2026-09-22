import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`dashboard-card border border-[var(--line)] bg-white ${className}`}>{children}</section>;
}

export function SectionHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4">
      <div><h2 className="text-[1.05rem] font-semibold tracking-[-.02em] text-[var(--ink)]">{title}</h2>{description && <p className="mt-1 text-sm text-[var(--muted)]">{description}</p>}</div>
      {action}
    </div>
  );
}

export function KpiCard({ label, value, delta, meta }: { label: string; value: string; delta?: number | null; meta?: string }) {
  const positive = (delta ?? 0) >= 0;
  return (
    <div className="kpi-card min-w-0 bg-white p-4">
      <div className="flex items-center gap-2"><span className="kpi-accent-dot"/><p className="truncate text-xs font-semibold text-[var(--muted)]">{label}</p></div>
      <div className="mt-3 flex items-end justify-between gap-2">
        <p className="truncate text-[1.45rem] font-semibold tracking-[-.05em] text-[var(--ink)]">{value}</p>
        {delta !== undefined && delta !== null && <span className={`mb-1 flex items-center text-xs font-semibold ${positive ? "text-emerald-700" : "text-rose-700"}`}>{positive ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}{Math.abs(delta).toFixed(1)}%</span>}
      </div>
      {meta && <p className="mt-2 truncate text-xs text-[var(--muted)]">{meta}</p>}
    </div>
  );
}

export function EmptyState({ title = "No data for this selection", body = "Change the filters or connect a data source to populate this view." }: { title?: string; body?: string }) {
  return <div className="empty-state flex min-h-48 flex-col items-center justify-center border border-dashed border-[var(--line-strong)] bg-[var(--surface)] px-6 text-center"><p className="font-semibold">{title}</p><p className="mt-2 max-w-md text-sm text-[var(--muted)]">{body}</p></div>;
}

export function StatusPill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "good" | "warn" | "bad" | "accent" }) {
  const colors = { neutral: "bg-slate-100 text-slate-700", good: "bg-emerald-50 text-emerald-800", warn: "bg-amber-50 text-amber-800", bad: "bg-rose-50 text-rose-800", accent: "bg-[var(--accent-soft)] text-[var(--accent-ink)]" };
  return <span className={`status-pill inline-flex items-center whitespace-nowrap px-2 py-1 text-xs font-semibold ${colors[tone]}`}>{children}</span>;
}
