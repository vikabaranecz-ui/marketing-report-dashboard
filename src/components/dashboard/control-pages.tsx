"use client";

import { AlertTriangle, CheckCircle2, CircleDollarSign, Database, FilterX } from "lucide-react";
import type { CompanyDataset } from "@/lib/data/types";
import { buildFunnelSummary, buildJourneyRows, campaignPipelineRows, stageConversion, type JourneyRow } from "@/lib/metrics/client-funnel";
import { formatCurrency, formatNumber, formatPercent, percentage, safeDivide } from "@/lib/metrics/kpis";
import { Card, EmptyState, KpiCard, SectionHeader, StatusPill } from "./ui";
import { IntegrationCenter } from "./integration-center";

const paidSources = new Set(["Meta Ads / Facebook","Google Ads","LeadAngel"]);

export function FunnelPage({ data }: { data: CompanyDataset }) {
  const rows = buildJourneyRows(data);
  const summary = buildFunnelSummary(data);
  const appointments = rows.filter(hasAppointmentEvidence).length;
  const completedVisits = rows.filter(hasCompletedVisitEvidence).length;
  const sentOffers = rows.filter(row => row.offers.some(offer => Boolean(offer.sentAt))).length;
  const commercialClients = rows.filter(row => row.isCommercialClient).length;
  const stages = [
    { label:"Unique leads", value:summary.uniquePeople, note:"Deduplicated CRM people" },
    { label:"Qualified", value:summary.qualified, note:"Relevant / progressed" },
    { label:"Appointments", value:appointments, note:"Booked appointment evidence" },
    { label:"Visits", value:completedVisits, note:"Completed / post-visit evidence" },
    { label:"Offers sent", value:sentOffers, note:"ROBAWS sent date present" },
    { label:"CRM signed", value:summary.crmSigned, note:"Monday status = signed" },
    { label:"ROBAWS clients", value:commercialClients, note:"Commercially confirmed" },
  ];
  const notRelevant = rows.filter(row => row.isNotRelevant).length;
  const neverContacted = rows.filter(row => normalized(row.lead.crmStatus)==="nog geen contact").length;
  const cancelled = rows.filter(row => normalized(row.lead.crmStatus).includes("afspraak geannuleerd")).length;
  const noShow = rows.filter(row => row.appointments.some(item => item.noShow)).length;
  const rejected = rows.filter(row => row.latestOffer?.isRejected).length;

  return <div className="space-y-6">
    <Card className="overflow-hidden">
      <div className="border-b border-[var(--line)] p-5"><SectionHeader title="Lead → client funnel" description="Each transition is shown separately so leakage cannot hide inside one generic conversion rate."/></div>
      <div className="control-funnel">
        {stages.map((stage,index) => {
          const previous = index===0 ? null : stages[index-1].value;
          const conversion = previous===null ? null : stageConversion(stage.value,previous);
          return <div className="control-funnel-stage" key={stage.label}>
            <span>{stage.label}</span>
            <strong>{formatNumber(stage.value)}</strong>
            <small>{stage.note}</small>
            {conversion!==null && <em>{formatPercent(conversion)} from previous stage</em>}
          </div>;
        })}
      </div>
    </Card>

    <div className="grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
      <Card className="p-5">
        <SectionHeader title="Transition conversion" description="The exact stage where people are being lost."/>
        <div className="space-y-1">
          {stages.slice(1).map((stage,index) => {
            const previous = stages[index];
            const conversion = stageConversion(stage.value,previous.value);
            const lost = Math.max(0,previous.value-stage.value);
            return <div className="transition-row" key={stage.label}>
              <div><strong>{previous.label} → {stage.label}</strong><span>{lost} did not progress</span></div>
              <b>{formatPercent(conversion)}</b>
            </div>;
          })}
        </div>
      </Card>

      <Card className="p-5">
        <SectionHeader title="Known leakage reasons" description="Only structured CRM / appointment / offer evidence is counted."/>
        <div className="grid grid-cols-2 gap-px bg-[var(--line)]">
          <Leak label="Not relevant" value={notRelevant}/>
          <Leak label="Never contacted" value={neverContacted}/>
          <Leak label="Appointment cancelled" value={cancelled}/>
          <Leak label="No-show" value={noShow}/>
          <Leak label="Offer rejected" value={rejected}/>
          <Leak label="Signed, not ROBAWS client" value={rows.filter(row=>row.isSigned&&!row.isCommercialClient).length}/>
        </div>
      </Card>
    </div>

    <Card className="p-5">
      <SectionHeader title="Marketing vs sales boundary" description="This keeps lead generation performance separate from follow-up and closing performance."/>
      <div className="boundary-grid">
        <div><p>MARKETING</p><strong>Spend → traffic → lead → qualified lead</strong><span>Source, campaign, creative, CPL and lead quality.</span></div>
        <div><p>SALES / OPERATIONS</p><strong>Contact → appointment → visit → offer → client</strong><span>Response, follow-up, visit execution, quote speed and closing.</span></div>
      </div>
    </Card>
  </div>;
}

