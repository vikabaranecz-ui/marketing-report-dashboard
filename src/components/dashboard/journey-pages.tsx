"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { CompanyDataset } from "@/lib/data/types";
import { formatCurrency, formatNumber, formatPercent, percentage } from "@/lib/metrics/kpis";
import { buildFunnelSummary, buildJourneyRows, journeyStageMeta, sourcePipelineRows, type JourneyRow, type JourneyStage } from "@/lib/metrics/client-funnel";
import { Card, EmptyState, KpiCard, SectionHeader, StatusPill } from "./ui";

export function ClientJourneyPage({ data }: { data: CompanyDataset }) {
  const rows = useMemo(() => buildJourneyRows(data), [data]);
  const summary = useMemo(() => buildFunnelSummary(data), [data]);
  const [search, setSearch] = useState("");
  const [source, setSource] = useState("all");
  const [service, setService] = useState("all");
  const filtered = rows.filter(row => {
    const text = [row.lead.name,row.lead.phone,row.lead.email,row.lead.source,row.lead.service,row.lead.municipality].join(" ").toLowerCase();
    return (!search || text.includes(search.toLowerCase())) && (source === "all" || row.lead.source === source) && (service === "all" || row.lead.service === service);
  });
  const sources = [...new Set(rows.map(row => row.lead.source))].sort();
  const services = [...new Set(rows.map(row => row.lead.service))].sort();

  return <div className="space-y-6">
    <Funnel data={data}/>
    <Card className="p-4"><div className="grid gap-3 lg:grid-cols-[1fr_200px_200px]">
      <label className="flex items-center gap-2 border border-[var(--line)] px-3"><Search size={15}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search client…" className="min-h-10 w-full outline-none"/></label>
      <select value={source} onChange={e=>setSource(e.target.value)} className="border border-[var(--line)] px-3"><option value="all">All sources</option>{sources.map(v=><option key={v}>{v}</option>)}</select>
      <select value={service} onChange={e=>setService(e.target.value)} className="border border-[var(--line)] px-3"><option value="all">All services</option>{services.map(v=><option key={v}>{v}</option>)}</select>
    </div></Card>
    <Card className="overflow-hidden">
      <div className="border-b border-[var(--line)] p-5"><SectionHeader title="Client journey map" description="One client sits in one current stage. Cards use CRM, appointment, ROBAWS offer and commercial project evidence."/></div>
      <div className="overflow-x-auto bg-[var(--surface)]"><div className="grid min-w-[1760px] grid-cols-8 gap-px bg-[var(--line)]">
        {journeyStageMeta.map(stage => {
          const group=filtered.filter(r=>r.stage===stage.key);
          return <section key={stage.key} className="min-h-[500px] bg-[var(--surface)]"><header className="border-b border-[var(--line)] bg-white p-3"><div className="flex justify-between"><strong className="text-sm">{stage.label}</strong><b>{group.length}</b></div><p className="mt-1 text-[11px] text-[var(--muted)]">{stage.description}</p></header><div className="space-y-2 p-2">{group.map(row=><JourneyCard key={row.lead.id} row={row}/>)}</div></section>;
        })}
      </div></div>
    </Card>
    <div className="grid gap-px bg-[var(--line)] sm:grid-cols-2 xl:grid-cols-5"><Mini label="Unique people" value={formatNumber(summary.uniquePeople)}/><Mini label="Offers sent" value={formatNumber(summary.offersSent)}/><Mini label="Quoted value" value={formatCurrency(summary.quotedValue)}/><Mini label="Open pipeline" value={formatCurrency(summary.openPipelineValue)}/><Mini label="Verified revenue" value={formatCurrency(summary.verifiedRevenue)}/></div>
  </div>;
}

