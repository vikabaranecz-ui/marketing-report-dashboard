"use client";

import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { CompanyDataset } from "@/lib/data/types";
import { formatCurrency, formatNumber, formatPercent, percentage } from "@/lib/metrics/kpis";
import { buildFunnelSummary, buildJourneyRows, type JourneyRow } from "@/lib/metrics/client-funnel";
import { Card, KpiCard, SectionHeader, StatusPill } from "./ui";

export function OverviewPage({ data }: { data: CompanyDataset }) {
  const rows = buildJourneyRows(data);
  const summary = buildFunnelSummary(data);
  const decisions = sourceDecisionRows(data, rows);
  const signed = rows.filter(row => row.isSigned);
  const offers = (data.commercialOffers ?? []).filter(offer => !hasDateConflict(offer.attributionStatus));
  const openOffers = offers.filter(offer => offer.isOpen).sort((a,b) => b.priceInclVat - a.priceInclVat);
  const openValue = openOffers.reduce((sum,offer) => sum + offer.priceInclVat,0);
  const invoices = (data.commercialInvoices ?? []).filter(invoice => !hasDateConflict(invoice.attributionStatus));
  const paid = invoices.reduce((sum,invoice) => sum + invoice.paidTotal,0);
  const matchedPeople = rows.filter(row => row.lead.robawsClientId !== "—").length;
  const commercialClients = data.commercialClients ?? [];
  const unmatchedRobaws = commercialClients.filter(client => !client.matchedLeadId);
  const unmatchedWon = unmatchedRobaws.filter(client => client.commercialStatus === "CLIENT_WON");
  const metaDecision = decisions.find(row => row.source.toLowerCase().includes("facebook"));
  const metaRoas = metaDecision?.roas ?? null;

  return <div className="space-y-6">
    <div className="kpi-grid border-l border-t border-[var(--line)]">
      <KpiCard label="Tracked ad spend" value={formatCurrency(data.metrics.spend,true)} meta="Only connected media spend" />
      <KpiCard label="Unique leads" value={formatNumber(summary.uniquePeople)} meta={formatNumber(summary.leads)+" CRM rows"} />
      <KpiCard label="CRM signed" value={formatNumber(summary.crmSigned)} meta={formatPercent(percentage(summary.crmSigned,summary.uniquePeople))+" of unique leads"} />
      <KpiCard label="ROBAWS clients" value={formatNumber(summary.commercialClients)} meta="Commercially confirmed" />
      <KpiCard label="Attributed clients" value={formatNumber(summary.attributableClients)} meta="Safe to use for source ROI" />
      <KpiCard label="Open offer value" value={formatCurrency(openValue,true)} meta={formatNumber(openOffers.length)+" open ROBAWS offers"} />
      <KpiCard label="Paid cash" value={formatCurrency(paid,true)} meta="Date-conflict revenue excluded" />
      <KpiCard label="Meta paid ROAS" value={metaRoas===null?"—":metaRoas.toFixed(2)+"×"} meta={metaDecision?.spend===null?"Spend missing":"Paid cash / tracked spend"} />
    </div>

    <Card className="p-5">
      <SectionHeader title="Budget decision" description="This is the page to use when deciding what to increase, hold or fix." />
      <div className="grid gap-4 lg:grid-cols-3">
        <DecisionBox
          tone="good"
          title="Meta / Facebook Ads"
          body={metaDecision?.spend
            ? metaDecision.attributableClients === 1
              ? `Tracked spend is ${formatCurrency(metaDecision.spend)} and attributed paid cash is ${formatCurrency(metaDecision.paid)} (${metaDecision.roas?.toFixed(2) ?? "—"}×). Positive evidence, but it rests on one attributable client. Increase only in small steps, not aggressively.`
              : `Tracked spend is ${formatCurrency(metaDecision.spend)}. Use the source table below before changing budget.`
            : "Meta spend is not available for this selection."}
        />
        <DecisionBox
          tone="warn"
          title="Google Ads"
          body="Google Ads leads exist in CRM, but Google Ads spend is not currently present in the reporting facts. Do not compare CAC or ROAS against Meta until that spend is imported."
        />
        <DecisionBox
          tone="warn"
          title="LeadAngel"
          body="LeadAngel produced signed and ROBAWS clients, but its acquisition cost is missing. Revenue evidence exists; ROI does not. Add the actual LeadAngel cost before increasing or reducing this source."
        />
      </div>
    </Card>

    <Card className="p-5">
      <SectionHeader title="Source decision table" description="One row per first-touch source. Signed = Monday. Client = ROBAWS. Attributed client excludes date conflicts. Paid cash is used for ROI." />
      <div className="table-scroll"><table>
        <thead><tr><th>Source</th><th>Spend</th><th>Unique leads</th><th>Signed</th><th>ROBAWS clients</th><th>Attributed clients</th><th>Open offer €</th><th>Paid €</th><th>CPL</th><th>CAC</th><th>Paid ROAS</th><th>Action</th></tr></thead>
        <tbody>{decisions.map(row => <tr key={row.source}>
          <td className="font-semibold">{row.source}</td>
          <td>{row.spend===null?"Missing":formatCurrency(row.spend)}</td>
          <td>{row.leads}</td>
          <td>{row.signed}</td>
          <td>{row.commercialClients}</td>
          <td>{row.attributableClients}</td>
          <td>{formatCurrency(row.openValue)}</td>
          <td className="font-semibold">{formatCurrency(row.paid)}</td>
          <td>{row.spend===null?"—":formatCurrency(row.cpl)}</td>
          <td>{row.cac===null?"—":formatCurrency(row.cac)}</td>
          <td>{row.roas===null?"—":row.roas.toFixed(2)+"×"}</td>
          <td><ActionPill action={row.action}/></td>
        </tr>)}</tbody>
      </table></div>
    </Card>

    <div className="grid gap-6 xl:grid-cols-[1.2fr_.8fr]">
      <Card className="p-5">
        <SectionHeader title="Signed client reconciliation" description="Why Monday signed and ROBAWS client counts differ." />
        <div className="table-scroll"><table>
          <thead><tr><th>Client</th><th>Source</th><th>Monday</th><th>ROBAWS</th><th>Attribution</th><th>Project value</th></tr></thead>
          <tbody>{signed.map(row => <tr key={row.lead.id}>
            <td className="font-semibold">{row.lead.name}</td>
            <td>{row.lead.source}</td>
            <td><StatusPill tone="good">signed</StatusPill></td>
            <td><StatusPill tone={row.isCommercialClient?"good":row.lead.commercialStatus==="OFFER_SENT"?"warn":"neutral"}>{row.isCommercialClient?"CLIENT_WON":row.lead.commercialStatus||"No ROBAWS match"}</StatusPill></td>
            <td>{row.isAttributableClient?<StatusPill tone="good">Attributable</StatusPill>:hasDateConflict(row.lead.attributionLevel)?<StatusPill tone="bad">Date conflict</StatusPill>:<StatusPill tone="neutral">Not confirmed</StatusPill>}</td>
            <td>{row.projectValue?formatCurrency(row.projectValue):"—"}</td>
          </tr>)}</tbody>
        </table></div>
      </Card>

      <Card className="p-5">
        <SectionHeader title="ROBAWS reconciliation" description="ROBAWS customers are stored independently so unmatched commercial clients cannot disappear." />
        {commercialClients.length ? <div className="space-y-4">
          <Fact label="ROBAWS clients imported" value={commercialClients.length} />
          <Fact label="Matched to CRM" value={commercialClients.filter(client=>client.matchedLeadId).length} />
          <Fact label="Unmatched to CRM" value={unmatchedRobaws.length} warn={unmatchedRobaws.length>0} />
          <Fact label="Unmatched CLIENT_WON" value={unmatchedWon.length} warn={unmatchedWon.length>0} />
          {unmatchedWon.length>0 && <div className="border-t border-[var(--line)] pt-4"><p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Needs attribution</p>{unmatchedWon.slice(0,8).map(client=><p key={client.id} className="mt-2 text-sm"><strong>{client.name}</strong> · paid {formatCurrency(client.paidTotal)}</p>)}</div>}
        </div> : <div className="border border-dashed border-[var(--line)] bg-[var(--surface)] p-4 text-sm leading-6 text-[var(--muted)]">The previous ROBAWS sync stored only clients that matched a CRM lead. The new reconciliation table is ready; run ROBAWS sync once and this card will show the complete ROBAWS client list, including unmatched customers.</div>}
      </Card>
    </div>

    <Card className="p-5">
      <SectionHeader title="Open commercial opportunities" description="Highest-value ROBAWS offers still waiting for a final outcome." />
      {openOffers.length ? <div className="table-scroll"><table><thead><tr><th>Client</th><th>Source</th><th>Offer</th><th>Status</th><th>Value incl. VAT</th><th>Sent</th><th>Follow-up</th></tr></thead><tbody>
        {openOffers.slice(0,15).map(offer => <tr key={offer.id}><td className="font-semibold">{offer.leadName}</td><td>{offer.source}</td><td>{offer.number}</td><td>{offer.status}</td><td className="font-semibold">{formatCurrency(offer.priceInclVat)}</td><td>{offer.sentAt?formatDate(offer.sentAt):"Not verified"}</td><td>{offer.followUpAt?formatDate(offer.followUpAt):"—"}</td></tr>)}
      </tbody></table></div> : <p className="text-sm text-[var(--muted)]">No open ROBAWS offers are linked to this cohort.</p>}
    </Card>

    <Card className="p-5">
      <SectionHeader title="Data that blocks a budget decision" description="Missing data is shown as a blocker instead of being treated as zero." />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Gap label="Google Ads spend" blocked={!data.channels.some(channel=>channel.channel==="Google Ads"&&channel.spend>0)} />
        <Gap label="LeadAngel acquisition cost" blocked={decisions.some(row=>row.source==="LeadAngel"&&row.spend===null)} />
        <Gap label="ROBAWS full client snapshot" blocked={commercialClients.length===0} />
        <Gap label="CRM ↔ ROBAWS matches" blocked={matchedPeople < Math.min(summary.uniquePeople,50)} detail={matchedPeople+" people currently matched"} />
      </div>
    </Card>
  </div>;
}