export function SourcesCampaignsPage({ data }: { data: CompanyDataset }) {
  const rows = buildJourneyRows(data);
  const sources = sourceBusinessRows(data,rows);
  const campaignRows = campaignBusinessRows(data,rows);

  return <div className="space-y-6">
    <Card className="p-5">
      <SectionHeader title="Source → business result" description="Paid sources are compared only when their actual spend exists. Organic sources keep cost metrics blank."/>
      <div className="table-scroll"><table className="wide-decision-table">
        <thead><tr><th>Source</th><th>Spend</th><th>Unique leads</th><th>Qualified</th><th>Visits</th><th>Offers sent</th><th>Sent €</th><th>Open €</th><th>Signed</th><th>ROBAWS clients</th><th>Attributed clients</th><th>Project €</th><th>Paid €</th><th>CPL</th><th>Cost / qual.</th><th>Cost / visit</th><th>Cost / offer</th><th>CAC</th><th>Pipeline ROAS</th><th>Paid ROAS</th></tr></thead>
        <tbody>{sources.map(row => <tr key={row.source}>
          <td className="font-semibold">{row.source}</td>
          <td>{row.costState==="missing"?<StatusPill tone="warn">Spend missing</StatusPill>:row.spend===null?"—":formatCurrency(row.spend)}</td>
          <td>{row.leads}</td><td>{row.qualified}</td><td>{row.visits}</td><td>{row.offers}</td>
          <td>{formatCurrency(row.sentValue)}</td><td>{formatCurrency(row.openValue)}</td><td>{row.signed}</td><td>{row.commercialClients}</td><td>{row.attributedClients}</td>
          <td>{formatCurrency(row.projectValue)}</td><td className="font-semibold">{formatCurrency(row.paid)}</td>
          <td>{costMetric(row.spend,row.leads)}</td><td>{costMetric(row.spend,row.qualified)}</td><td>{costMetric(row.spend,row.visits)}</td><td>{costMetric(row.spend,row.offers)}</td><td>{costMetric(row.spend,row.attributedClients)}</td>
          <td>{ratioMetric(row.openValue,row.spend)}</td><td className="font-semibold">{ratioMetric(row.paid,row.spend)}</td>
        </tr>)}</tbody>
      </table></div>
    </Card>

    <Card className="p-5">
      <SectionHeader title="Campaign → commercial outcome" description="Campaigns are judged beyond CPL: lead quality, visits, offers, attributable clients and project value are kept together."/>
      {campaignRows.length ? <div className="table-scroll"><table>
        <thead><tr><th>Campaign</th><th>Channel</th><th>Spend</th><th>Leads</th><th>Qualified</th><th>Visits</th><th>Offers sent</th><th>Sent €</th><th>Open €</th><th>Attributed clients</th><th>Project €</th><th>CAC</th><th>Project ROAS</th></tr></thead>
        <tbody>{campaignRows.map(row=><tr key={row.campaign}><td className="font-semibold">{row.campaign}</td><td>{row.channel}</td><td>{row.spend>0?formatCurrency(row.spend):"—"}</td><td>{row.leads}</td><td>{row.qualified}</td><td>{row.visits}</td><td>{row.offers}</td><td>{formatCurrency(row.sentValue)}</td><td>{formatCurrency(row.openValue)}</td><td>{row.clients}</td><td>{formatCurrency(row.projectValue)}</td><td>{row.spend>0?costMetric(row.spend,row.clients):"—"}</td><td>{row.spend>0?ratioMetric(row.projectValue,row.spend):"—"}</td></tr>)}</tbody>
      </table></div> : <EmptyState title="No campaign attribution" body="Campaign-level rows appear when CRM leads retain a campaign relationship."/ >}
    </Card>

    <div className="callout"><AlertTriangle size={18}/><div><strong>Ad set / ad / creative economics are not shown unless the lead-to-ad join exists.</strong><p>The schema can store ad-level data, but this page will not infer creative winners from CTR or campaign totals when person-level commercial attribution is missing.</p></div></div>
  </div>;
}

