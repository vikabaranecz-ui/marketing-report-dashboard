"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, RotateCcw, Search, X } from "lucide-react";
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
  const [selected, setSelected] = useState<JourneyRow | null>(null);
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
          return <section key={stage.key} className="min-h-[500px] bg-[var(--surface)]"><header className="border-b border-[var(--line)] bg-white p-3"><div className="flex justify-between"><strong className="text-sm">{stage.label}</strong><b>{group.length}</b></div><p className="mt-1 text-[11px] text-[var(--muted)]">{stage.description}</p></header><div className="space-y-2 p-2">{group.map(row=><JourneyCard key={row.lead.id} row={row} onOpen={()=>setSelected(row)}/>)}</div></section>;
        })}
      </div></div>
    </Card>
    <div className="grid gap-px bg-[var(--line)] sm:grid-cols-2 xl:grid-cols-7"><Mini label="Unique people" value={formatNumber(summary.uniquePeople)}/><Mini label="Offers created" value={formatNumber(summary.offersCreated)}/><Mini label="Offers sent" value={formatNumber(summary.offersSent)}/><Mini label="Sent quote value" value={formatCurrency(summary.sentQuotedValue)}/><Mini label="Open pipeline" value={formatCurrency(summary.openPipelineValue)}/><Mini label="Commercial clients" value={formatNumber(summary.commercialClients)}/><Mini label="Project value" value={formatCurrency(summary.verifiedRevenue)}/></div>
    {selected&&<ClientDrawer data={data} row={selected} onClose={()=>setSelected(null)}/>}
  </div>;
}

export function VisitsPage({ data }: { data: CompanyDataset }) {
  const rows=buildJourneyRows(data).filter(r=>r.hasVisit);
  const appointments=data.commercialAppointments??[];
  return <div className="space-y-6"><div className="kpi-grid border-l border-t border-[var(--line)]"><KpiCard label="Visit-stage leads" value={formatNumber(rows.length)}/><KpiCard label="Appointment records" value={formatNumber(appointments.length)}/><KpiCard label="Completed" value={formatNumber(appointments.filter(a=>Boolean(a.completedAt)).length)}/><KpiCard label="No-show" value={formatNumber(appointments.filter(a=>a.noShow).length)}/></div><Card className="p-5"><SectionHeader title="Visits" description="Exact appointment dates are shown only when the CRM supplied them."/>{rows.length?<div className="table-scroll"><table><thead><tr><th>Client</th><th>Source</th><th>Service</th><th>Scheduled</th><th>Completed</th><th>Status</th><th>Next offer</th></tr></thead><tbody>{rows.map(r=>{const a=[...r.appointments].sort((x,y)=>y.scheduledAt.localeCompare(x.scheduledAt))[0];return <tr key={r.lead.id}><td className="font-semibold">{r.lead.name}</td><td>{r.lead.source}</td><td>{r.lead.service}</td><td>{a?dateTime(a.scheduledAt):"Status evidence only"}</td><td>{a?.completedAt?dateTime(a.completedAt):"—"}</td><td>{a?<StatusPill tone={a.noShow?"bad":a.completedAt?"good":"neutral"}>{a.noShow?"No-show":a.status}</StatusPill>:r.lead.crmStatus}</td><td>{r.latestOffer?formatCurrency(r.latestOffer.priceInclVat):"—"}</td></tr>})}</tbody></table></div>:<EmptyState/>}</Card></div>;
}

