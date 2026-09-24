"use client";

import { ReceiptText, UserRound, X } from "lucide-react";
import type { CommercialAppointment, CommercialClient, CommercialInvoice, CommercialOffer, CommercialProject, CompanyDataset, Lead } from "@/lib/data/types";
import { formatCurrency, formatNumber } from "@/lib/metrics/kpis";
import { StatusPill } from "./ui";

export type RecordDrilldown = {
  title:string;
  subtitle?:string;
  leads?:Lead[];
  clients?:CommercialClient[];
  offers?:CommercialOffer[];
  projects?:CommercialProject[];
  invoices?:CommercialInvoice[];
  appointments?:CommercialAppointment[];
};

export function RecordDrilldownDrawer({data,selection,onClose}:{data:CompanyDataset;selection:RecordDrilldown;onClose:()=>void}){
  const leads=selection.leads??[];
  const clients=selection.clients??[];
  const offers=selection.offers??[];
  const projects=selection.projects??[];
  const invoices=selection.invoices??[];
  const appointments=selection.appointments??[];
  const sourceForClient=(client:CommercialClient)=>{
    const synced=client.matchedLeadId?data.leads.find(lead=>lead.id===client.matchedLeadId)?.source:null;
    if(synced)return synced;
    const keys=[`robaws:${client.externalId}`,client.id,client.matchedLeadId??""].filter(Boolean);
    const match=(data.manualOverrides??[]).find(item=>item.scopeType==="client"&&item.fieldKey==="source"&&keys.includes(item.scopeKey)&&typeof item.value==="string");
    return typeof match?.value==="string"&&match.value.trim()?match.value.trim():"Unattributed";
  };
  const totalRecords=leads.length+clients.length+offers.length+projects.length+invoices.length+appointments.length;

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

        {!totalRecords&&<div className="record-empty">No underlying record is available for this number.</div>}

        {leads.length>0&&<Section title="People / leads" icon={<UserRound size={16}/>}>
          <div className="table-scroll"><table className="record-table"><thead><tr><th>Name</th><th>Date</th><th>Source</th><th>Campaign</th><th>Service</th><th>Location</th><th>Status</th><th>Contact</th></tr></thead><tbody>
            {leads.map(lead=><tr key={lead.id}><td className="font-semibold">{lead.name}</td><td>{date(lead.date)}</td><td>{lead.source||"—"}</td><td>{lead.campaign||"—"}</td><td>{lead.service||"—"}</td><td>{lead.municipality||"—"}</td><td><StatusPill tone={lead.isClient?"good":"neutral"}>{lead.crmStatus||lead.stage||"—"}</StatusPill></td><td><div className="record-contact">{lead.email&&<span>{lead.email}</span>}{lead.phone&&<span>{lead.phone}</span>}{!lead.email&&!lead.phone&&"—"}</div></td></tr>)}
          </tbody></table></div>
        </Section>}

        {clients.length>0&&<Section title="ROBAWS clients" icon={<UserRound size={16}/>}>
          <div className="table-scroll"><table className="record-table"><thead><tr><th>Client</th><th>Since</th><th>Source</th><th>Status</th><th>Offers</th><th>Projects</th><th>Invoices</th><th>Project value</th><th>Invoiced</th><th>Paid</th></tr></thead><tbody>
            {clients.map(client=><tr key={client.id}><td className="font-semibold">{client.name}</td><td>{date(client.clientSince)}</td><td>{sourceForClient(client)}</td><td><StatusPill tone={client.commercialStatus==="CLIENT_WON"?"good":"neutral"}>{client.commercialStatus}</StatusPill></td><td>{client.offerCount}</td><td>{client.projectCount}</td><td>{client.invoiceCount}</td><td>{formatCurrency(client.projectValueTotal)}</td><td>{formatCurrency(client.invoicedTotal)}</td><td className="font-semibold">{formatCurrency(client.paidTotal)}</td></tr>)}
          </tbody></table></div>
        </Section>}

        {appointments.length>0&&<Section title="Appointments / visits">
          <div className="table-scroll"><table className="record-table"><thead><tr><th>Client</th><th>Scheduled</th><th>Completed</th><th>Status</th></tr></thead><tbody>
            {appointments.map((item,index)=><tr key={item.leadId+"-"+index}><td className="font-semibold">{item.leadName}</td><td>{dateTime(item.scheduledAt)}</td><td>{item.completedAt?dateTime(item.completedAt):"—"}</td><td><StatusPill tone={item.noShow?"bad":item.completedAt?"good":"neutral"}>{item.noShow?"No-show":item.status}</StatusPill></td></tr>)}
          </tbody></table></div>
        </Section>}

        {offers.length>0&&<Section title="Offers" icon={<ReceiptText size={16}/>}>
          <div className="table-scroll"><table className="record-table"><thead><tr><th>Client</th><th>Offer</th><th>Created</th><th>Sent</th><th>Status</th><th>Incl. VAT</th><th>Follow-up</th></tr></thead><tbody>
            {offers.map(item=><tr key={item.id}><td className="font-semibold">{item.leadName}</td><td>{item.number}</td><td>{date(item.date)}</td><td>{item.sentAt?dateTime(item.sentAt):"Not verified"}</td><td><StatusPill tone={item.isAccepted?"good":item.isRejected?"bad":item.isOpen?"warn":"neutral"}>{item.status}</StatusPill></td><td className="font-semibold">{formatCurrency(item.priceInclVat)}</td><td>{item.followUpAt?dateTime(item.followUpAt):"—"}</td></tr>)}
          </tbody></table></div>
        </Section>}

        {projects.length>0&&<Section title="Projects" icon={<ReceiptText size={16}/>}>
          <div className="table-scroll"><table className="record-table"><thead><tr><th>Client</th><th>Won date</th><th>Project</th><th>Source</th><th>Status</th><th>Excl. VAT</th><th>Incl. VAT</th></tr></thead><tbody>
            {projects.map(item=><tr key={item.id}><td className="font-semibold">{item.leadName}</td><td>{date(item.date)}</td><td>{item.externalId}</td><td>{item.source}</td><td><StatusPill tone="good">{item.status}</StatusPill></td><td>{formatCurrency(item.valueExclVat??0)}</td><td className="font-semibold">{formatCurrency(item.valueInclVat??0)}</td></tr>)}
          </tbody></table></div>
        </Section>}

        {invoices.length>0&&<Section title="Invoices" icon={<ReceiptText size={16}/>}>
          <div className="table-scroll"><table className="record-table"><thead><tr><th>Client</th><th>Date</th><th>Invoice</th><th>Status</th><th>Incl. VAT</th><th>Credited</th><th>Paid</th><th>Open</th></tr></thead><tbody>
            {invoices.map(item=>{const net=Math.max(0,item.totalInclVat-item.creditedTotal);const open=Math.max(0,net-item.paidTotal);return <tr key={item.id}><td className="font-semibold">{item.leadName}</td><td>{date(item.date)}</td><td>{item.number}</td><td><StatusPill tone={open>0?"warn":"good"}>{item.status}</StatusPill></td><td>{formatCurrency(item.totalInclVat)}</td><td>{formatCurrency(item.creditedTotal)}</td><td className="font-semibold">{formatCurrency(item.paidTotal)}</td><td>{formatCurrency(open)}</td></tr>})}
          </tbody></table></div>
        </Section>}
      </div>
    </aside>
  </div>;
}

function Summary({label,value}:{label:string;value:number}){return <div><span>{label}</span><strong>{formatNumber(value)}</strong></div>}
function Section({title,icon,children}:{title:string;icon?:React.ReactNode;children:React.ReactNode}){return <section className="record-section"><h3>{icon}{title}</h3>{children}</section>}
function date(value:string|null|undefined){if(!value)return"—";const parsed=new Date(value);return Number.isNaN(parsed.getTime())?value:new Intl.DateTimeFormat("en-BE",{day:"2-digit",month:"short",year:"numeric",timeZone:"Europe/Brussels"}).format(parsed)}
function dateTime(value:string|null|undefined){if(!value)return"—";const parsed=new Date(value);return Number.isNaN(parsed.getTime())?value:new Intl.DateTimeFormat("en-BE",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",timeZone:"Europe/Brussels"}).format(parsed)}
