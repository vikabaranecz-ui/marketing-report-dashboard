"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, ChevronDown, Download, Filter, Printer } from "lucide-react";
import type { Company } from "@/lib/data/types";

export function TopControls({
  companies,
  companyId,
  onCompanyChange,
  onExport,
  selectedMonth,
  availableMonths,
}: {
  companies: Company[];
  companyId: string;
  onCompanyChange: (value: string) => void;
  onExport: () => void;
  selectedMonth: string;
  availableMonths: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setMonth(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "ytd") params.delete("month");
    else params.set("month", value);
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <div className="border-b border-[var(--line)] bg-white px-4 py-3 lg:px-7">
      <div className="flex flex-wrap items-center gap-2">
        <label className="control control-company"><span className="h-2 w-2 bg-[var(--accent)]"/><select aria-label="Company" value={companyId} onChange={(e) => onCompanyChange(e.target.value)}>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select><ChevronDown size={14}/></label>
        <label className="control"><CalendarDays size={15}/><select aria-label="Reporting month" value={selectedMonth} onChange={(e) => setMonth(e.target.value)}>{availableMonths.map(value => <option key={value} value={value}>{monthLabel(value)}</option>)}</select><ChevronDown size={14}/></label>
        <span className="control text-xs text-[var(--muted)]">Cohort by lead creation month</span>
        <button className="control" type="button"><Filter size={15}/> Filters <span className="count-badge">{selectedMonth === "ytd" ? 0 : 1}</span></button>
        <div className="ml-auto flex gap-2"><button className="icon-button" type="button" onClick={onExport} aria-label="Export table to CSV"><Download size={16}/></button><button className="icon-button" type="button" onClick={() => window.print()} aria-label="Print report"><Printer size={16}/></button></div>
      </div>
    </div>
  );
}

function monthLabel(value: string) {
  if (value === "ytd") return "Year to date";
  const [year, month] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-BE", { month: "long", year: "numeric" }).format(new Date(Date.UTC(year, month - 1, 1)));
}