export function OffersPipelinePage({ data }: { data: CompanyDataset }) {
  const offers=(data.commercialOffers??[]).filter(o=>!o.attributionStatus.includes("DATE_CONFLICT"));
  const sent=offers.filter(o=>Boolean(o.sentAt));
  const open=sent.filter(o=>o.isOpen),accepted=offers.filter(o=>o.isAccepted),rejected=offers.filter(o=>o.isRejected);
  const unsentOpen=offers.filter(o=>o.isOpen&&!o.sentAt);
  const projects=(data.commercialProjects??[]).filter(p=>!p.attributionStatus.includes("DATE_CONFLICT"));
  const invoices=(data.commercialInvoices??[]).filter(i=>!i.attributionStatus.includes("DATE_CONFLICT"));
  const projectValue=projects.reduce((n,p)=>n+Number(p.valueInclVat??0),0);
  const invoiced=invoices.reduce((n,i)=>n+Math.max(0,i.totalInclVat-i.creditedTotal),0);
  const paid=invoices.reduce((n,i)=>n+i.paidTotal,0);
  const now=Date.now();
  const followUpsDue=open.filter(o=>o.followUpAt&&new Date(o.followUpAt).getTime()<=now);
  const sum=(rows:typeof offers)=>rows.reduce((n,o)=>n+o.priceInclVat,0);
  return <div className="space-y-6">
    <div className="kpi-grid border-l border-t border-[var(--line)]"><KpiCard label="Offers created" value={formatNumber(offers.length)} meta={formatCurrency(sum(offers))+" total value"}/><KpiCard label="Sent to client" value={formatNumber(sent.length)} meta={formatCurrency(sum(sent))+" sent value"}/><KpiCard label="Open sent pipeline" value={formatCurrency(sum(open),true)} meta={String(open.length)+" sent + open"}/><KpiCard label="Send not verified" value={formatCurrency(sum(unsentOpen),true)} meta={String(unsentOpen.length)+" open offers"}/><KpiCard label="Accepted" value={formatCurrency(sum(accepted),true)} meta={String(accepted.length)+" accepted"}/><KpiCard label="Follow-ups due" value={formatNumber(followUpsDue.length)} meta={formatCurrency(sum(followUpsDue))+" open value"}/><KpiCard label="Rejected" value={formatCurrency(sum(rejected),true)} meta={String(rejected.length)+" rejected"}/></div>
    <Card className="p-5"><SectionHeader title="Offer register" description="Offer date and sent-to-client date stay separate. Sent is shown only when ROBAWS supplies its send date."/><div className="table-scroll"><table><thead><tr><th>Client</th><th>Source</th><th>Offer</th><th>Offer date</th><th>Sent to client</th><th>Follow-up</th><th>Excl. VAT</th><th>Incl. VAT</th><th>Status</th><th>Days open</th></tr></thead><tbody>{[...offers].sort((a,b)=>(b.sentAt??b.date).localeCompare(a.sentAt??a.date)).map(o=><tr key={o.id}><td className="font-semibold">{o.leadName}</td><td>{o.source}</td><td>{o.number}</td><td>{date(o.date)}</td><td>{o.sentAt?<StatusPill tone="good">{dateTime(o.sentAt)}</StatusPill>:<StatusPill tone="neutral">Not verified</StatusPill>}</td><td>{o.followUpAt?dateTime(o.followUpAt):"—"}</td><td>{formatCurrency(o.priceExclVat)}</td><td className="font-semibold">{formatCurrency(o.priceInclVat)}</td><td><StatusPill tone={o.isAccepted?"good":o.isRejected?"bad":"warn"}>{o.status}</StatusPill></td><td>{o.daysWaiting===null?"—":String(o.daysWaiting)+" d"}</td></tr>)}</tbody></table></div></Card>
    <Card className="p-5"><SectionHeader title="Pipeline aging" description="Open value that needs sales follow-up."/><div className="grid gap-px bg-[var(--line)] md:grid-cols-4"><Age label="0–7 days" rows={open.filter(o=>(o.daysWaiting??0)<=7)}/><Age label="8–14 days" rows={open.filter(o=>(o.daysWaiting??0)>=8&&(o.daysWaiting??0)<=14)}/><Age label="15–30 days" rows={open.filter(o=>(o.daysWaiting??0)>=15&&(o.daysWaiting??0)<=30)}/><Age label="30+ days" rows={open.filter(o=>(o.daysWaiting??0)>30)}/></div></Card>
    <Card className="p-5"><SectionHeader title="Commercial result" description="Pipeline and cash stay together on the same operational page."/><div className="grid gap-px bg-[var(--line)] sm:grid-cols-2 xl:grid-cols-4"><Mini label="Project value" value={formatCurrency(projectValue)}/><Mini label="Invoiced" value={formatCurrency(invoiced)}/><Mini label="Paid" value={formatCurrency(paid)}/><Mini label="Unpaid invoiced" value={formatCurrency(Math.max(0,invoiced-paid))}/></div></Card>
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
  return <div className="space-y-6"><Funnel data={data}/><Card className="p-5"><SectionHeader title="Acquisition cohorts" description="Later offer and project outcomes stay attached to the month the lead was acquired."/><div className="table-scroll"><table><thead><tr><th>Cohort</th><th>Unique people</th><th>Visits</th><th>Offers created</th><th>Sent</th><th>Sent €</th><th>Open sent €</th><th>CRM signed</th><th>Verified</th><th>Revenue</th></tr></thead><tbody>{months.map(m=>{const g=rows.filter(r=>r.lead.date.startsWith(m));return <tr key={m}><td className="font-semibold">{monthName(m)}</td><td>{g.length}</td><td>{g.filter(r=>r.hasVisit).length}</td><td>{g.filter(r=>r.offers.length>0).length}</td><td>{g.filter(r=>r.offers.some(o=>Boolean(o.sentAt))).length}</td><td>{formatCurrency(g.reduce((n,r)=>n+r.sentOfferValue,0))}</td><td>{formatCurrency(g.reduce((n,r)=>n+r.openOfferValue,0))}</td><td>{g.filter(r=>r.isSigned).length}</td><td>{g.filter(r=>r.stage==="verified").length}</td><td>{formatCurrency(g.reduce((n,r)=>n+r.projectValue,0))}</td></tr>})}</tbody></table></div></Card></div>;
}

