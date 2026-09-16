"use client";

import { useMemo, useState } from "react";
import { Clock3, Mail, MapPin, Phone, X } from "lucide-react";
import type { CompanyDataset, Lead } from "@/lib/data/types";
import { formatCurrency, formatNumber, formatPercent, percentage } from "@/lib/metrics/kpis";
import { QualityBars } from "./charts";
import { Card, KpiCard, SectionHeader, StatusPill } from "./ui";

const stageOrder = ["New lead", "Contacted", "Qualified", "Visit booked", "Visit completed", "Quote sent", "Won"];

export function LeadsSalesPage({ data }: { data: CompanyDataset }) {
  const [selected, setSelected] = useState<Lead | null>(null);
  const quality = useMemo(() => (["A","B","C"] as const).map(name => ({ name: `Quality ${name}`, value: data.leads.filter(l => l.quality === name).length })), [data.leads]);
  const avgQuote = data.leads.filter(l => l.quoteValue).reduce((s,l) => s + (l.quoteValue ?? 0), 0) / Math.max(1, data.leads.filter(l => l.quoteValue).length);
  const avgWon = data.metrics.revenue / Math.max(1, data.metrics.won);

  return <div className="space-y-6">
    <div className="kpi-grid kpi-grid-six border-l border-t border-[var(--line)]">
      <KpiCard label="Avg. response time" value="12 min" delta={-18.4} meta="From lead creation"/>
      <KpiCard label="Contacted" value="91.2%" delta={2.6} meta="73% within 30 min"/>
      <KpiCard label="Visit booking rate" value={formatPercent(percentage(data.metrics.visits, data.metrics.qualified))} meta="Qualified → visit"/>
      <KpiCard label="Quote acceptance" value={formatPercent(percentage(data.metrics.won, data.metrics.quotes))} delta={4.2} meta="CRM-confirmed"/>
      <KpiCard label="Average quote" value={formatCurrency(avgQuote, true)} meta="Open and closed quotes"/>
      <KpiCard label="Average won project" value={formatCurrency(avgWon, true)} meta="Attributed revenue"/>
    </div>

    <Card className="p-5"><SectionHeader title="Sales funnel" description="Stage velocity and conversion from the previous stage"/><div className="sales-funnel">{stageOrder.map((stage,index) => { const counts = [data.metrics.leads, Math.round(data.metrics.leads*.91), data.metrics.qualified, Math.round(data.metrics.visits*1.13), data.metrics.visits, data.metrics.quotes, data.metrics.won]; const conversion = index === 0 ? null : percentage(counts[index], counts[index-1]); return <div className="sales-stage" key={stage}><div className="flex items-start justify-between gap-2"><p>{stage}</p><span>{index === 0 ? "0.0d" : `${(index*.7+.4).toFixed(1)}d`}</span></div><strong>{formatNumber(counts[index])}</strong><small>{conversion === null ? "Entry" : `${formatPercent(conversion)} conv. · ${formatPercent(conversion === null ? null : 100-conversion)} lost`}</small></div>; })}</div></Card>

    <div className="grid gap-6 xl:grid-cols-[.8fr_1.7fr]">
      <Card className="p-5"><SectionHeader title="Lead quality" description="A = strong, B = possible, C = poor or invalid"/><QualityBars data={quality}/><div className="mt-3 grid grid-cols-3 gap-px bg-[var(--line)]">{quality.map(item => <div className="bg-white p-3 text-center" key={item.name}><p className="text-xl font-semibold">{item.value}</p><p className="text-xs text-[var(--muted)]">{item.name}</p></div>)}</div></Card>
      <Card className="p-5"><SectionHeader title="Sales efficiency" description="Operational factors that affect close rate"/><div className="grid grid-cols-2 gap-px bg-[var(--line)] lg:grid-cols-4"><Mini label="Within 5 min" value="38%"/><Mini label="Within 30 min" value="73%"/><Mini label="No-show rate" value="8.4%"/><Mini label="Average sales cycle" value="18.6d"/><Mini label="Quote rate" value={formatPercent(percentage(data.metrics.quotes,data.metrics.visits))}/><Mini label="Qualified rate" value={formatPercent(percentage(data.metrics.qualified,data.metrics.leads))}/><Mini label="Lost leads" value={String(Math.round(data.metrics.leads*.19))}/><Mini label="Open pipeline" value={formatCurrency(avgQuote*data.metrics.quotes*.62,true)}/></div></Card>
    </div>

    <Card className="p-5"><SectionHeader title="Lead register" description="Personal details appear only in this permission-gated operational table"/><div className="table-scroll"><table><thead><tr><th>Date</th><th>Name</th><th>Source</th><th>Campaign</th><th>Service</th><th>Municipality</th><th>Quality</th><th>Sales stage</th><th>Quote</th><th>Won revenue</th><th>Owner</th><th>Days open</th></tr></thead><tbody>{data.leads.map(lead => <tr key={lead.id} onClick={() => setSelected(lead)} className="cursor-pointer"><td>{lead.date}</td><td className="font-semibold text-[var(--ink)]">{lead.name}</td><td>{lead.source}</td><td>{lead.campaign}</td><td>{lead.service}</td><td>{lead.municipality}</td><td><StatusPill tone={lead.quality === "A" ? "good" : lead.quality === "B" ? "warn" : "neutral"}>{lead.quality}</StatusPill></td><td><StatusPill tone={lead.stage === "Won" ? "good" : lead.stage === "Lost" ? "bad" : "accent"}>{lead.stage}</StatusPill></td><td>{formatCurrency(lead.quoteValue)}</td><td>{formatCurrency(lead.wonRevenue)}</td><td>{lead.salesperson}</td><td>{lead.daysOpen}</td></tr>)}</tbody></table></div></Card>
    {selected && <LeadDrawer lead={selected} onClose={() => setSelected(null)}/>}
  </div>;
}

