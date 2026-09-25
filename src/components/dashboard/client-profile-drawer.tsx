"use client";

import { useEffect,useMemo,useState,type ReactNode } from "react";
import { Building2,ExternalLink,Mail,MapPin,Phone,ReceiptText,UserRound,X } from "lucide-react";
import type { CommercialClient,CompanyDataset } from "@/lib/data/types";
import { formatCurrency } from "@/lib/metrics/kpis";
import { StatusPill } from "./ui";

type LiveProfile={
  client:{
    id:string;name:string;companyName:string|null;firstName:string|null;lastName:string|null;
    email:string|null;invoiceEmail:string|null;tel:string|null;gsm:string|null;clientSince:string|null;
    city:string|null;address:Record<string,unknown>|null;invoiceAddress:Record<string,unknown>|null;contacts:unknown;
  };
  offers:Array<{id:string;number:string;date:string|null;sentDate:string|null;followUpDate:string|null;projectId:string|null;totalInclVat:number;totalExclVat:number;status:string}>;
  projects:Array<{id:string;date:string|null;planningName:string|null;status:string}>;
  invoices:Array<{id:string;number:string;date:string|null;status:string;type:string|null;originType:string|null;documentId:string|null;totalInclVat:number;totalExclVat:number;paidTotal:number;creditedTotal:number}>;
};