export function SalesTeamPage({ data }: { data: CompanyDataset }) {
  const rows=buildJourneyRows(data),names=[...new Set(rows.map(r=>r.lead.salesperson||"Unassigned"))];
  const team=names.map(name=>{const g=rows.filter(r=>(r.lead.salesperson||"Unassigned")===name);return {name,leads:g.length,visits:g.filter(r=>r.hasVisit).length,offersCreated:g.filter(r=>r.offers.length>0).length,offers:g.filter(r=>r.offers.some(o=>Boolean(o.sentAt))).length,quoted:g.reduce((n,r)=>n+r.sentOfferValue,0),open:g.reduce((n,r)=>n+r.openOfferValue,0),signed:g.filter(r=>r.isSigned).length,verified:g.filter(r=>r.stage==="verified").length,revenue:g.reduce((n,r)=>n+r.projectValue,0)}}).sort((a,b)=>b.revenue-a.revenue||b.leads-a.leads);
  return <Card className="p-5"><SectionHeader title="Sales team performance" description="Separates lead quality from sales execution; unassigned leads remain visible."/><div className="table-scroll"><table><thead><tr><th>Salesperson</th><th>Unique people</th><th>Visits</th><th>Offers created</th><th>Sent</th><th>Sent €</th><th>Open sent €</th><th>CRM signed</th><th>Verified</th><th>Revenue</th><th>Offer → verified</th></tr></thead><tbody>{team.map(r=><tr key={r.name}><td className="font-semibold">{r.name}</td><td>{r.leads}</td><td>{r.visits}</td><td>{r.offersCreated}</td><td>{r.offers}</td><td>{formatCurrency(r.quoted)}</td><td>{formatCurrency(r.open)}</td><td>{r.signed}</td><td>{r.verified}</td><td>{formatCurrency(r.revenue)}</td><td>{formatPercent(percentage(r.verified,r.offers))}</td></tr>)}</tbody></table></div></Card>;
}

