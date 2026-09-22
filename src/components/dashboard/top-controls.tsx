"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, ChevronDown, Download, Printer } from "lucide-react";
import type { Company } from "@/lib/data/types";

export function TopControls({
  companies,
  companyId,
  onExport,
  selectedMonth,
  availableMonths,
}: {
  companies: Company[];
  companyId: string;
  onExport: () => void;
  selectedMonth: string;
  availableMonths: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setCompany(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("company", value);
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  function setMonth(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "ytd") params.delete("month");
    else params.set("month", value);
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <div className="top-controls">
      <div className="top-controls-inner">
        <label className="control control-company"><span className="control-dot"/><select aria-label="Company" value={companyId} onChange={(e) => setCompany(e.target.value)}>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select><ChevronDown size={14}/></label>
        <label className="control"><CalendarDays size={15}/><select aria-label="Reporting month" value={selectedMonth} onChange={(e) => setMonth(e.target.value)}>{availableMonths.map(value => <option key={value} value={value}>{monthLabel(value)}</option>)}</select><ChevronDown size={14}/></label>
        <span className="control control-muted">Cohort · lead creation month</span>
        <span className="control control-muted">All sources · services · campaigns</span>
        <div className="top-actions"><button className="icon-button" type="button" onClick={onExport} aria-label="Export table to CSV"><Download size={16}/></button><button className="icon-button" type="button" onClick={() => window.print()} aria-label="Print report"><Printer size={16}/></button></div>
      </div>
    </div>
  );
}

function monthLabel(value: string) {
  if (value === "ytd") return "Year to date";
  const [year, month] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-BE", { month: "long", year: "numeric" }).format(new Date(Date.UTC(year, month - 1, 1)));
}