export function VisitsPage({ data }: { data: CompanyDataset }) {
  const rows=buildJourneyRows(data).filter(r=>r.hasVisit);
  const appointments=data.commercialAppointments??[];
  return <div className="space-y-6"><div className="kpi-grid border-l border-t border-[var(--line)]"><KpiCard label="Visit-stage leads" value={formatNumber(rows.length)}/><KpiCard label="Appointment records" value={formatNumber(appointments.length)}/><KpiCard label="Completed" value={formatNumber(appointments.filter(a=>Boolean(a.completedAt)).length)}/><KpiCard label="No-show" value={formatNumber(appointments.filter(a=>a.noShow).length)}/></div><Card className="p-5"><SectionHeader title="Visits" description="Exact appointment dates are shown only when the CRM supplied them."/>{rows.length?<div className="table-scroll"><table><thead><tr><th>Client</th><th>Source</th><th>Service</th><th>Scheduled</th><th>Completed</th><th>Status</th><th>Next offer</th></tr></thead><tbody>{rows.map(r=>{const a=[...r.appointments].sort((x,y)=>y.scheduledAt.localeCompare(x.scheduledAt))[0];return <tr key={r.lead.id}><td className="font-semibold">{r.lead.name}</td><td>{r.lead.source}</td><td>{r.lead.service}</td><td>{a?dateTime(a.scheduledAt):"Status evidence only"}</td><td>{a?.completedAt?dateTime(a.completedAt):"—"}</td><td>{a?<StatusPill tone={a.noShow?"bad":a.completedAt?"good":"neutral"}>{a.noShow?"No-show":a.status}</StatusPill>:r.lead.crmStatus}</td><td>{r.latestOffer?formatCurrency(r.latestOffer.priceInclVat):"—"}</td></tr>})}</tbody></table></div>:<EmptyState/>}</Card></div>;
}

export function OffersPipelinePage({ data }: { data: CompanyDataset }) {
  const offers=(data.commercialOffers??[]).filter(o=>!o.attributionStatus.includes("DATE_CONFLICT"));
  const open=offers.filter(o=>o.isOpen),accepted=offers.filter(o=>o.isAccepted),rejected=offers.filter(o=>o.isRejected);
  const sum=(rows:typeof offers)=>rows.reduce((n,o)=>n+o.priceInclVat,0);
  return <div className="space-y-6">
    <div className="kpi-grid border-l border-t border-[var(--line)]"><KpiCard label="Offers sent" value={formatNumber(offers.length)}/><KpiCard label="Total quoted" value={formatCurrency(sum(offers),true)}/><KpiCard label="Open pipeline" value={formatCurrency(sum(open),true)} meta={String(open.length)+" open"}/><KpiCard label="Accepted" value={formatCurrency(sum(accepted),true)} meta={String(accepted.length)+" accepted"}/><KpiCard label="Rejected" value={formatCurrency(sum(rejected),true)} meta={String(rejected.length)+" rejected"}/><KpiCard label="Acceptance" value={formatPercent(percentage(accepted.length,offers.length))}/></div>
    <Card className="p-5"><SectionHeader title="Offer register" description="ROBAWS offer/document date, exact amount and current status. The importer does not currently store a separate email-send timestamp, so the board does not fabricate one."/><div className="table-scroll"><table><thead><tr><th>Client</th><th>Source</th><th>Offer</th><th>ROBAWS date</th><th>Excl. VAT</th><th>Incl. VAT</th><th>Status</th><th>Days open</th></tr></thead><tbody>{[...offers].sort((a,b)=>b.date.localeCompare(a.date)).map(o=><tr key={o.id}><td className="font-semibold">{o.leadName}</td><td>{o.source}</td><td>{o.number}</td><td>{date(o.date)}</td><td>{formatCurrency(o.priceExclVat)}</td><td className="font-semibold">{formatCurrency(o.priceInclVat)}</td><td><StatusPill tone={o.isAccepted?"good":o.isRejected?"bad":"warn"}>{o.status}</StatusPill></td><td>{o.daysWaiting===null?"—":String(o.daysWaiting)+" d"}</td></tr>)}</tbody></table></div></Card>
    <Card className="p-5"><SectionHeader title="Pipeline aging" description="Open value that needs sales follow-up."/><div className="grid gap-px bg-[var(--line)] md:grid-cols-4"><Age label="0–7 days" rows={open.filter(o=>(o.daysWaiting??0)<=7)}/><Age label="8–14 days" rows={open.filter(o=>(o.daysWaiting??0)>=8&&(o.daysWaiting??0)<=14)}/><Age label="15–30 days" rows={open.filter(o=>(o.daysWaiting??0)>=15&&(o.daysWaiting??0)<=30)}/><Age label="30+ days" rows={open.filter(o=>(o.daysWaiting??0)>30)}/></div></Card>
    <SourceTable data={data}/>
  </div>;
}

