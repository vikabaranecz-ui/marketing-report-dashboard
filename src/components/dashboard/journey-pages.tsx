"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CalendarClock, CircleDollarSign, Pencil, RotateCcw, Search, WalletCards, X } from "lucide-react";
import type { CompanyDataset } from "@/lib/data/types";
import { formatCurrency, formatNumber, formatPercent, percentage } from "@/lib/metrics/kpis";
import { buildFunnelSummary, buildJourneyRows, journeyStageMeta, sourcePipelineRows, type JourneyRow, type JourneyStage } from "@/lib/metrics/client-funnel";
import { buildOverviewAnalytics } from "@/lib/metrics/business-overview";
import { Card, EmptyState, KpiCard, SectionHeader, StatusPill } from "./ui";
import { RecordDrilldownDrawer, type RecordDrilldown } from "./record-drilldown";

export function ClientJourneyPage({ data }: { data: CompanyDataset }) {
  const rows = useMemo(() => buildJourneyRows(data), [data]);
  const cohortAnalytics = useMemo(() => buildOverviewAnalytics(data,{source:"all",campaign:"all"}), [data]);
  const paybackRows = useMemo(() => rows
    .filter(row => row.isCommercialClient || row.projects.length > 0 || row.invoices.length > 0)
    .map(buildPaybackRecord)
    .sort((a,b) => b.acquired.localeCompare(a.acquired)), [rows]);

  const [search,setSearch]=useState("");
  const [source,setSource]=useState("all");
  const [status,setStatus]=useState("all");
  const [limit,setLimit]=useState(12);
  const [selected,setSelected]=useState<JourneyRow|null>(null);

  const sources=[...new Set(paybackRows.map(item=>item.row.lead.source||"Unattributed"))].sort();
  const filtered=paybackRows.filter(item=>{
    const haystack=[
      item.row.lead.name,item.row.lead.email,item.row.lead.phone,item.row.lead.source,
      item.row.lead.service,item.row.lead.municipality,item.row.lead.crmStatus,
      ...item.row.invoices.flatMap(invoice=>[invoice.number,invoice.status]),
    ].join(" ").toLowerCase();
    return (!search||haystack.includes(search.toLowerCase()))
      && (source==="all"||item.row.lead.source===source)
      && (status==="all"||item.paybackStatus===status);
  });

  const totals=paybackRows.reduce((acc,item)=>({
    clients:acc.clients+1,
    projectValue:acc.projectValue+item.projectValue,
    invoiced:acc.invoiced+item.invoiced,
    paid:acc.paid+item.paid,
    open:acc.open+item.open,
  }),{clients:0,projectValue:0,invoiced:0,paid:0,open:0});
  const lagValues=paybackRows.map(item=>item.daysToFirstInvoice).filter((value):value is number=>value!==null&&value>=0);
  const avgLag=lagValues.length?Math.round(lagValues.reduce((sum,value)=>sum+value,0)/lagValues.length):null;

  const monthlyCash=[...paybackRows.reduce((map,item)=>{
    for(const month of item.cashMonths){
      const current=map.get(month.month)??{month:month.month,invoiced:0,paid:0,clients:new Set<string>()};
      current.invoiced+=month.invoiced;
      current.paid+=month.paid;
      current.clients.add(item.row.lead.id);
      map.set(month.month,current);
    }
    return map;
  },new Map<string,{month:string;invoiced:number;paid:number;clients:Set<string>}>()).values()].sort((a,b)=>a.month.localeCompare(b.month));

  const hasFilters=Boolean(search||source!=="all"||status!=="all");

  return <div className="space-y-6">
    <Card className="overflow-hidden">
      <div className="payback-hero">
        <div>
          <p className="eyebrow">Acquisition cohort → later cash</p>
          <h2>Customer payback</h2>
          <p>A customer stays attached to the month the lead was acquired, even when the project and invoices happen months later.</p>
        </div>
        <div className="payback-scope"><CalendarClock size={17}/><div><span>Selected acquisition period</span><strong>{data.periodLabel}</strong></div></div>
      </div>
      <div className="payback-truth-note">
        <strong>Timing rule:</strong> CRM gives the acquisition date. ROBAWS gives a project record date and invoice dates. The API does not currently expose reliable work-start/work-finish dates or payment timestamps, so the dashboard does not pretend invoice dates are construction dates. “Paid by month” below means paid value attached to invoices dated in that month.
      </div>
    </Card>

    {cohortAnalytics.cohort.supplierOnly>0&&<div className="payback-truth-note"><strong>Acquisition coverage:</strong> {formatNumber(cohortAnalytics.cohort.supplierOnly)} supplier-only leads are known but have no CRM record/acquisition date, so they are not assigned to a monthly payback cohort.</div>}
    <div className="payback-kpis">
      <PaybackKpi label="Customers" value={formatNumber(totals.clients)} note="Commercially evidenced customers"/>
      <PaybackKpi label="Project value" value={formatCurrency(totals.projectValue,true)} note="ROBAWS-linked project value"/>
      <PaybackKpi label="Invoiced" value={formatCurrency(totals.invoiced,true)} note="Net of credits"/>
      <PaybackKpi label="Paid to date" value={formatCurrency(totals.paid,true)} note="Current paid total on invoices" accent/>
      <PaybackKpi label="Outstanding" value={formatCurrency(totals.open,true)} note="Invoiced minus paid"/>
      <PaybackKpi label="Lead → first invoice" value={avgLag===null?"—":avgLag+" days"} note="Average for customers with invoices"/>
    </div>

    <Card className="p-5">
      <SectionHeader title="Cash realization by invoice month" description="For the selected acquisition cohort, this shows when later invoices appear and how much paid value is currently attached to those invoices."/>
      {monthlyCash.length?<div className="payback-month-grid">
        {monthlyCash.map(item=><div key={item.month} className="payback-month">
          <span>{monthName(item.month)}</span>
          <strong>{formatCurrency(item.paid,true)}</strong>
          <small>{item.clients.size} client(s) · {formatCurrency(item.invoiced,true)} invoiced</small>
        </div>)}
      </div>:<EmptyState title="No invoices for this acquisition cohort yet" body="Customers will appear here when linked ROBAWS invoices are available."/>}
    </Card>

    <Card className="p-4">
      <div className="grid gap-3 xl:grid-cols-[minmax(280px,1fr)_210px_210px_auto]">
        <label className="flex items-center gap-2 rounded-lg border border-[var(--line)] bg-white px-3"><Search size={15}/><input value={search} onChange={e=>{setSearch(e.target.value);setLimit(12)}} placeholder="Search client, invoice, source, location…" className="min-h-10 w-full outline-none"/></label>
        <select value={source} onChange={e=>{setSource(e.target.value);setLimit(12)}} className="rounded-lg border border-[var(--line)] bg-white px-3"><option value="all">All sources</option>{sources.map(value=><option key={value}>{value}</option>)}</select>
        <select value={status} onChange={e=>{setStatus(e.target.value);setLimit(12)}} className="rounded-lg border border-[var(--line)] bg-white px-3">
          <option value="all">All payback states</option>
          <option value="paid">Fully paid</option>
          <option value="partial">Partly paid</option>
          <option value="unpaid">Invoiced · unpaid</option>
          <option value="project">Project · not invoiced</option>
        </select>
        {hasFilters?<button type="button" className="button-secondary" onClick={()=>{setSearch("");setSource("all");setStatus("all");setLimit(12)}}>Clear filters</button>:<div className="flex items-center justify-end text-xs font-semibold text-[var(--muted)]">{filtered.length} customers</div>}
      </div>
    </Card>

    <div className="payback-list">
      {filtered.slice(0,limit).map(item=><button type="button" key={item.row.lead.id} className="payback-card drillable text-left" onClick={()=>setSelected(item.row)}>
        <div className="payback-card-head">
          <div><strong>{item.row.lead.name}</strong><p>{item.row.lead.source} · {item.row.lead.service} · {item.row.lead.municipality}</p></div>
          <StatusPill tone={item.paybackStatus==="paid"?"good":item.paybackStatus==="partial"?"warn":item.paybackStatus==="unpaid"?"bad":"neutral"}>{paybackStatusLabel(item.paybackStatus)}</StatusPill>
        </div>

        <div className="payback-milestones">
          <PaybackMilestone label="Lead acquired" value={date(item.acquired)}/>
          <ArrowRight size={14}/>
          <PaybackMilestone label="ROBAWS project date" value={item.projectDate?date(item.projectDate):"—"}/>
          <ArrowRight size={14}/>
          <PaybackMilestone label="First invoice" value={item.firstInvoice?date(item.firstInvoice):"—"}/>
          <ArrowRight size={14}/>
          <PaybackMilestone label="Last invoice" value={item.lastInvoice?date(item.lastInvoice):"—"}/>
        </div>

        <div className="payback-money-grid">
          <div><span>Project value</span><strong>{formatCurrency(item.projectValue,true)}</strong></div>
          <div><span>Invoiced</span><strong>{formatCurrency(item.invoiced,true)}</strong></div>
          <div><span>Paid</span><strong>{formatCurrency(item.paid,true)}</strong></div>
          <div><span>Outstanding</span><strong>{formatCurrency(item.open,true)}</strong></div>
          <div><span>Lead → first invoice</span><strong>{item.daysToFirstInvoice===null?"—":item.daysToFirstInvoice+" d"}</strong></div>
        </div>

        {item.invoiced>0&&<div className="payback-progress"><div><span>Collection</span><strong>{formatPercent(percentage(item.paid,item.invoiced))}</strong></div><div className="payback-progress-track"><i style={{width:`${Math.min(100,percentage(item.paid,item.invoiced)??0)}%`}}/></div></div>}

        <div className="payback-cash-strip">
          <span>Paid value by invoice month</span>
          <div>{item.cashMonths.length?item.cashMonths.map(month=><em key={month.month}>{monthName(month.month)} <b>{formatCurrency(month.paid,true)}</b></em>):<small>No invoice payments yet</small>}</div>
        </div>
      </button>)}
      {!filtered.length&&<Card className="p-5"><EmptyState title="No customers match these filters" body="Try a different source, payback state or search term."/></Card>}
    </div>

    {filtered.length>limit&&<div className="flex justify-center"><button type="button" className="button-secondary" onClick={()=>setLimit(value=>value+12)}>Show 12 more</button></div>}
    {selected&&<ClientDrawer data={data} row={selected} onClose={()=>setSelected(null)}/>}
  </div>;
}