function Funnel({ data }: { data: CompanyDataset }) {
  const s=buildFunnelSummary(data);
  const stages=[["Leads",s.leads],["Unique",s.uniquePeople],["Qualified",s.qualified],["Visits",s.visits],["Offers created",s.offersCreated],["Sent",s.offersSent],["Open",s.openOffers],["Accepted",s.acceptedOffers],["Signed",s.crmSigned],["Commercial clients",s.commercialClients]] as const;
  return <Card className="overflow-hidden"><div className="overflow-x-auto"><div className="flex min-w-[1320px] divide-x divide-[var(--line)]"><div className="min-w-[150px] bg-[var(--ink)] p-4 text-white"><span className="text-xs uppercase text-white/60">Tracked marketing spend</span><strong className="mt-2 block text-xl">{formatCurrency(data.metrics.spend,true)}</strong><small className="mt-1 block text-[10px] text-white/45">Synced platform spend only</small></div>{stages.map(([label,value])=><div key={label} className="min-w-[130px] flex-1 bg-white p-4"><span className="text-xs uppercase text-[var(--muted)]">{label}</span><strong className="mt-2 block text-xl">{value}</strong></div>)}</div></div></Card>;
}

function JourneyCard({ row,onOpen }: { row: JourneyRow; onOpen:()=>void }) { const a=[...row.appointments].sort((x,y)=>y.scheduledAt.localeCompare(x.scheduledAt))[0],o=row.latestOffer; return <button onClick={onOpen} className="w-full border border-[var(--line)] bg-white p-3 text-left transition hover:border-[var(--ink)]"><div className="flex justify-between gap-2"><strong className="text-sm">{row.lead.name}</strong><StatusPill tone={tone(row.stage)}>{journeyStageMeta.find(s=>s.key===row.stage)?.label}</StatusPill></div><p className="mt-1 text-[11px] text-[var(--muted)]">{row.lead.source+" · "+row.lead.service}</p>{row.crmRecordCount>1&&<p className="mt-1 text-[11px] font-semibold text-amber-700">{row.crmRecordCount+" CRM records merged"}</p>}<div className="mt-3 space-y-1 text-xs"><p>Lead: {date(row.lead.date)}</p>{a&&<p>Visit: {dateTime(a.completedAt??a.scheduledAt)}</p>}{o&&<p>Offer: <b>{formatCurrency(o.priceInclVat)}</b> · {o.sentAt?"sent "+dateTime(o.sentAt):"send not verified"}</p>}{row.projectValue>0&&<p>Project: <b>{formatCurrency(row.projectValue)}</b></p>}</div></button>; }
function ClientDrawer({data,row,onClose}:{data:CompanyDataset;row:JourneyRow;onClose:()=>void}) {
  const router=useRouter();
  const overrides=(data.manualOverrides??[]).filter(item=>item.scopeType==="client"&&item.scopeKey===row.lead.id);
  const [editing,setEditing]=useState(false);
  const [source,setSource]=useState(row.lead.source);
  const [service,setService]=useState(row.lead.service);
  const [campaign,setCampaign]=useState(row.lead.campaign);
  const [municipality,setMunicipality]=useState(row.lead.municipality);
  const [pending,setPending]=useState(false);
  const [error,setError]=useState("");

  async function save(){
    setPending(true);setError("");
    const fields={source,service,campaign,municipality};
    for(const [fieldKey,value] of Object.entries(fields)){
      const response=await fetch("/api/overrides",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({
        companyId:data.company.id,periodKey:data.periodKey??"ytd",scopeType:"client",scopeKey:row.lead.id,fieldKey,value,
        note:"Manual client correction from Client Map",
      })});
      if(!response.ok){const body=await response.json().catch(()=>({}));setError(body.error??"Could not save client correction.");setPending(false);return;}
    }
    setPending(false);setEditing(false);router.refresh();
  }

  async function reset(){
    setPending(true);setError("");
    for(const fieldKey of ["source","service","campaign","municipality"]){
      const response=await fetch("/api/overrides",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({
        companyId:data.company.id,periodKey:data.periodKey??"ytd",scopeType:"client",scopeKey:row.lead.id,fieldKey,
      })});
      if(!response.ok){const body=await response.json().catch(()=>({}));setError(body.error??"Could not reset client corrections.");setPending(false);return;}
    }
    setPending(false);setEditing(false);onClose();router.refresh();
  }

  return <div className="fixed inset-0 z-50 bg-black/35 p-4" onMouseDown={onClose}><aside className="ml-auto h-full w-full max-w-xl overflow-y-auto bg-white shadow-2xl" onMouseDown={e=>e.stopPropagation()}>
    <header className="sticky top-0 z-10 flex items-start justify-between border-b border-[var(--line)] bg-white p-5"><div><div className="flex items-center gap-2"><p className="eyebrow">Client evidence</p>{overrides.length>0&&<StatusPill tone="accent">Manual corrections</StatusPill>}</div><h2 className="mt-1 text-xl font-semibold">{row.lead.name}</h2><p className="mt-1 text-sm text-[var(--muted)]">{row.lead.source+" · "+row.lead.service+" · "+row.lead.municipality}</p></div><button onClick={onClose} className="p-2" aria-label="Close client details"><X size={18}/></button></header>
    <div className="space-y-6 p-5">
      <div className="grid gap-px bg-[var(--line)] sm:grid-cols-2"><Mini label="CRM records merged" value={String(row.crmRecordCount)}/><Mini label="First-touch source" value={row.lead.source}/><Mini label="Sources seen" value={row.sourcesSeen.join(" → ")}/><Mini label="Salesperson" value={row.lead.salesperson}/></div>

      <section className="border border-[var(--line)] p-4">
        <div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-semibold">Classification</h3><p className="mt-1 text-xs text-[var(--muted)]">Correct reporting fields without editing Monday or ROBAWS.</p></div><button type="button" className="button-secondary" onClick={()=>setEditing(value=>!value)}><Pencil size={14}/>{editing?"Cancel":"Edit"}</button></div>
        {editing?<div className="mt-4 grid gap-3">
          <label><span className="mb-1 block text-xs font-semibold text-[var(--muted)]">Source</span><input className="h-10 w-full border border-[var(--line)] px-3" value={source} onChange={e=>setSource(e.target.value)}/></label>
          <label><span className="mb-1 block text-xs font-semibold text-[var(--muted)]">Service</span><select className="h-10 w-full border border-[var(--line)] px-3" value={service} onChange={e=>setService(e.target.value)}><option value={service}>{service||"Unassigned"}</option>{data.services.filter(item=>item.name!==service).map(item=><option key={item.id} value={item.name}>{item.name}</option>)}</select></label>
          <label><span className="mb-1 block text-xs font-semibold text-[var(--muted)]">Campaign</span><select className="h-10 w-full border border-[var(--line)] px-3" value={campaign} onChange={e=>setCampaign(e.target.value)}><option value={campaign}>{campaign||"Unattributed"}</option>{data.campaigns.filter(item=>item.name!==campaign).map(item=><option key={item.id} value={item.name}>{item.name}</option>)}</select></label>
          <label><span className="mb-1 block text-xs font-semibold text-[var(--muted)]">Municipality</span><input className="h-10 w-full border border-[var(--line)] px-3" value={municipality} onChange={e=>setMunicipality(e.target.value)}/></label>
          {error&&<div className="border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}
          <div className="flex gap-2"><button type="button" onClick={save} disabled={pending} className="button-primary flex-1">{pending?"Saving…":"Save correction"}</button>{overrides.length>0&&<button type="button" onClick={reset} disabled={pending} className="button-secondary"><RotateCcw size={14}/> Reset synced</button>}</div>
        </div>:<div className="mt-4 grid grid-cols-2 gap-3 text-sm"><p><span className="block text-xs text-[var(--muted)]">Source</span><b>{row.lead.source}</b></p><p><span className="block text-xs text-[var(--muted)]">Service</span><b>{row.lead.service}</b></p><p><span className="block text-xs text-[var(--muted)]">Campaign</span><b>{row.lead.campaign}</b></p><p><span className="block text-xs text-[var(--muted)]">Municipality</span><b>{row.lead.municipality}</b></p></div>}
      </section>

      <section><h3 className="mb-3 text-sm font-semibold">Client</h3><div className="space-y-2 text-sm"><p><b>Email:</b> {row.lead.email||"—"}</p><p><b>Phone:</b> {row.lead.phone||"—"}</p><p><b>CRM status:</b> {row.lead.crmStatus}</p></div></section>
      <section><h3 className="mb-3 text-sm font-semibold">Timeline</h3><div className="space-y-3 border-l border-[var(--line)] pl-4"><Timeline title="Lead acquired" when={date(row.lead.date)} detail={row.lead.source+" · "+row.lead.campaign}/>{row.appointments.map((a,i)=><Timeline key={"a"+i} title={a.completedAt?"Visit completed":"Visit scheduled"} when={dateTime(a.completedAt??a.scheduledAt)} detail={a.noShow?"No-show":a.status}/>)}{row.offers.map(o=><Timeline key={o.id} title={"Offer "+o.number} when={o.sentAt?"Sent "+dateTime(o.sentAt):"Created "+date(o.date)+" · send not verified"} detail={formatCurrency(o.priceExclVat)+" excl. VAT · "+formatCurrency(o.priceInclVat)+" incl. VAT · "+o.status+(o.followUpAt?" · follow-up "+dateTime(o.followUpAt):"")}/>)}{row.isSigned&&<Timeline title="CRM signed" when="CRM evidence" detail="Kept separate from commercial verification."/>}{row.projects.map(p=><Timeline key={p.id} title={"Commercial project "+p.externalId} when="ROBAWS evidence" detail={formatCurrency(p.valueInclVat)+" · "+p.status}/>)}{row.invoices.map(i=><Timeline key={i.id} title={"Invoice "+i.number} when={i.date?date(i.date):"Commercial evidence"} detail={formatCurrency(i.totalInclVat)+" invoiced · "+formatCurrency(i.paidTotal)+" paid · "+i.status}/>)}</div></section>
      {row.stage==="lost"&&<div className="border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"><b>Lost / not relevant</b><p className="mt-1">{row.lostReason||"No structured reason recorded."}</p></div>}
    </div>
  </aside></div>;
}
function Timeline({title,when,detail}:{title:string;when:string;detail:string}){return <div><div className="flex flex-wrap items-center gap-2"><strong className="text-sm">{title}</strong><span className="text-xs text-[var(--muted)]">{when}</span></div><p className="mt-1 text-sm text-[var(--muted)]">{detail}</p></div>}