export function RevenuePage({ data }: { data: CompanyDataset }) {
  const offers=(data.commercialOffers??[]).filter(item=>!hasDateConflict(item.attributionStatus));
  const projects=(data.commercialProjects??[]).filter(item=>!hasDateConflict(item.attributionStatus));
  const invoices=(data.commercialInvoices??[]).filter(item=>!hasDateConflict(item.attributionStatus));
  const sent=offers.filter(item=>Boolean(item.sentAt));
  const open=sent.filter(item=>item.isOpen);
  const accepted=offers.filter(item=>item.isAccepted);
  const offeredValue=sum(sent.map(item=>item.priceInclVat));
  const openValue=sum(open.map(item=>item.priceInclVat));
  const acceptedValue=sum(accepted.map(item=>item.priceInclVat));
  const projectValue=sum(projects.map(item=>Number(item.valueInclVat??0)));
  const invoiced=sum(invoices.map(item=>Math.max(0,item.totalInclVat-item.creditedTotal)));
  const paid=sum(invoices.map(item=>item.paidTotal));

  return <div className="space-y-6">
    <div className="revenue-stage-grid">
      <RevenueStage label="Total offered" value={offeredValue} note={sent.length+" sent offers"}/>
      <RevenueStage label="Open pipeline" value={openValue} note={open.length+" still open"}/>
      <RevenueStage label="Accepted / contracted" value={acceptedValue} note={accepted.length+" accepted offers"}/>
      <RevenueStage label="Project value" value={projectValue} note={projects.length+" project records"}/>
      <RevenueStage label="Invoiced" value={invoiced} note="Net of credits"/>
      <RevenueStage label="Paid" value={paid} note="Cash received"/>
    </div>

    <Card className="p-5">
      <SectionHeader title="Commercial client ledger" description="Signed status, ROBAWS confirmation, project value, invoiced and paid stay separate."/>
      <RevenueClientTable data={data}/>
    </Card>
  </div>;
}