export function SalesProjectsPage({ data }: { data: CompanyDataset }) {
  const projects=(data.commercialProjects??[]).filter(p=>!p.attributionStatus.includes("DATE_CONFLICT"));
  const invoices=(data.commercialInvoices??[]).filter(i=>!i.attributionStatus.includes("DATE_CONFLICT"));
  const projectValue=projects.reduce((n,p)=>n+Number(p.valueInclVat??0),0);
  const invoiced=invoices.reduce((n,i)=>n+Math.max(0,i.totalInclVat-i.creditedTotal),0);
  const paid=invoices.reduce((n,i)=>n+i.paidTotal,0);
  return <div className="space-y-6"><div className="kpi-grid border-l border-t border-[var(--line)]"><KpiCard label="Verified projects" value={formatNumber(new Set(projects.map(p=>p.leadId)).size)}/><KpiCard label="Project value" value={formatCurrency(projectValue,true)}/><KpiCard label="Invoiced" value={formatCurrency(invoiced,true)}/><KpiCard label="Paid" value={formatCurrency(paid,true)}/></div><Card className="p-5"><SectionHeader title="Commercially verified projects" description="CRM signed is not treated as a verified project until commercial evidence exists."/><div className="table-scroll"><table><thead><tr><th>Client</th><th>Source</th><th>Project</th><th>Status</th><th>Value excl. VAT</th><th>Value incl. VAT</th></tr></thead><tbody>{projects.map(p=><tr key={p.id}><td className="font-semibold">{p.leadName}</td><td>{p.source}</td><td>{p.externalId}</td><td>{p.status}</td><td>{formatCurrency(p.valueExclVat)}</td><td className="font-semibold">{formatCurrency(p.valueInclVat)}</td></tr>)}</tbody></table></div></Card></div>;
}

export function CohortsPage({ data }: { data: CompanyDataset }) {
  const rows=buildJourneyRows(data),months=[...new Set(rows.map(r=>r.lead.date.slice(0,7)))].sort().reverse();
  return <div className="space-y-6"><Funnel data={data}/><Card className="p-5"><SectionHeader title="Acquisition cohorts" description="Later offer and project outcomes stay attached to the month the lead was acquired."/><div className="table-scroll"><table><thead><tr><th>Cohort</th><th>Leads</th><th>Visits</th><th>Offers</th><th>Quoted</th><th>CRM signed</th><th>Verified</th><th>Revenue</th></tr></thead><tbody>{months.map(m=>{const g=rows.filter(r=>r.lead.date.startsWith(m));return <tr key={m}><td className="font-semibold">{monthName(m)}</td><td>{g.length}</td><td>{g.filter(r=>r.hasVisit).length}</td><td>{g.filter(r=>r.offers.length>0).length}</td><td>{formatCurrency(g.reduce((n,r)=>n+r.offerValue,0))}</td><td>{g.filter(r=>r.isSigned).length}</td><td>{g.filter(r=>r.stage==="verified").length}</td><td>{formatCurrency(g.reduce((n,r)=>n+r.projectValue,0))}</td></tr>})}</tbody></table></div></Card></div>;
}

export function SalesTeamPage({ data }: { data: CompanyDataset }) {
  const rows=buildJourneyRows(data),names=[...new Set(rows.map(r=>r.lead.salesperson||"Unassigned"))];
  const team=names.map(name=>{const g=rows.filter(r=>(r.lead.salesperson||"Unassigned")===name);return {name,leads:g.length,visits:g.filter(r=>r.hasVisit).length,offers:g.filter(r=>r.offers.length>0).length,quoted:g.reduce((n,r)=>n+r.offerValue,0),signed:g.filter(r=>r.isSigned).length,verified:g.filter(r=>r.stage==="verified").length,revenue:g.reduce((n,r)=>n+r.projectValue,0)}}).sort((a,b)=>b.revenue-a.revenue||b.leads-a.leads);
  return <Card className="p-5"><SectionHeader title="Sales team performance" description="Separates lead quality from sales execution; unassigned leads remain visible."/><div className="table-scroll"><table><thead><tr><th>Salesperson</th><th>Leads</th><th>Visits</th><th>Offers</th><th>Quoted</th><th>CRM signed</th><th>Verified</th><th>Revenue</th><th>Offer → verified</th></tr></thead><tbody>{team.map(r=><tr key={r.name}><td className="font-semibold">{r.name}</td><td>{r.leads}</td><td>{r.visits}</td><td>{r.offers}</td><td>{formatCurrency(r.quoted)}</td><td>{r.signed}</td><td>{r.verified}</td><td>{formatCurrency(r.revenue)}</td><td>{formatPercent(percentage(r.verified,r.offers))}</td></tr>)}</tbody></table></div></Card>;
}