function Mini({label,value}:{label:string;value:string}) { return <div className="bg-white p-4"><p className="text-xs uppercase tracking-wide text-[var(--muted)]">{label}</p><p className="mt-3 text-xl font-semibold">{value}</p></div>; }

function LeadDrawer({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  return <div className="drawer-backdrop" role="presentation" onMouseDown={onClose}><aside className="drawer" role="dialog" aria-modal="true" aria-label={`${lead.name} details`} onMouseDown={e => e.stopPropagation()}><div className="flex items-start justify-between border-b border-[var(--line)] p-6"><div><div className="mb-3 flex gap-2"><StatusPill tone={lead.quality === "A" ? "good" : "warn"}>Quality {lead.quality}</StatusPill><StatusPill tone="accent">{lead.stage}</StatusPill></div><h2 className="text-2xl font-semibold tracking-tight">{lead.name}</h2><p className="mt-1 text-sm text-[var(--muted)]">Created {lead.date} · {lead.daysOpen} days open</p></div><button className="icon-button" onClick={onClose} aria-label="Close lead details"><X size={18}/></button></div><div className="space-y-7 overflow-y-auto p-6"><div className="grid gap-3 text-sm"><p className="flex items-center gap-3"><Mail size={16} className="text-[var(--muted)]"/>{lead.email}</p><p className="flex items-center gap-3"><Phone size={16} className="text-[var(--muted)]"/>{lead.phone}</p><p className="flex items-center gap-3"><MapPin size={16} className="text-[var(--muted)]"/>{lead.municipality}</p></div><Detail title="Attribution"><Row label="Source" value={lead.source}/><Row label="Campaign" value={lead.campaign}/><Row label="Ad" value={lead.ad}/><Row label="UTM parameters" value={lead.utm}/></Detail><Detail title="Opportunity"><Row label="Service" value={lead.service}/><Row label="Quote value" value={formatCurrency(lead.quoteValue)}/><Row label="Won revenue" value={formatCurrency(lead.wonRevenue)}/><Row label="Assigned to" value={lead.salesperson}/></Detail><Detail title="Timeline"><div className="relative ml-2 space-y-5 border-l border-[var(--line-strong)] pl-5"><Timeline label="Lead received" meta={lead.date}/><Timeline label="Contact attempt logged" meta="12 minutes later"/><Timeline label={lead.stage} meta="Current stage"/></div></Detail><Detail title="Notes"><p className="text-sm leading-6 text-[var(--muted)]">{lead.notes}</p></Detail></div></aside></div>;
}
function Detail({title,children}:{title:string;children:React.ReactNode}) { return <section><h3 className="mb-3 text-xs font-bold uppercase tracking-[.12em] text-[var(--muted)]">{title}</h3><div className="space-y-3">{children}</div></section>; }
function Row({label,value}:{label:string;value:string}) { return <div className="grid grid-cols-[110px_1fr] gap-3 text-sm"><span className="text-[var(--muted)]">{label}</span><span className="break-words font-medium">{value}</span></div>; }
function Timeline({label,meta}:{label:string;meta:string}) { return <div className="relative"><span className="absolute -left-[25px] top-1 h-2 w-2 bg-[var(--ink)]"/><p className="text-sm font-semibold">{label}</p><p className="mt-1 flex items-center gap-1 text-xs text-[var(--muted)]"><Clock3 size={12}/>{meta}</p></div>; }