export function DataHealthPage({ data }: { data: CompanyDataset }) {
  const rows=buildJourneyRows(data);
  const clients=data.commercialClients??[];
  const googleSpendPresent=data.channels.some(channel=>channel.channel==="Google Ads"&&channel.spend>0);
  const signedUnconfirmed=rows.filter(row=>row.isSigned&&!row.isCommercialClient).length;
  const unmatchedClients=clients.filter(client=>!client.matchedLeadId).length;
  const checks=[
    {label:"CRM source completeness",ok:data.dataHealth.missingSource===0,detail:data.dataHealth.missingSource+" leads missing source"},
    {label:"Duplicate control",ok:data.dataHealth.duplicates===0,detail:data.dataHealth.duplicates+" potential duplicate CRM rows"},
    {label:"Campaign attribution",ok:data.dataHealth.missingCampaign===0,detail:data.dataHealth.missingCampaign+" leads missing campaign"},
    {label:"ROBAWS client reconciliation",ok:clients.length>0&&unmatchedClients===0,detail:clients.length===0?"Full ROBAWS client snapshot not populated":unmatchedClients+" ROBAWS clients unmatched"},
    {label:"Signed → commercial match",ok:signedUnconfirmed===0,detail:signedUnconfirmed+" signed leads not confirmed as ROBAWS clients"},
    {label:"Google Ads spend",ok:googleSpendPresent,detail:googleSpendPresent?"Spend available":"Spend not synced"},
  ];
  const passed=checks.filter(item=>item.ok).length;

  return <div className="space-y-6">
    <div className="grid gap-6 xl:grid-cols-[.72fr_1.28fr]">
      <Card className="p-5">
        <SectionHeader title="Trust coverage" description="A transparent check count, not an invented health score."/>
        <div className="trust-score"><strong>{passed}/{checks.length}</strong><span>critical reporting checks passing</span></div>
        <div className="mt-5 space-y-2">{checks.map(item=><div className="health-check" key={item.label}>{item.ok?<CheckCircle2 size={16}/>:<AlertTriangle size={16}/>}<div><strong>{item.label}</strong><span>{item.detail}</span></div></div>)}</div>
      </Card>
      <Card className="p-5">
        <SectionHeader title="Data quality issues" description="These are reporting limitations, not business-performance conclusions."/>
        <div className="grid gap-px bg-[var(--line)] sm:grid-cols-2 xl:grid-cols-3">
          <HealthMetric icon={<FilterX size={15}/>} label="Missing source" value={data.dataHealth.missingSource}/>
          <HealthMetric icon={<Database size={15}/>} label="Missing service" value={data.dataHealth.missingService}/>
          <HealthMetric icon={<Database size={15}/>} label="Missing campaign" value={data.dataHealth.missingCampaign}/>
          <HealthMetric icon={<FilterX size={15}/>} label="Potential duplicates" value={data.dataHealth.duplicates}/>
          <HealthMetric icon={<CircleDollarSign size={15}/>} label="Campaigns without spend" value={data.dataHealth.campaignsWithoutSpend}/>
          <HealthMetric icon={<AlertTriangle size={15}/>} label="Signed, not ROBAWS client" value={signedUnconfirmed}/>
        </div>
      </Card>
    </div>

    <IntegrationCenter companyId={data.company.id} integrations={data.integrations}/>

    <Card className="p-5">
      <SectionHeader title="Integration freshness" description="Last successful sync is shown per source so stale data is visible."/>
      <div className="table-scroll"><table><thead><tr><th>Source</th><th>Status</th><th>Resource</th><th>Last successful sync</th><th>Last attempt</th><th>Records</th></tr></thead><tbody>
        {data.integrations.map(item=><tr key={item.id}><td className="font-semibold">{item.name}</td><td><StatusPill tone={item.status==="Connected"?"good":item.status==="Error"?"bad":"warn"}>{item.status}</StatusPill></td><td>{item.resource}</td><td>{formatTimestamp(item.lastSuccess)}</td><td>{formatTimestamp(item.lastAttempt)}</td><td>{formatNumber(item.records)}</td></tr>)}
      </tbody></table></div>
    </Card>
  </div>;
}

type SourceBusinessRow = {
  source:string; spend:number|null; costState:"known"|"missing"|"not-applicable";
  leads:number; qualified:number; visits:number; offers:number; sentValue:number; openValue:number;
  signed:number; commercialClients:number; attributedClients:number; projectValue:number; paid:number;
};