type DecisionRow = {
  source:string;
  spend:number|null;
  leads:number;
  signed:number;
  commercialClients:number;
  attributableClients:number;
  openValue:number;
  paid:number;
  cpl:number|null;
  cac:number|null;
  roas:number|null;
  action:"Scale cautiously"|"Hold"|"Do not increase"|"Fix spend tracking"|"Fix matching"|"Monitor";
};

function sourceDecisionRows(data:CompanyDataset, rows:JourneyRow[]):DecisionRow[] {
  const invoices=(data.commercialInvoices??[]).filter(invoice=>!hasDateConflict(invoice.attributionStatus));
  const sources=[...new Set(rows.map(row=>row.lead.source||"Unattributed"))];

  return sources.map(source=>{
    const group=rows.filter(row=>(row.lead.source||"Unattributed")===source);
    const sourceInvoices=invoices.filter(invoice=>invoice.source===source);
    const paid=sourceInvoices.reduce((sum,invoice)=>sum+invoice.paidTotal,0);
    const openValue=group.reduce((sum,row)=>sum+row.offers.filter(offer=>offer.isOpen).reduce((s,offer)=>s+offer.priceInclVat,0),0);
    const spend=spendForSource(data,source,group);
    const attributableClients=group.filter(row=>row.isAttributableClient).length;
    const commercialClients=group.filter(row=>row.isCommercialClient).length;
    const signed=group.filter(row=>row.isSigned).length;
    const cpl=spend===null||group.length===0?null:spend/group.length;
    const cac=spend===null||attributableClients===0?null:spend/attributableClients;
    const roas=spend===null||spend===0?null:paid/spend;
    const lower=source.toLowerCase();
    const paidSource=lower.includes("facebook")||lower.includes("meta")||lower.includes("google ads")||lower.includes("leadangel");
    let action:DecisionRow["action"]="Monitor";
    if (paidSource&&spend===null) action="Fix spend tracking";
    else if (spend!==null&&attributableClients===0&&openValue>0) action="Hold";
    else if (spend!==null&&attributableClients===0) action="Do not increase";
    else if (spend!==null&&roas!==null&&roas>=3&&attributableClients===1) action="Scale cautiously";
    else if (spend!==null&&roas!==null&&roas>=3&&attributableClients>1) action="Scale cautiously";
    else if (signed>0&&commercialClients===0) action="Fix matching";
    return {source,spend,leads:group.length,signed,commercialClients,attributableClients,openValue,paid,cpl,cac,roas,action};
  }).sort((a,b)=>(b.paid-a.paid)||(b.openValue-a.openValue)||(b.leads-a.leads));
}