export function ClientProfileDrawer({data,client,onClose}:{data:CompanyDataset;client:CommercialClient;onClose:()=>void}){
  const [profile,setProfile]=useState<LiveProfile|null>(null);
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(true);

  useEffect(()=>{
    let active=true;
    fetch(`/api/robaws/client-profile?companyId=${encodeURIComponent(data.company.id)}&externalId=${encodeURIComponent(client.externalId)}`,{cache:"no-store"})
      .then(async response=>{
        const body=await response.json();
        if(!response.ok)throw new Error(body.error??"Unable to load ROBAWS client profile.");
        return body as LiveProfile;
      })
      .then(body=>{if(active)setProfile(body)})
      .catch(reason=>{if(active)setError(reason instanceof Error?reason.message:"Unable to load client profile.")})
      .finally(()=>{if(active)setLoading(false)});
    return()=>{active=false};
  },[data.company.id,client.externalId]);

  const linkedLead=client.matchedLeadId?data.leads.find(item=>item.id===client.matchedLeadId)??null:null;
  const sourceInfo=manualSourceInfo(data,client);
  const source=sourceInfo.source||linkedLead?.source||"Unknown";
  const invoices=profile?.invoices??[];
  const offers=profile?.offers??[];
  const projects=profile?.projects??[];
  const invoiced=invoices.reduce((sum,item)=>sum+Math.max(0,item.totalInclVat-item.creditedTotal),0);
  const paid=invoices.reduce((sum,item)=>sum+item.paidTotal,0);
  const open=Math.max(0,invoiced-paid);
  const storedProjectRows=(data.allCommercialProjects??[]).filter(project=>project.externalClientId===client.externalId);
  const detailedProjectValue=storedProjectRows.reduce((sum,project)=>sum+Number(project.valueInclVat??0),0);
  const projectValueGap=Math.abs(client.projectValueTotal-detailedProjectValue);
  const contacts=useMemo(()=>extractContacts(profile?.client.contacts),[profile?.client.contacts]);

  return <div className="drawer-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}>
    <aside className="drawer client-profile-drawer" role="dialog" aria-modal="true" aria-label={client.name}>
      <header className="record-drilldown-header">
        <div><p className="eyebrow">Complete client profile</p><h2>{client.name}</h2><p>CRM + ROBAWS + manual attribution. Nothing here edits ROBAWS.</p></div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close client profile"><X size={18}/></button>
      </header>
      <div className="record-drilldown-body">
        <div className="client-profile-top">
          <div className="client-profile-identity">
            <div className="client-profile-avatar"><UserRound size={24}/></div>
            <div>
              <div className="flex flex-wrap items-center gap-2"><h3>{client.name}</h3><StatusPill tone={client.commercialStatus==="CLIENT_WON"?"good":"neutral"}>{client.commercialStatus}</StatusPill></div>
              <p>ROBAWS client #{client.externalId} · {client.matchMethod||"No CRM match"}</p>
            </div>
          </div>
          <div className="client-profile-source"><span>Acquisition source</span><strong>{source}</strong>{sourceInfo.note&&<small>{sourceInfo.note}</small>}</div>
        </div>

        <div className="client-profile-kpis">
          <ProfileKpi label="Offers" value={String(client.offerCount)} />
          <ProfileKpi label="Projects" value={String(client.projectCount)} />
          <ProfileKpi label="Invoices" value={String(client.invoiceCount)} />
          <ProfileKpi label="Project detail value" value={formatCurrency(detailedProjectValue)} />
          <ProfileKpi label="Client aggregate" value={formatCurrency(client.projectValueTotal)} />
          {projectValueGap>0.01&&<ProfileKpi label="Project value gap" value={formatCurrency(projectValueGap)} />}
          <ProfileKpi label="Invoiced" value={formatCurrency(client.invoicedTotal)} />
          <ProfileKpi label="Paid" value={formatCurrency(client.paidTotal)} accent />
        </div>

        <section className="client-profile-section">
          <h3>Client details</h3>
          <div className="client-detail-grid">
            <Detail icon={<MapPin size={14}/>} label="Location" value={profile?.client.city||client.municipality||"—"}/>
            <Detail icon={<Mail size={14}/>} label="Email" value={profile?.client.email||client.email||"—"}/>
            <Detail icon={<Mail size={14}/>} label="Invoice email" value={profile?.client.invoiceEmail||"—"}/>
            <Detail icon={<Phone size={14}/>} label="Phone" value={profile?.client.gsm||profile?.client.tel||client.phone||"—"}/>
            <Detail icon={<Building2 size={14}/>} label="Client since" value={date(profile?.client.clientSince||client.clientSince)}/>
            <Detail icon={<ExternalLink size={14}/>} label="CRM link" value={linkedLead?"Matched":"Not matched"}/>
          </div>
          {contacts.length>0&&<div className="client-contact-list">{contacts.map((item,index)=><span key={index}>{item}</span>)}</div>}
        </section>

        {linkedLead&&<section className="client-profile-section">
          <h3>CRM lead</h3>
          <div className="client-detail-grid">
            <Detail label="Lead created" value={date(linkedLead.date)}/>
            <Detail label="Source" value={linkedLead.source||"—"}/>
            <Detail label="Campaign" value={linkedLead.campaign||"—"}/>
            <Detail label="Service" value={linkedLead.service||"—"}/>
            <Detail label="CRM status" value={linkedLead.crmStatus||linkedLead.stage||"—"}/>
            <Detail label="Salesperson" value={linkedLead.salesperson||"—"}/>
            <Detail label="UTM" value={linkedLead.utm||"—"}/>
            <Detail label="Notes" value={linkedLead.notes||"—"}/>
          </div>
        </section>}

        {loading&&<div className="record-empty">Loading full ROBAWS history…</div>}
        {error&&<div className="record-empty">{error}</div>}

        {profile&&<>
          <section className="client-profile-section">
            <div className="client-section-head"><h3>Offers</h3><span>{offers.length}</span></div>
            {offers.length?<div className="table-scroll"><table className="record-table"><thead><tr><th>Offer</th><th>Date</th><th>Sent</th><th>Status</th><th>Project</th><th>Excl. VAT</th><th>Incl. VAT</th></tr></thead><tbody>{offers.map(item=><tr key={item.id}><td className="font-semibold">{item.number}</td><td>{date(item.date)}</td><td>{date(item.sentDate)}</td><td>{item.status}</td><td>{item.projectId||"—"}</td><td>{formatCurrency(item.totalExclVat)}</td><td className="font-semibold">{formatCurrency(item.totalInclVat)}</td></tr>)}</tbody></table></div>:<p className="client-profile-empty">No ROBAWS offers found.</p>}
          </section>

          <section className="client-profile-section">
            <div className="client-section-head"><h3>Projects</h3><span>{projects.length}</span></div>
            {projects.length?<div className="table-scroll"><table className="record-table"><thead><tr><th>Project</th><th>Date</th><th>Planning name</th><th>Status</th></tr></thead><tbody>{projects.map(item=><tr key={item.id}><td className="font-semibold">{item.id}</td><td>{date(item.date)}</td><td>{item.planningName||"—"}</td><td>{item.status}</td></tr>)}</tbody></table></div>:<p className="client-profile-empty">No ROBAWS projects found.</p>}
          </section>

          <section className="client-profile-section">
            <div className="client-section-head"><div><h3>Invoices</h3><p>{formatCurrency(invoiced)} invoiced · {formatCurrency(paid)} paid · {formatCurrency(open)} open</p></div><span>{invoices.length}</span></div>
            {invoices.length?<div className="table-scroll"><table className="record-table"><thead><tr><th>Invoice</th><th>Date</th><th>Type</th><th>Status</th><th>Incl. VAT</th><th>Credited</th><th>Paid</th><th>Open</th></tr></thead><tbody>{invoices.map(item=>{const net=Math.max(0,item.totalInclVat-item.creditedTotal);const outstanding=Math.max(0,net-item.paidTotal);return <tr key={item.id}><td className="font-semibold">{item.number}</td><td>{date(item.date)}</td><td>{item.type||item.originType||"—"}</td><td>{item.status}</td><td>{formatCurrency(item.totalInclVat)}</td><td>{formatCurrency(item.creditedTotal)}</td><td className="font-semibold">{formatCurrency(item.paidTotal)}</td><td>{formatCurrency(outstanding)}</td></tr>})}</tbody></table></div>:<p className="client-profile-empty">No ROBAWS invoices found.</p>}
          </section>
        </>}
      </div>
    </aside>
  </div>;
}