function sourceBusinessRows(data:CompanyDataset,rows:JourneyRow[]):SourceBusinessRow[] {
  const groups=new Map<string,JourneyRow[]>();
  for(const row of rows){
    const key=decisionSource(row.lead.source);
    groups.set(key,[...(groups.get(key)??[]),row]);
  }
  const invoices=(data.commercialInvoices??[]).filter(item=>!hasDateConflict(item.attributionStatus));
  return [...groups.entries()].map(([source,group])=>{
    const rawSources=new Set(group.map(item=>item.lead.source));
    const sourceInvoices=invoices.filter(item=>rawSources.has(item.source));
    const spend=spendForSource(data,source,group);
    const nonPaid=!paidSources.has(source);
    return {
      source,
      spend,
      costState: nonPaid?"not-applicable":spend===null?"missing":"known",
      leads:group.length,
      qualified:group.filter(item=>item.isQualified).length,
      visits:group.filter(hasCompletedVisitEvidence).length,
      offers:group.filter(item=>item.offers.some(offer=>Boolean(offer.sentAt))).length,
      sentValue:group.reduce((total,item)=>total+item.sentOfferValue,0),
      openValue:group.reduce((total,item)=>total+item.openOfferValue,0),
      signed:group.filter(item=>item.isSigned).length,
      commercialClients:group.filter(item=>item.isCommercialClient).length,
      attributedClients:group.filter(item=>item.isAttributableClient).length,
      projectValue:group.reduce((total,item)=>total+item.projectValue,0),
      paid:sourceInvoices.reduce((total,item)=>total+item.paidTotal,0),
    };
  }).sort((a,b)=>b.paid-a.paid||b.projectValue-a.projectValue||b.openValue-a.openValue||b.leads-a.leads);
}

function campaignBusinessRows(data:CompanyDataset,rows:JourneyRow[]) {
  const pipeline=campaignPipelineRows(data);
  const campaignMeta=new Map(data.campaigns.map(item=>[item.name,item]));
  return pipeline.filter(item=>item.key!=="—"&&item.key!=="Unattributed").map(item=>{
    const meta=campaignMeta.get(item.key);
    const group=rows.filter(row=>row.lead.campaign===item.key);
    return {
      campaign:item.key,
      channel:meta?.channel??"Unknown",
      spend:meta?.spend??0,
      leads:item.leads,
      qualified:item.qualified,
      visits:group.filter(hasCompletedVisitEvidence).length,
      offers:item.offersSent,
      sentValue:item.sentQuotedValue,
      openValue:item.openPipeline,
      clients:item.verified,
      projectValue:item.revenue,
    };
  }).sort((a,b)=>b.projectValue-a.projectValue||b.openValue-a.openValue||b.spend-a.spend);
}

function RevenueClientTable({data}:{data:CompanyDataset}) {
  const rows=buildJourneyRows(data).filter(row=>row.isSigned||row.isCommercialClient||row.offers.length>0||row.projects.length>0);
  const invoices=(data.commercialInvoices??[]).filter(item=>!hasDateConflict(item.attributionStatus));
  if(!rows.length) return <EmptyState title="No commercial records" body="Commercial rows appear after CRM / ROBAWS data is synced."/>;
  return <div className="table-scroll"><table><thead><tr><th>Client</th><th>Source</th><th>CRM signed</th><th>ROBAWS client</th><th>Sent offer €</th><th>Project €</th><th>Invoiced €</th><th>Paid €</th><th>Attribution</th></tr></thead><tbody>
    {rows.sort((a,b)=>b.projectValue-a.projectValue).map(row=>{
      const ids=new Set([row.lead.id]);
      const clientInvoices=invoices.filter(item=>item.leadId&&ids.has(item.leadId));
      const invoiced=sum(clientInvoices.map(item=>Math.max(0,item.totalInclVat-item.creditedTotal)));
      const paid=sum(clientInvoices.map(item=>item.paidTotal));
      return <tr key={row.lead.id}><td className="font-semibold">{row.lead.name}</td><td>{row.lead.source}</td><td>{row.isSigned?<StatusPill tone="good">Signed</StatusPill>:"—"}</td><td>{row.isCommercialClient?<StatusPill tone="good">CLIENT_WON</StatusPill>:row.lead.commercialStatus==="OFFER_SENT"?<StatusPill tone="warn">Offer only</StatusPill>:"—"}</td><td>{formatCurrency(row.sentOfferValue)}</td><td>{formatCurrency(row.projectValue)}</td><td>{formatCurrency(invoiced)}</td><td className="font-semibold">{formatCurrency(paid)}</td><td>{row.isAttributableClient?<StatusPill tone="good">Attributable</StatusPill>:hasDateConflict(row.lead.attributionLevel)?<StatusPill tone="bad">Date conflict</StatusPill>:<StatusPill tone="neutral">Review</StatusPill>}</td></tr>;
    })}
  </tbody></table></div>;
}