function Age({ label, rows }: { label:string; rows:NonNullable<CompanyDataset["commercialOffers"]> }) { return <div className="bg-white p-4"><span className="text-xs text-[var(--muted)]">{label}</span><strong className="mt-2 block">{formatCurrency(rows.reduce((n,o)=>n+o.priceInclVat,0))}</strong><small>{rows.length} offers</small></div>; }
function Mini({label,value}:{label:string;value:string}){return <div className="bg-white p-4"><span className="text-xs uppercase text-[var(--muted)]">{label}</span><strong className="mt-2 block text-lg">{value}</strong></div>}
function tone(stage:JourneyStage):"neutral"|"good"|"warn"|"bad"|"accent"{return stage==="verified"?"good":stage==="lost"?"bad":stage==="offer"||stage==="accepted"||stage==="signed"?"warn":stage==="visit"||stage==="qualified"?"accent":"neutral"}
function date(value:string){if(!value)return "—";return new Intl.DateTimeFormat("nl-BE",{day:"2-digit",month:"short",year:"numeric",timeZone:"Europe/Brussels"}).format(new Date(value.length===10?value+"T12:00:00Z":value))}
function dateTime(value:string){if(!value)return "—";return new Intl.DateTimeFormat("nl-BE",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",timeZone:"Europe/Brussels"}).format(new Date(value))}
function monthName(value:string){const parts=value.split("-").map(Number);return new Intl.DateTimeFormat("en-GB",{month:"long",year:"numeric",timeZone:"Europe/Brussels"}).format(new Date(Date.UTC(parts[0],parts[1]-1,1)))}