function manualSourceInfo(data:CompanyDataset,client:CommercialClient){
  const keys=[`robaws:${client.externalId}`,client.id,client.matchedLeadId??""].filter(Boolean);
  const matches=(data.manualOverrides??[]).filter(item=>item.scopeType==="client"&&item.fieldKey==="source"&&keys.includes(item.scopeKey));
  const preferred=matches.find(item=>item.periodKey===data.periodKey)??matches.find(item=>item.periodKey==="all")??matches[0];
  return {source:typeof preferred?.value==="string"?preferred.value.trim():"",note:preferred?.note??""};
}
function extractContacts(value:unknown){
  const out:string[]=[];
  const walk=(item:unknown,depth=0)=>{
    if(!item||depth>4)return;
    if(Array.isArray(item)){item.forEach(value=>walk(value,depth+1));return;}
    if(typeof item!=="object")return;
    const record=item as Record<string,unknown>;
    const parts=["name","firstName","lastName","email","tel","gsm","phone"].map(key=>record[key]).filter(value=>typeof value==="string"&&value.trim()).map(String);
    if(parts.length)out.push(parts.join(" · "));
    Object.values(record).forEach(value=>{if(typeof value==="object")walk(value,depth+1)});
  };
  walk(value);
  return [...new Set(out)].slice(0,20);
}
function ProfileKpi({label,value,accent=false}:{label:string;value:string;accent?:boolean}){return <div className={`client-profile-kpi ${accent?"is-accent":""}`}><span>{label}</span><strong>{value}</strong></div>}
function Detail({icon,label,value}:{icon?:ReactNode;label:string;value:string}){return <div className="client-detail"><span>{icon}{label}</span><strong>{value}</strong></div>}
function date(value:string|null|undefined){if(!value)return"—";const parsed=new Date(value);return Number.isNaN(parsed.getTime())?value:new Intl.DateTimeFormat("en-BE",{day:"2-digit",month:"short",year:"numeric",timeZone:"Europe/Brussels"}).format(parsed)}