function Funnel({ data }: { data: CompanyDataset }) {
  const s=buildFunnelSummary(data);
  const stages=[["Leads",s.leads],["Unique",s.uniquePeople],["Qualified",s.qualified],["Visits",s.visits],["Offers",s.offersSent],["Open",s.openOffers],["Accepted",s.acceptedOffers],["Signed",s.crmSigned],["Verified",s.verifiedProjects]] as const;
  return <Card className="overflow-hidden"><div className="overflow-x-auto"><div className="flex min-w-[1320px] divide-x divide-[var(--line)]"><div className="min-w-[150px] bg-[var(--ink)] p-4 text-white"><span className="text-xs uppercase text-white/60">Spend</span><strong className="mt-2 block text-xl">{formatCurrency(data.metrics.spend,true)}</strong></div>{stages.map(([label,value])=><div key={label} className="min-w-[130px] flex-1 bg-white p-4"><span className="text-xs uppercase text-[var(--muted)]">{label}</span><strong className="mt-2 block text-xl">{value}</strong></div>)}</div></div></Card>;
}

function JourneyCard({ row }: { row: JourneyRow }) { const a=row.appointments[0],o=row.latestOffer; return <div className="border border-[var(--line)] bg-white p-3"><div className="flex justify-between gap-2"><strong className="text-sm">{row.lead.name}</strong><StatusPill tone={tone(row.stage)}>{journeyStageMeta.find(s=>s.key===row.stage)?.label}</StatusPill></div><p className="mt-1 text-[11px] text-[var(--muted)]">{row.lead.source+" · "+row.lead.service}</p><div className="mt-3 space-y-1 text-xs"><p>Lead: {date(row.lead.date)}</p>{a&&<p>Visit: {dateTime(a.completedAt??a.scheduledAt)}</p>}{o&&<p>Offer: <b>{formatCurrency(o.priceInclVat)}</b> · {date(o.date)}</p>}{row.projectValue>0&&<p>Project: <b>{formatCurrency(row.projectValue)}</b></p>}</div></div>; }
function SourceTable({ data }: { data: CompanyDataset }) { const rows=sourcePipelineRows(data); return <Card className="p-5"><SectionHeader title="Source → funnel → money" description="Same definitions for every acquisition source."/><div className="table-scroll"><table><thead><tr><th>Source</th><th>Leads</th><th>Qualified</th><th>Visits</th><th>Offers</th><th>Quoted</th><th>Open pipeline</th><th>Signed</th><th>Verified</th><th>Revenue</th></tr></thead><tbody>{rows.map(r=><tr key={r.source}><td className="font-semibold">{r.source}</td><td>{r.leads}</td><td>{r.qualified}</td><td>{r.visits}</td><td>{r.offers}</td><td>{formatCurrency(r.quotedValue)}</td><td>{formatCurrency(r.openPipeline)}</td><td>{r.signed}</td><td>{r.verified}</td><td className="font-semibold">{formatCurrency(r.revenue)}</td></tr>)}</tbody></table></div></Card>; }
function Age({ label, rows }: { label:string; rows:NonNullable<CompanyDataset["commercialOffers"]> }) { return <div className="bg-white p-4"><span className="text-xs text-[var(--muted)]">{label}</span><strong className="mt-2 block">{formatCurrency(rows.reduce((n,o)=>n+o.priceInclVat,0))}</strong><small>{rows.length} offers</small></div>; }
function Mini({label,value}:{label:string;value:string}){return <div className="bg-white p-4"><span className="text-xs uppercase text-[var(--muted)]">{label}</span><strong className="mt-2 block text-lg">{value}</strong></div>}
function tone(stage:JourneyStage):"neutral"|"good"|"warn"|"bad"|"accent"{return stage==="verified"?"good":stage==="lost"?"bad":stage==="offer"||stage==="accepted"||stage==="signed"?"warn":stage==="visit"||stage==="qualified"?"accent":"neutral"}
function date(value:string){if(!value)return "—";return new Intl.DateTimeFormat("nl-BE",{day:"2-digit",month:"short",year:"numeric",timeZone:"Europe/Brussels"}).format(new Date(value.length===10?value+"T12:00:00Z":value))}
function dateTime(value:string){if(!value)return "—";return new Intl.DateTimeFormat("nl-BE",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",timeZone:"Europe/Brussels"}).format(new Date(value))}
function monthName(value:string){const parts=value.split("-").map(Number);return new Intl.DateTimeFormat("en-GB",{month:"long",year:"numeric",timeZone:"Europe/Brussels"}).format(new Date(Date.UTC(parts[0],parts[1]-1,1)))}
