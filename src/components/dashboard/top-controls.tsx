"use client";

import { CalendarDays, ChevronDown, Download, Filter, Printer } from "lucide-react";
import type { Company } from "@/lib/data/types";

export function TopControls({ companies, companyId, onCompanyChange, onExport }: { companies: Company[]; companyId: string; onCompanyChange: (value: string) => void; onExport: () => void }) {
  return (
    <div className="border-b border-[var(--line)] bg-white px-4 py-3 lg:px-7">
      <div className="flex flex-wrap items-center gap-2">
        <label className="control control-company"><span className="h-2 w-2 bg-[var(--accent)]"/><select aria-label="Company" value={companyId} onChange={(e) => onCompanyChange(e.target.value)}>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select><ChevronDown size={14}/></label>
        <label className="control"><CalendarDays size={15}/><select aria-label="Date range" defaultValue="year"><option value="today">Today</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="year">This year</option><option value="month">This month</option><option value="last-month">Last month</option><option value="quarter">This quarter</option><option value="custom">Custom range</option></select><ChevronDown size={14}/></label>
        <label className="control"><span className="text-xs text-[var(--muted)]">Compare</span><select aria-label="Comparison" defaultValue="previous"><option value="previous">Previous period</option><option value="year">Same period last year</option></select><ChevronDown size={14}/></label>
        <button className="control" type="button"><Filter size={15}/> Filters <span className="count-badge">0</span></button>
        <div className="ml-auto flex gap-2"><button className="icon-button" type="button" onClick={onExport} aria-label="Export table to CSV"><Download size={16}/></button><button className="icon-button" type="button" onClick={() => window.print()} aria-label="Print report"><Printer size={16}/></button></div>
      </div>
    </div>
  );
}