type PaybackRecord = {
  row: JourneyRow;
  acquired:string;
  projectDate:string|null;
  firstInvoice:string|null;
  lastInvoice:string|null;
  projectValue:number;
  invoiced:number;
  paid:number;
  open:number;
  daysToFirstInvoice:number|null;
  paybackStatus:"paid"|"partial"|"unpaid"|"project";
  cashMonths:Array<{month:string;invoiced:number;paid:number}>;
};

function buildPaybackRecord(row:JourneyRow):PaybackRecord {
  const invoices=[...row.invoices].sort((a,b)=>a.date.localeCompare(b.date));
  const projects=[...row.projects].sort((a,b)=>(a.projectDate??a.date).localeCompare(b.projectDate??b.date));
  const invoiced=invoices.reduce((sum,item)=>sum+Math.max(0,item.totalInclVat-item.creditedTotal),0);
  const paid=invoices.reduce((sum,item)=>sum+item.paidTotal,0);
  const cashMonths=[...invoices.reduce((map,item)=>{
    if(!item.date)return map;
    const month=item.date.slice(0,7);
    const current=map.get(month)??{month,invoiced:0,paid:0};
    current.invoiced+=Math.max(0,item.totalInclVat-item.creditedTotal);
    current.paid+=item.paidTotal;
    map.set(month,current);
    return map;
  },new Map<string,{month:string;invoiced:number;paid:number}>()).values()].sort((a,b)=>a.month.localeCompare(b.month));
  const firstInvoice=invoices[0]?.date??null;
  const daysToFirstInvoice=firstInvoice?daysBetweenDates(row.lead.date,firstInvoice):null;
  const paybackStatus:PaybackRecord["paybackStatus"]=invoiced>0&&paid>=invoiced-.01?"paid":paid>0?"partial":invoiced>0?"unpaid":"project";
  return {
    row,
    acquired:row.lead.date,
    projectDate:projects[0]?.projectDate??null,
    firstInvoice,
    lastInvoice:invoices.at(-1)?.date??null,
    projectValue:row.projectValue,
    invoiced,
    paid,
    open:Math.max(0,invoiced-paid),
    daysToFirstInvoice,
    paybackStatus,
    cashMonths,
  };
}