function spendForSource(data:CompanyDataset,source:string,rows:JourneyRow[]) {
  const lower=source.toLowerCase();
  const channelName=lower.includes("facebook")||lower.includes("meta")||lower.includes("instagram")
    ?"Meta Ads"
    : lower.includes("google ads")
      ?"Google Ads"
      : null;
  if(channelName){
    const channel=data.channels.find(item=>item.channel===channelName);
    return channel&&channel.spend>0?channel.spend:null;
  }
  const costs=rows.map(row=>row.lead.acquisitionCost);
  if(costs.length&&costs.every(value=>value!==null)) return costs.reduce<number>((sum,value)=>sum+Number(value),0);
  return null;
}

function DecisionBox({title,body,tone}:{title:string;body:string;tone:"good"|"warn"}) {
  return <div className={`border p-4 ${tone==="good"?"border-emerald-200 bg-emerald-50":"border-amber-200 bg-amber-50"}`}><div className="flex items-center gap-2">{tone==="good"?<CheckCircle2 size={16}/>:<AlertTriangle size={16}/>}<strong className="text-sm">{title}</strong></div><p className="mt-2 text-sm leading-6">{body}</p></div>;
}
function ActionPill({action}:{action:DecisionRow["action"]}) {
  const tone=action==="Scale cautiously"?"good":action==="Fix spend tracking"||action==="Fix matching"?"bad":action==="Hold"?"warn":"neutral";
  return <StatusPill tone={tone}>{action}</StatusPill>;
}
function Fact({label,value,warn=false}:{label:string;value:number;warn?:boolean}){return <div className="flex items-center justify-between border-b border-[var(--line)] pb-3 text-sm"><span className="text-[var(--muted)]">{label}</span><strong className={warn?"text-amber-700":""}>{formatNumber(value)}</strong></div>}
function Gap({label,blocked,detail}:{label:string;blocked:boolean;detail?:string}){return <div className="border border-[var(--line)] p-4"><div className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${blocked?"bg-amber-500":"bg-emerald-500"}`}/><strong className="text-sm">{label}</strong></div><p className="mt-2 text-xs text-[var(--muted)]">{detail??(blocked?"Blocks confident budget comparison":"Available")}</p></div>}
function hasDateConflict(value:string|null|undefined){return String(value??"").toUpperCase().includes("DATE_CONFLICT")}
function formatDate(value:string){const date=new Date(value);return new Intl.DateTimeFormat("nl-BE",{day:"2-digit",month:"short",year:"numeric",timeZone:"Europe/Brussels"}).format(date)}