function hasAppointmentEvidence(row:JourneyRow){
  const status=normalized(row.lead.crmStatus);
  const stage=normalized(row.lead.stage);
  return row.appointments.length>0||stage.includes("visit booked")||status==="afspraak ingeboekt";
}
function hasCompletedVisitEvidence(row:JourneyRow){
  const status=normalized(row.lead.crmStatus);
  const stage=normalized(row.lead.stage);
  return row.appointments.some(item=>Boolean(item.completedAt))||stage.includes("visit completed")||stage.includes("quote")||stage.includes("won")||["visited offerte to be done","offer sent","email offerte","signed","offerte afgekeurd"].includes(status);
}
function decisionSource(source:string){
  const lower=source.toLowerCase();
  if(lower.includes("facebook")||lower.includes("meta")||lower.includes("instagram")) return "Meta Ads / Facebook";
  if(lower.includes("google ads")) return "Google Ads";
  if(lower.includes("leadangel")) return "LeadAngel";
  if(lower.includes("web calculator")) return "Web calculator";
  if(lower==="web"||lower.includes("website")) return "Web";
  return source||"Unattributed";
}
function spendForSource(data:CompanyDataset,source:string,rows:JourneyRow[]) {
  const channelName=source==="Meta Ads / Facebook"?"Meta Ads":source==="Google Ads"?"Google Ads":null;
  if(channelName){
    const channel=data.channels.find(item=>item.channel===channelName);
    return channel&&channel.spend>0?channel.spend:null;
  }
  if(source==="LeadAngel"){
    const costs=rows.map(row=>row.lead.acquisitionCost);
    return costs.length&&costs.every(value=>value!==null)?costs.reduce<number>((total,value)=>total+Number(value),0):null;
  }
  return null;
}
function costMetric(spend:number|null,count:number){return spend===null||count===0?"—":formatCurrency(spend/count)}
function ratioMetric(value:number,spend:number|null){return spend===null||spend===0?"—":formatNumber(value/spend)+"×"}
function normalized(value:string){return value.trim().toLowerCase().replace(/\s+/g," ")}
function hasDateConflict(value:string|null|undefined){return String(value??"").toUpperCase().includes("DATE_CONFLICT")}
function sum(values:number[]){return values.reduce((total,value)=>total+Number(value||0),0)}
function formatTimestamp(value:string|null){if(!value)return "—";return new Intl.DateTimeFormat("nl-BE",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",timeZone:"Europe/Brussels"}).format(new Date(value))}
function Leak({label,value}:{label:string;value:number}){return <div className="bg-white p-4"><span className="text-xs text-[var(--muted)]">{label}</span><strong className="mt-2 block text-xl">{formatNumber(value)}</strong></div>}
function RevenueStage({label,value,note}:{label:string;value:number;note:string}){return <div className="revenue-stage"><span>{label}</span><strong>{formatCurrency(value,true)}</strong><small>{note}</small></div>}
function HealthMetric({icon,label,value}:{icon:React.ReactNode;label:string;value:number}){return <div className="bg-white p-4"><div className="flex items-center gap-2 text-[var(--muted)]">{icon}<span className="text-xs font-semibold uppercase tracking-wide">{label}</span></div><strong className={`mt-3 block text-2xl ${value>0?"text-amber-700":"text-emerald-700"}`}>{formatNumber(value)}</strong></div>}