function daysBetweenDates(from:string,to:string){
  const start=new Date(from).getTime(),end=new Date(to).getTime();
  if(!Number.isFinite(start)||!Number.isFinite(end))return null;
  return Math.round((end-start)/86400000);
}

function paybackStatusLabel(value:PaybackRecord["paybackStatus"]){
  return value==="paid"?"Fully paid":value==="partial"?"Partly paid":value==="unpaid"?"Invoiced · unpaid":"Project · not invoiced";
}

function PaybackKpi({label,value,note,accent=false}:{label:string;value:string;note:string;accent?:boolean}){
  const Icon=accent?WalletCards:CircleDollarSign;
  return <div className={`payback-kpi ${accent?"is-accent":""}`}><div><Icon size={15}/><span>{label}</span></div><strong>{value}</strong><small>{note}</small></div>;
}

function PaybackMilestone({label,value}:{label:string;value:string}){
  return <div><span>{label}</span><strong>{value}</strong></div>;
}

export function VisitsPage({ data }: { data: CompanyDataset }) {
  const rows=buildJourneyRows(data).filter(r=>r.hasVisit);
  const appointments=data.commercialAppointments??[];
  const [drilldown,setDrilldown]=useState<RecordDrilldown|null>(null);
  const completed=appointments.filter(a=>Boolean(a.completedAt));
  const noShows=appointments.filter(a=>a.noShow);
  return <div className="space-y-6">
    <div className="kpi-grid border-l border-t border-[var(--line)]">
      <KpiCard label="Visit-stage leads" value={formatNumber(rows.length)} onClick={()=>setDrilldown({title:"Visit-stage leads",subtitle:data.periodLabel,leads:rows.map(row=>row.lead),appointments})}/>
      <KpiCard label="Appointment records" value={formatNumber(appointments.length)} onClick={()=>setDrilldown({title:"Appointments",subtitle:data.periodLabel,appointments})}/>
      <KpiCard label="Completed" value={formatNumber(completed.length)} onClick={()=>setDrilldown({title:"Completed visits",subtitle:data.periodLabel,appointments:completed,leads:rows.filter(row=>row.appointments.some(a=>Boolean(a.completedAt))).map(row=>row.lead)})}/>
      <KpiCard label="No-show" value={formatNumber(noShows.length)} onClick={()=>setDrilldown({title:"No-show appointments",subtitle:data.periodLabel,appointments:noShows,leads:rows.filter(row=>row.appointments.some(a=>a.noShow)).map(row=>row.lead)})}/>
    </div>
    <Card className="p-5">
      <SectionHeader title="Visits" description="Exact appointment dates are shown only when the CRM supplied them."/>
      {rows.length?<div className="table-scroll"><table><thead><tr><th>Client</th><th>Source</th><th>Service</th><th>Scheduled</th><th>Completed</th><th>Status</th><th>Next offer</th></tr></thead><tbody>{rows.map(r=>{const a=[...r.appointments].sort((x,y)=>y.scheduledAt.localeCompare(x.scheduledAt))[0];return <tr key={r.lead.id}><td className="font-semibold">{r.lead.name}</td><td>{r.lead.source}</td><td>{r.lead.service}</td><td>{a?dateTime(a.scheduledAt):"Status evidence only"}</td><td>{a?.completedAt?dateTime(a.completedAt):"—"}</td><td>{a?<StatusPill tone={a.noShow?"bad":a.completedAt?"good":"neutral"}>{a.noShow?"No-show":a.status}</StatusPill>:r.lead.crmStatus}</td><td>{r.latestOffer?formatCurrency(r.latestOffer.priceInclVat):"—"}</td></tr>})}</tbody></table></div>:<EmptyState/>}
    </Card>
    {drilldown&&<RecordDrilldownDrawer data={data} selection={drilldown} onClose={()=>setDrilldown(null)}/>}
  </div>;
}

