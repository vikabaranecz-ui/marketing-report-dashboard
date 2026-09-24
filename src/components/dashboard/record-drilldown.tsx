"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ReceiptText, Search, UserRound, X } from "lucide-react";
import type { CommercialAppointment, CommercialClient, CommercialInvoice, CommercialOffer, CommercialProject, CompanyDataset, Lead } from "@/lib/data/types";
import { formatCurrency, formatNumber } from "@/lib/metrics/kpis";
import { StatusPill } from "./ui";
import { ClientProfileDrawer } from "./client-profile-drawer";

export type RecordDrilldown = {
  title:string;
  subtitle?:string;
  leads?:Lead[];
  clients?:CommercialClient[];
  offers?:CommercialOffer[];
  projects?:CommercialProject[];
  invoices?:CommercialInvoice[];
  appointments?:CommercialAppointment[];
  initialKind?: "all"|"leads"|"clients"|"offers"|"projects"|"invoices"|"appointments";
};

export function RecordDrilldownDrawer({data,selection,onClose}:{data:CompanyDataset;selection:RecordDrilldown;onClose:()=>void}){
  const leads=selection.leads??[];
  const clients=selection.clients??[];
  const offers=selection.offers??[];
  const projects=selection.projects??[];
  const invoices=selection.invoices??[];
  const appointments=selection.appointments??[];
  const [search,setSearch]=useState("");
  const [kind,setKind]=useState(selection.initialKind??"all");
  const [selectedClient,setSelectedClient]=useState<CommercialClient|null>(null);
  const [offerOutcome,setOfferOutcome]=useState("all");
  const [limit,setLimit]=useState(20);
  const query=search.trim().toLowerCase();
  const contains=(...values:Array<string|number|null|undefined>)=>!query||values.join(" ").toLowerCase().includes(query);
  const filteredLeads=useMemo(()=>leads.filter(item=>contains(item.name,item.email,item.phone,item.source,item.campaign,item.service,item.municipality,item.crmStatus,item.stage)),[leads,query]);
  const filteredClients=useMemo(()=>clients.filter(item=>contains(item.name,item.email,item.phone,item.municipality,item.commercialStatus,item.externalId)),[clients,query]);
  const filteredOffers=useMemo(()=>offers.filter(item=>{
    const outcome=offerOutcome==="all"
      || (offerOutcome==="open"&&item.isOpen)
      || (offerOutcome==="accepted"&&item.isAccepted)
      || (offerOutcome==="rejected"&&item.isRejected)
      || (offerOutcome==="cancelled"&&item.isCancelled);
    return outcome&&contains(item.leadName,item.number,item.status,item.source,item.projectExternalId);
  }),[offers,query,offerOutcome]);
  const filteredProjects=useMemo(()=>projects.filter(item=>contains(item.leadName,item.externalId,item.source,item.status,item.externalClientId)),[projects,query]);
  const filteredInvoices=useMemo(()=>invoices.filter(item=>contains(item.leadName,item.number,item.status,item.source,item.externalClientId)),[invoices,query]);
  const filteredAppointments=useMemo(()=>appointments.filter(item=>contains(item.leadName,item.status,item.scheduledAt,item.completedAt)),[appointments,query]);
  const clientForLead=(leadId:string)=>data.commercialClients?.find(client=>client.matchedLeadId===leadId)??null;
  const sourceForClient=(client:CommercialClient)=>{
    const synced=client.matchedLeadId?data.leads.find(lead=>lead.id===client.matchedLeadId)?.source:null;
    if(synced)return synced;
    const keys=[`robaws:${client.externalId}`,client.id,client.matchedLeadId??""].filter(Boolean);
    const match=(data.manualOverrides??[]).find(item=>item.scopeType==="client"&&item.fieldKey==="source"&&keys.includes(item.scopeKey)&&typeof item.value==="string");
    return typeof match?.value==="string"&&match.value.trim()?match.value.trim():"Unattributed";
  };
  const totalRecords=leads.length+clients.length+offers.length+projects.length+invoices.length+appointments.length;
  const types=[
    ["leads","Leads",leads.length],
    ["clients","Clients",clients.length],
    ["offers","Offers",offers.length],
    ["projects","Projects",projects.length],
    ["invoices","Invoices",invoices.length],
    ["appointments","Visits",appointments.length],
  ].filter(([, ,count])=>Number(count)>0) as Array<[string,string,number]>;
  const show=(value:string)=>kind==="all"||kind===value;
  const visibleCount=(show("leads")?filteredLeads.length:0)+(show("clients")?filteredClients.length:0)+(show("offers")?filteredOffers.length:0)+(show("projects")?filteredProjects.length:0)+(show("invoices")?filteredInvoices.length:0)+(show("appointments")?filteredAppointments.length:0);

  return <div className="drawer-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}>
    <aside className="drawer record-drilldown-drawer" role="dialog" aria-modal="true" aria-label={selection.title}>
      <header className="record-drilldown-header">
        <div><p className="eyebrow">Underlying records</p><h2>{selection.title}</h2>{selection.subtitle&&<p>{selection.subtitle}</p>}</div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close details"><X size={18}/></button>
      </header>
      <div className="record-drilldown-body">
        <div className="record-summary-grid">
          {leads.length>0&&<Summary label="Leads" value={leads.length}/>}
          {clients.length>0&&<Summary label="Clients" value={clients.length}/>}
          {offers.length>0&&<Summary label="Offers" value={offers.length}/>}
          {projects.length>0&&<Summary label="Projects" value={projects.length}/>}
          {invoices.length>0&&<Summary label="Invoices" value={invoices.length}/>}
          {appointments.length>0&&<Summary label="Appointments" value={appointments.length}/>}
        </div>

        {totalRecords>0&&<div className="record-filter-bar">
          <label className="record-search"><Search size={15}/><input value={search} onChange={e=>{setSearch(e.target.value);setLimit(20)}} placeholder="Search name, source, offer, invoice, location…"/></label>
          {types.length>1&&<select value={kind} onChange={e=>{setKind(e.target.value as NonNullable<RecordDrilldown["initialKind"]>);setLimit(20)}}><option value="all">All record types</option>{types.map(([value,label,count])=><option key={value} value={value}>{label} ({count})</option>)}</select>}
          {offers.length>0&&<select value={offerOutcome} onChange={e=>{setOfferOutcome(e.target.value);setLimit(20)}}><option value="all">All offer outcomes</option><option value="open">Open</option><option value="accepted">Accepted</option><option value="rejected">Afgekeurd</option><option value="cancelled">Cancelled</option></select>}
          {(search||kind!=="all"||offerOutcome!=="all")&&<button type="button" className="button-secondary" onClick={()=>{setSearch("");setKind("all");setOfferOutcome("all");setLimit(20)}}>Clear</button>}
          <span className="record-result-count">{visibleCount} matching</span>
        </div>}

        {!totalRecords&&<div className="record-empty">No underlying record is available for this number.</div>}

        {show("leads")&&filteredLeads.length>0&&<Section title="People / leads" icon={<UserRound size={16}/>}>
          <div className="table-scroll"><table className="record-table"><thead><tr><th>Name</th><th>Date</th><th>Source</th><th>Campaign</th><th>Service</th><th>Location</th><th>Status</th><th>Contact</th></tr></thead><tbody>
            {filteredLeads.slice(0,limit).map(lead=>{const linkedClient=clientForLead(lead.id);return <tr key={lead.id}><td className="font-semibold">{linkedClient?<button type="button" className="client-link" onClick={()=>setSelectedClient(linkedClient)}>{lead.name}</button>:lead.name}</td><td>{date(lead.date)}</td><td>{lead.source||"—"}</td><td>{lead.campaign||"—"}</td><td>{lead.service||"—"}</td><td>{lead.municipality||"—"}</td><td><StatusPill tone={lead.isClient?"good":"neutral"}>{lead.crmStatus||lead.stage||"—"}</StatusPill></td><td><div className="record-contact">{lead.email&&<span>{lead.email}</span>}{lead.phone&&<span>{lead.phone}</span>}{!lead.email&&!lead.phone&&"—"}</div></td></tr>})}
          </tbody></table></div>
        </Section>}

        {show("clients")&&filteredClients.length>0&&<Section title="ROBAWS clients" icon={<UserRound size={16}/>}>
          <div className="table-scroll"><table className="record-table"><thead><tr><th>Client</th><th>Since</th><th>Location</th><th>Source</th><th>Status</th><th>Offers</th><th>Projects</th><th>Invoices</th><th>Project value</th><th>Invoiced</th><th>Paid</th></tr></thead><tbody>
            {filteredClients.slice(0,limit).map(client=><tr key={client.id}><td className="font-semibold"><button type="button" className="client-link" onClick={()=>setSelectedClient(client)}>{client.name}</button></td><td>{date(client.clientSince)}</td><td>{client.municipality||"—"}</td><td>{sourceForClient(client)}</td><td><StatusPill tone={client.commercialStatus==="CLIENT_WON"?"good":"neutral"}>{client.commercialStatus}</StatusPill></td><td>{client.offerCount}</td><td>{client.projectCount}</td><td>{client.invoiceCount}</td><td>{formatCurrency(client.projectValueTotal)}</td><td>{formatCurrency(client.invoicedTotal)}</td><td className="font-semibold">{formatCurrency(client.paidTotal)}</td></tr>)}
          </tbody></table></div>
        </Section>}

        {show("appointments")&&filteredAppointments.length>0&&<Section title="Appointments / visits">
          <div className="table-scroll"><table className="record-table"><thead><tr><th>Client</th><th>Scheduled</th><th>Completed</th><th>Status</th></tr></thead><tbody>
            {filteredAppointments.slice(0,limit).map((item,index)=><tr key={item.leadId+"-"+index}><td className="font-semibold">{item.leadName}</td><td>{dateTime(item.scheduledAt)}</td><td>{item.completedAt?dateTime(item.completedAt):"—"}</td><td><StatusPill tone={item.noShow?"bad":item.completedAt?"good":"neutral"}>{item.noShow?"No-show":item.status}</StatusPill></td></tr>)}
          </tbody></table></div>
        </Section>}

        {show("offers")&&filteredOffers.length>0&&<Section title="Offers" icon={<ReceiptText size={16}/>}>
          <div className="table-scroll"><table className="record-table"><thead><tr><th>Client</th><th>Offer</th><th>Created</th><th>Sent</th><th>Status</th><th>Incl. VAT</th><th>Follow-up</th></tr></thead><tbody>
            {filteredOffers.slice(0,limit).map(item=><tr key={item.id}><td className="font-semibold">{item.leadName}</td><td>{item.number}</td><td>{date(item.date)}</td><td>{item.sentAt?dateTime(item.sentAt):"Not verified"}</td><td><StatusPill tone={item.isAccepted?"good":item.isRejected||item.isCancelled?"bad":item.isOpen?"warn":"neutral"}>{item.status}</StatusPill></td><td className="font-semibold">{formatCurrency(item.priceInclVat)}</td><td>{item.followUpAt?dateTime(item.followUpAt):"—"}</td></tr>)}
          </tbody></table></div>
        </Section>}

        {show("projects")&&filteredProjects.length>0&&<Section title="Projects" icon={<ReceiptText size={16}/>}>
          <div className="table-scroll"><table className="record-table"><thead><tr><th>Client</th><th>Won date</th><th>Project</th><th>Source</th><th>Status</th><th>Excl. VAT</th><th>Incl. VAT</th></tr></thead><tbody>
            {filteredProjects.slice(0,limit).map(item=><tr key={item.id}><td className="font-semibold">{item.leadName}</td><td>{date(item.date)}</td><td>{item.externalId}</td><td>{item.source}</td><td><StatusPill tone="good">{item.status}</StatusPill></td><td>{formatCurrency(item.valueExclVat??0)}</td><td className="font-semibold">{formatCurrency(item.valueInclVat??0)}</td></tr>)}
          </tbody></table></div>
        </Section>}

        {show("invoices")&&filteredInvoices.length>0&&<Section title="Invoices" icon={<ReceiptText size={16}/>}>
          <div className="table-scroll"><table className="record-table"><thead><tr><th>Client</th><th>Date</th><th>Invoice</th><th>Status</th><th>Incl. VAT</th><th>Credited</th><th>Paid</th><th>Open</th></tr></thead><tbody>
            {filteredInvoices.slice(0,limit).map(item=>{const net=Math.max(0,item.totalInclVat-item.creditedTotal);const open=Math.max(0,net-item.paidTotal);return <tr key={item.id}><td className="font-semibold">{item.leadName}</td><td>{date(item.date)}</td><td>{item.number}</td><td><StatusPill tone={open>0?"warn":"good"}>{item.status}</StatusPill></td><td>{formatCurrency(item.totalInclVat)}</td><td>{formatCurrency(item.creditedTotal)}</td><td className="font-semibold">{formatCurrency(item.paidTotal)}</td><td>{formatCurrency(open)}</td></tr>})}
          </tbody></table></div>
        </Section>}

        {visibleCount>limit&&<div className="record-more"><span>Showing up to {limit} records per section.</span><button type="button" className="button-secondary" onClick={()=>setLimit(value=>value+20)}>Show more</button></div>}
        {totalRecords>0&&visibleCount===0&&<div className="record-empty">No records match these filters.</div>}
      </div>
    </aside>
    {selectedClient&&<ClientProfileDrawer data={data} client={selectedClient} onClose={()=>setSelectedClient(null)}/>}
  </div>;
}

function Summary({label,value}:{label:string;value:number}){return <div><span>{label}</span><strong>{formatNumber(value)}</strong></div>}
function Section({title,icon,children}:{title:string;icon?:ReactNode;children:ReactNode}){return <section className="record-section"><h3>{icon}{title}</h3>{children}</section>}
function date(value:string|null|undefined){if(!value)return"—";const parsed=new Date(value);return Number.isNaN(parsed.getTime())?value:new Intl.DateTimeFormat("en-BE",{day:"2-digit",month:"short",year:"numeric",timeZone:"Europe/Brussels"}).format(parsed)}
function dateTime(value:string|null|undefined){if(!value)return"—";const parsed=new Date(value);return Number.isNaN(parsed.getTime())?value:new Intl.DateTimeFormat("en-BE",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",timeZone:"Europe/Brussels"}).format(parsed)}