export function OffersPipelinePage({ data }: { data: CompanyDataset }) {
  const cohortAnalytics=buildOverviewAnalytics(data,{source:"all",campaign:"all"});
  const cohortLeadCounts=new Map<string,number>();
  for(const row of cohortAnalytics.rows){
    const month=row.lead.date.slice(0,7);
    if(month) cohortLeadCounts.set(month,(cohortLeadCounts.get(month)??0)+1);
  }
  const cohortRows=[...cohortAnalytics.payback.cohorts].sort((a,b)=>b.month.localeCompare(a.month));
  const offers=(data.commercialOffers??[]).filter(o=>!o.attributionStatus.includes("DATE_CONFLICT"));
  const sent=offers.filter(o=>Boolean(o.sentAt));
  const open=sent.filter(o=>o.isOpen),accepted=offers.filter(o=>o.isAccepted),rejected=offers.filter(o=>o.isRejected),cancelled=offers.filter(o=>o.isCancelled);
  const unsentOpen=offers.filter(o=>o.isOpen&&!o.sentAt);
  const projects=(data.commercialProjects??[]).filter(p=>!p.attributionStatus.includes("DATE_CONFLICT"));
  const invoices=(data.commercialInvoices??[]).filter(i=>!i.attributionStatus.includes("DATE_CONFLICT"));
  const projectValue=projects.reduce((n,p)=>n+Number(p.valueInclVat??0),0);
  const invoiced=invoices.reduce((n,i)=>n+Math.max(0,i.totalInclVat-i.creditedTotal),0);
  const paid=invoices.reduce((n,i)=>n+i.paidTotal,0);
  const [now]=useState(()=>Date.now());
  const followUpsDue=open.filter(o=>o.followUpAt&&new Date(o.followUpAt).getTime()<=now);
  const sum=(items:typeof offers)=>items.reduce((n,o)=>n+o.priceInclVat,0);
  const [drilldown,setDrilldown]=useState<RecordDrilldown|null>(null);
  return <div className="space-y-6">
    <div className="kpi-grid border-l border-t border-[var(--line)]">
      <KpiCard label="Offers created" value={formatNumber(offers.length)} meta={formatCurrency(sum(offers))+" total value"} onClick={()=>setDrilldown({title:"Offers created",subtitle:data.periodLabel,offers})}/>
      <KpiCard label="Sent to client" value={formatNumber(sent.length)} meta={formatCurrency(sum(sent))+" sent value"} onClick={()=>setDrilldown({title:"Offers sent to client",subtitle:data.periodLabel,offers:sent})}/>
      <KpiCard label="Open sent pipeline" value={formatCurrency(sum(open),true)} meta={String(open.length)+" sent + open"} onClick={()=>setDrilldown({title:"Open sent offers",subtitle:data.periodLabel,offers:open})}/>
      <KpiCard label="Send not verified" value={formatCurrency(sum(unsentOpen),true)} meta={String(unsentOpen.length)+" open offers"} onClick={()=>setDrilldown({title:"Open offers with send not verified",subtitle:data.periodLabel,offers:unsentOpen})}/>
      <KpiCard label="Accepted" value={formatCurrency(sum(accepted),true)} meta={String(accepted.length)+" accepted"} onClick={()=>setDrilldown({title:"Accepted offers",subtitle:data.periodLabel,offers:accepted})}/>
      <KpiCard label="Follow-ups due" value={formatNumber(followUpsDue.length)} meta={formatCurrency(sum(followUpsDue))+" open value"} onClick={()=>setDrilldown({title:"Follow-ups due",subtitle:data.periodLabel,offers:followUpsDue})}/>
      <KpiCard label="Afgekeurd" value={formatCurrency(sum(rejected),true)} meta={String(rejected.length)+" rejected"} onClick={()=>setDrilldown({title:"Afgekeurde offers",subtitle:data.periodLabel,offers:rejected})}/>
      <KpiCard label="Cancelled" value={formatCurrency(sum(cancelled),true)} meta={String(cancelled.length)+" cancelled"} onClick={()=>setDrilldown({title:"Cancelled offers",subtitle:data.periodLabel,offers:cancelled})}/>
    </div>
    <Card className="p-5">
      <SectionHeader title="Acquisition-cohort pipeline" description="Marketing value follows the month the lead was acquired. A June lead that becomes a €1,000 client in July adds that €1,000 project value back to the June cohort; the July operational project view still shows the actual July win."/>
      {cohortAnalytics.cohort.supplierOnly>0&&<div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"><strong>{formatNumber(cohortAnalytics.cohort.supplierOnly)} supplier-only leads are not assigned to a month.</strong><p className="mt-1 text-xs">They are included in known acquired-lead totals, but the supplier file does not provide a reliable acquisition date, so monthly cohort value is not guessed.</p></div>}
      <div className="table-scroll"><table><thead><tr><th>Lead month</th><th>CRM-tracked leads</th><th>Acquisition spend evidence</th><th>Customers won to date</th><th>Project value attributed to cohort</th><th>Invoiced to date</th><th>Paid value to date</th></tr></thead><tbody>
        {cohortRows.map(row=><tr key={row.month}><td className="font-semibold">{monthName(row.month)}</td><td>{formatNumber(cohortLeadCounts.get(row.month)??0)}</td><td>{row.acquisitionSpend===null?"Not allocated":<>{formatCurrency(row.acquisitionSpend)}{row.spendState==="synced-only"&&<small className="block text-[var(--muted)]">synced spend only · manual YTD spend not spread monthly</small>}</>}</td><td>{formatNumber(row.customers)}</td><td className="font-semibold">{formatCurrency(row.projectValue)}</td><td>{formatCurrency(row.invoiced)}</td><td>{formatCurrency(row.paid)}</td></tr>)}
      </tbody></table></div>
    </Card>
    <Card className="p-5"><SectionHeader title="Offer register" description="Operational clock: offer date and sent-to-client date stay separate. These dates do not move marketing value out of the lead-acquisition cohort."/><div className="table-scroll"><table><thead><tr><th>Client</th><th>Source</th><th>Offer</th><th>Offer date</th><th>Sent to client</th><th>Follow-up</th><th>Excl. VAT</th><th>Incl. VAT</th><th>Status</th><th>Days open</th></tr></thead><tbody>{[...offers].sort((a,b)=>(b.sentAt??b.date).localeCompare(a.sentAt??a.date)).map(o=><tr key={o.id}><td className="font-semibold">{o.leadName}</td><td>{o.source}</td><td>{o.number}</td><td>{date(o.date)}</td><td>{o.sentAt?<StatusPill tone="good">{dateTime(o.sentAt)}</StatusPill>:<StatusPill tone="neutral">Not verified</StatusPill>}</td><td>{o.followUpAt?dateTime(o.followUpAt):"—"}</td><td>{formatCurrency(o.priceExclVat)}</td><td className="font-semibold">{formatCurrency(o.priceInclVat)}</td><td><StatusPill tone={o.isAccepted?"good":o.isRejected||o.isCancelled?"bad":"warn"}>{o.status}</StatusPill></td><td>{o.daysWaiting===null?"—":String(o.daysWaiting)+" d"}</td></tr>)}</tbody></table></div></Card>
    <Card className="p-5"><SectionHeader title="Pipeline aging" description="Open value that needs sales follow-up."/><div className="grid gap-px bg-[var(--line)] md:grid-cols-4"><Age label="0–7 days" rows={open.filter(o=>(o.daysWaiting??0)<=7)}/><Age label="8–14 days" rows={open.filter(o=>(o.daysWaiting??0)>=8&&(o.daysWaiting??0)<=14)}/><Age label="15–30 days" rows={open.filter(o=>(o.daysWaiting??0)>=15&&(o.daysWaiting??0)<=30)}/><Age label="30+ days" rows={open.filter(o=>(o.daysWaiting??0)>30)}/></div></Card>
    <Card className="p-5"><SectionHeader title="Commercial result" description="Pipeline and cash stay together on the same operational page."/><div className="grid gap-px bg-[var(--line)] sm:grid-cols-2 xl:grid-cols-4"><Mini label="Project value" value={formatCurrency(projectValue)}/><Mini label="Invoiced" value={formatCurrency(invoiced)}/><Mini label="Paid" value={formatCurrency(paid)}/><Mini label="Unpaid invoiced" value={formatCurrency(Math.max(0,invoiced-paid))}/></div></Card>
    {drilldown&&<RecordDrilldownDrawer data={data} selection={drilldown} onClose={()=>setDrilldown(null)}/>}
  </div>;
}

export function SalesProjectsPage({ data }: { data: CompanyDataset }) {
  const projects=(data.periodCommercialProjects??data.commercialProjects??[]).filter(p=>!p.attributionStatus.includes("DATE_CONFLICT"));
  const invoices=(data.periodCommercialInvoices??data.commercialInvoices??[]).filter(i=>!i.attributionStatus.includes("DATE_CONFLICT"));
  const projectValue=projects.reduce((n,p)=>n+Number(p.valueInclVat??0),0);
  const invoiced=invoices.reduce((n,i)=>n+Math.max(0,i.totalInclVat-i.creditedTotal),0);
  const paid=invoices.reduce((n,i)=>n+i.paidTotal,0);
  const [drilldown,setDrilldown]=useState<RecordDrilldown|null>(null);
  return <div className="space-y-6">
    <div className="kpi-grid border-l border-t border-[var(--line)]">
      <KpiCard label="Verified projects" value={formatNumber(projects.length)} onClick={()=>setDrilldown({title:"Projects won in selected period",subtitle:data.periodLabel,projects})}/>
      <KpiCard label="Project value" value={formatCurrency(projectValue,true)} onClick={()=>setDrilldown({title:"Project value records",subtitle:data.periodLabel,projects})}/>
      <KpiCard label="Invoiced" value={formatCurrency(invoiced,true)} onClick={()=>setDrilldown({title:"Invoices in selected period",subtitle:data.periodLabel,invoices})}/>
      <KpiCard label="Paid" value={formatCurrency(paid,true)} onClick={()=>setDrilldown({title:"Invoices with paid cash",subtitle:data.periodLabel,invoices:invoices.filter(item=>item.paidTotal>0)})}/>
    </div>
    <Card className="p-5"><SectionHeader title="Commercially verified projects" description="Operational business clock: project rows use the actual won/calendar date in the selected period. Marketing cohort reporting separately attributes their value back to the lead-acquisition month."/><div className="table-scroll"><table><thead><tr><th>Client</th><th>Won date</th><th>Source</th><th>Project</th><th>Status</th><th>Value excl. VAT</th><th>Value incl. VAT</th></tr></thead><tbody>{projects.map(p=><tr key={p.id}><td className="font-semibold">{p.leadName}</td><td>{date(p.date)}</td><td>{p.source}</td><td>{p.externalId}</td><td>{p.status}</td><td>{formatCurrency(p.valueExclVat)}</td><td className="font-semibold">{formatCurrency(p.valueInclVat)}</td></tr>)}</tbody></table></div></Card>
    {drilldown&&<RecordDrilldownDrawer data={data} selection={drilldown} onClose={()=>setDrilldown(null)}/>}
  </div>;
}

export function CohortsPage({ data }: { data: CompanyDataset }) {
  const analytics=buildOverviewAnalytics(data,{source:"all",campaign:"all"});
  const rows=analytics.rows;
  const months=[...new Set(rows.map(r=>r.lead.date.slice(0,7)).filter(Boolean))].sort().reverse();
  const paybackByMonth=new Map(analytics.payback.cohorts.map(row=>[row.month,row]));
  return <div className="space-y-6"><Funnel data={data}/>
    {analytics.cohort.supplierOnly>0&&<div className="callout"><CircleDollarSign size={18}/><div><strong>{formatNumber(analytics.cohort.supplierOnly)} known supplier leads have no reliable acquisition month.</strong><p>They remain in total acquired-lead reporting but are excluded from monthly cohorts until an acquisition date exists.</p></div></div>}
    <Card className="p-5"><SectionHeader title="Acquisition cohorts" description="The cohort month is the lead-acquisition month. Later wins, project value, invoices and paid value stay attached to that original month."/><div className="table-scroll"><table><thead><tr><th>Cohort</th><th>CRM-tracked people</th><th>Visits</th><th>Offers created</th><th>Sent</th><th>CRM signed</th><th>Customers won to date</th><th>Project value</th><th>Invoiced</th><th>Paid</th><th>Spend evidence</th></tr></thead><tbody>{months.map(m=>{const g=rows.filter(r=>r.lead.date.startsWith(m));const p=paybackByMonth.get(m);return <tr key={m}><td className="font-semibold">{monthName(m)}</td><td>{g.length}</td><td>{g.filter(r=>r.hasVisit).length}</td><td>{g.filter(r=>r.offers.length>0).length}</td><td>{g.filter(r=>r.offers.some(o=>Boolean(o.sentAt))).length}</td><td>{g.filter(r=>r.isSigned).length}</td><td>{p?.customers??0}</td><td className="font-semibold">{formatCurrency(p?.projectValue??0)}</td><td>{formatCurrency(p?.invoiced??0)}</td><td>{formatCurrency(p?.paid??0)}</td><td>{p?.acquisitionSpend===null||p?.acquisitionSpend===undefined?"Not allocated":formatCurrency(p.acquisitionSpend)+(p.spendState==="synced-only"?" · synced only":"")}</td></tr>})}</tbody></table></div></Card>
  </div>;
}

export function SalesTeamPage({ data }: { data: CompanyDataset }) {
  const rows=buildJourneyRows(data),names=[...new Set(rows.map(r=>r.lead.salesperson||"Unassigned"))];
  const team=names.map(name=>{const g=rows.filter(r=>(r.lead.salesperson||"Unassigned")===name);return {name,leads:g.length,visits:g.filter(r=>r.hasVisit).length,offersCreated:g.filter(r=>r.offers.length>0).length,offers:g.filter(r=>r.offers.some(o=>Boolean(o.sentAt))).length,quoted:g.reduce((n,r)=>n+r.sentOfferValue,0),open:g.reduce((n,r)=>n+r.openOfferValue,0),signed:g.filter(r=>r.isSigned).length,verified:g.filter(r=>r.stage==="verified").length,revenue:g.reduce((n,r)=>n+r.projectValue,0)}}).sort((a,b)=>b.revenue-a.revenue||b.leads-a.leads);
  return <Card className="p-5"><SectionHeader title="Sales team performance" description="CRM-tracked people only. Supplier-only leads have no salesperson/stage evidence and are not assigned here."/><div className="table-scroll"><table><thead><tr><th>Salesperson</th><th>CRM-tracked people</th><th>Visits</th><th>Offers created</th><th>Sent</th><th>Sent €</th><th>Open sent €</th><th>CRM signed</th><th>Verified</th><th>Revenue</th><th>Offer → verified</th></tr></thead><tbody>{team.map(r=><tr key={r.name}><td className="font-semibold">{r.name}</td><td>{r.leads}</td><td>{r.visits}</td><td>{r.offersCreated}</td><td>{r.offers}</td><td>{formatCurrency(r.quoted)}</td><td>{formatCurrency(r.open)}</td><td>{r.signed}</td><td>{r.verified}</td><td>{formatCurrency(r.revenue)}</td><td>{formatPercent(percentage(r.verified,r.offers))}</td></tr>)}</tbody></table></div></Card>;
}

function Funnel({ data }: { data: CompanyDataset }) {
  const s=buildFunnelSummary(data);
  const a=buildOverviewAnalytics(data,{source:"all",campaign:"all"});
  const stages=[["Known acquired",a.cohort.knownAcquired],["CRM tracked",s.uniquePeople],["Qualified",s.qualified],["Visits",s.visits],["People with offer",s.offersCreated],["Sent",s.offersSent],["Open",s.openOffers],["Accepted",s.acceptedOffers],["Signed",s.crmSigned],["Commercial clients",s.commercialClients]] as const;
  return <Card className="overflow-hidden"><div className="overflow-x-auto"><div className="flex min-w-[1320px] divide-x divide-[var(--line)]"><div className="min-w-[150px] bg-[var(--ink)] p-4 text-white"><span className="text-xs uppercase text-white/60">Funnel scope</span><strong className="mt-2 block text-xl">{formatNumber(s.uniquePeople)}</strong><small className="mt-1 block text-[10px] text-white/45">Deduplicated people in selected period</small></div>{stages.map(([label,value])=><div key={label} className="min-w-[130px] flex-1 bg-white p-4"><span className="text-xs uppercase text-[var(--muted)]">{label}</span><strong className="mt-2 block text-xl">{value}</strong></div>)}</div></div><div className="border-t border-[var(--line)] bg-amber-50 px-4 py-3 text-xs text-amber-900"><strong>{s.qualifiedNoOffer} qualified people currently have no linked ROBAWS offer.</strong> Qualified means sales-relevant or progressed; it does not mean an offer already exists.</div></Card>;
}

function JourneyCard({ row,onOpen }: { row: JourneyRow; onOpen:()=>void }) { const a=[...row.appointments].sort((x,y)=>y.scheduledAt.localeCompare(x.scheduledAt))[0],o=row.latestOffer; return <button onClick={onOpen} className="w-full rounded-lg border border-[var(--line)] bg-white p-3 text-left transition hover:border-[var(--ink)]"><div className="flex justify-between gap-2"><strong className="text-sm">{row.lead.name}</strong><StatusPill tone={tone(row.stage)}>{journeyStageMeta.find(s=>s.key===row.stage)?.label}</StatusPill></div><p className="mt-1 text-[11px] text-[var(--muted)]">{row.lead.source+" · "+row.lead.service}</p><p className="mt-1 text-[11px] text-[var(--muted)]">{row.lead.municipality||"Location unknown"}</p>{row.crmRecordCount>1&&<p className="mt-1 text-[11px] font-semibold text-amber-700">{row.crmRecordCount+" CRM records merged"}</p>}<div className="mt-3 space-y-1 text-xs"><p>Lead: {date(row.lead.date)}</p>{a&&<p>Visit: {dateTime(a.completedAt??a.scheduledAt)}</p>}{o&&<p>Offer: <b>{formatCurrency(o.priceInclVat)}</b> · {o.sentAt?"sent "+dateTime(o.sentAt):"send not verified"}</p>}{row.projectValue>0&&<p>Project: <b>{formatCurrency(row.projectValue)}</b></p>}</div></button>; }
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
    <header className="sticky top-0 z-10 flex items-start justify-between border-b border-[var(--line)] bg-white p-5"><div><div className="flex items-center gap-2"><p className="eyebrow">Client evidence</p>{overrides.length>0&&<StatusPill tone="accent">Reporting overrides</StatusPill>}</div><h2 className="mt-1 text-xl font-semibold">{row.lead.name}</h2><p className="mt-1 text-sm text-[var(--muted)]">{row.lead.source+" · "+row.lead.service+" · "+row.lead.municipality}</p></div><button onClick={onClose} className="p-2" aria-label="Close client details"><X size={18}/></button></header>
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
