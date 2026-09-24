"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, CircleDollarSign, Database, FilterX, Pencil, RotateCcw, X } from "lucide-react";
import type { CompanyDataset } from "@/lib/data/types";
import { buildFunnelSummary, buildJourneyRows, campaignPipelineRows, hasLeadOfferEvidence, hasOfferSentEvidence, stageConversion, type JourneyRow } from "@/lib/metrics/client-funnel";
import { formatCurrency, formatNumber, formatPercent, percentage, safeDivide } from "@/lib/metrics/kpis";
import { Card, EmptyState, KpiCard, SectionHeader, StatusPill } from "./ui";
import { IntegrationCenter } from "./integration-center";

const paidSources = new Set(["Meta Ads / Facebook","Google Ads","LeadAngel","AgenciYou","Solary"]);

export function FunnelPage({ data }: { data: CompanyDataset }) {
  const rows = buildJourneyRows(data);
  const summary = buildFunnelSummary(data);
  const appointments = rows.filter(hasAppointmentEvidence).length;
  const completedVisits = rows.filter(hasCompletedVisitEvidence).length;
  const sentOffers = rows.filter(row => row.offers.some(hasOfferSentEvidence) || hasLeadOfferEvidence(row.lead)).length;
  const commercialClients = rows.filter(row => row.isCommercialClient).length;
  const stages = [
    { label:"Unique leads", value:summary.uniquePeople, note:"Deduplicated CRM people" },
    { label:"Qualified", value:summary.qualified, note:"Relevant / progressed" },
    { label:"Appointments", value:appointments, note:"Booked appointment evidence" },
    { label:"Visits", value:completedVisits, note:"Completed / post-visit evidence" },
    { label:"Offers sent", value:sentOffers, note:"ROBAWS status / sent date or CRM offer-stage evidence" },
    { label:"Accepted", value:summary.acceptedOffers, note:"Accepted commercial offer" },
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
  const allWonClients=(data.commercialClients??[]).filter(client=>client.commercialStatus==="CLIENT_WON"&&commercialClientInPeriod(data,client));
  const safelyAttributedLeadIds=new Set(rows.filter(row=>row.isAttributableClient).flatMap(row=>row.leadIds));
  const attributedWonClients=allWonClients.filter(client=>
    Boolean(manualRobawsSource(data,client)) ||
    Boolean(client.matchedLeadId&&safelyAttributedLeadIds.has(client.matchedLeadId))
  );
  const safeAttributed=attributedWonClients.length;
  const attributionCoverage=percentage(safeAttributed,allWonClients.length)??0;
  const [editingSource,setEditingSource]=useState<SourceBusinessRow|null>(null);

  return <div className="space-y-6">
    <div className="callout"><AlertTriangle size={18}/><div><strong>Source economics currently cover {safeAttributed} of {allWonClients.length} ROBAWS commercial clients ({formatPercent(attributionCoverage)}).</strong><p>CRM-linked clients use verified lead attribution. Unmatched ROBAWS clients are included only when a manual source has been explicitly assigned; they never receive a guessed source.</p></div></div>
    <Card className="p-5">
      <SectionHeader title="Source → business result" description="Paid sources are compared only when their actual spend exists. Organic sources keep cost metrics blank."/>
      <div className="table-scroll"><table className="wide-decision-table">
        <thead><tr><th>Source</th><th>Spend</th><th>Unique leads</th><th>Qualified</th><th>Visits</th><th>Offers sent</th><th>Sent €</th><th>Open €</th><th>Signed</th><th>ROBAWS clients</th><th>Attributed clients</th><th>Project €</th><th>Paid €</th><th>CPL</th><th>Cost / qual.</th><th>Cost / visit</th><th>Cost / offer</th><th>CAC</th><th>Pipeline ROAS</th><th>Paid ROAS</th></tr></thead>
        <tbody>{sources.map(row => <tr key={row.source}>
          <td className="font-semibold">{row.source}</td>
          <td><button type="button" onClick={()=>setEditingSource(row)} className="inline-flex items-center gap-2 font-semibold underline decoration-transparent underline-offset-4 hover:decoration-current">{row.costState==="missing"?<StatusPill tone="warn">Add spend</StatusPill>:row.spend===null?"—":formatCurrency(row.spend)}{row.isManualSpend&&<StatusPill tone="accent">Manual</StatusPill>}{row.recurringSpend>0&&<StatusPill tone="accent">+ recurring</StatusPill>}<Pencil size={12}/></button></td>
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
      </table></div> : <EmptyState title="No campaign attribution" body="Campaign-level rows appear when CRM leads retain a campaign relationship."/>}
    </Card>

    <div className="grid gap-3 lg:grid-cols-2">
      <div className="callout"><AlertTriangle size={18}/><div><strong>Spend scope matters.</strong><p>Channel spend is the tracked spend for the selected period. If a channel also ran awareness or non-lead campaigns, that spend remains included rather than being silently removed from CAC.</p></div></div>
      <div className="callout"><AlertTriangle size={18}/><div><strong>Ad set / ad / creative economics need the lead-to-ad join.</strong><p>The schema can store ad-level data, but this page will not infer creative winners from CTR or campaign totals when person-level commercial attribution is missing.</p></div></div>
    </div>
    {editingSource&&<SpendEditor data={data} row={editingSource} onClose={()=>setEditingSource(null)}/>}
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
  const signedUnconfirmedRows=rows.filter(row=>row.isSigned&&!row.isCommercialClient);
  const signedUnconfirmed=signedUnconfirmedRows.length;
  const unmatchedClients=clients.filter(client=>!client.matchedLeadId).length;
  const wonClients=clients.filter(client=>client.commercialStatus==="CLIENT_WON");
  const unmatchedWon=wonClients.filter(client=>!client.matchedLeadId).sort((a,b)=>b.paidTotal-a.paidTotal||b.invoicedTotal-a.invoicedTotal);
  const sourceOverrides=(data.manualOverrides??[]).filter(item=>item.scopeType==="client"&&item.fieldKey==="source"&&typeof item.value==="string");
  const manualSourceForClient=(client:NonNullable<CompanyDataset["commercialClients"]>[number])=>{
    const keys=[`robaws:${client.externalId}`,client.id,client.matchedLeadId??""].filter(Boolean);
    const matches=sourceOverrides.filter(item=>keys.includes(item.scopeKey));
    const preferred=matches.find(item=>item.periodKey===data.periodKey)??matches.find(item=>item.periodKey==="all")??matches[0];
    return typeof preferred?.value==="string"&&preferred.value.trim()?preferred.value.trim():null;
  };
  const safelyAttributed=rows.filter(row=>row.isAttributableClient);
  const safeLeadIds=new Set(safelyAttributed.flatMap(row=>row.leadIds));
  const safelyAttributedClientIds=new Set(wonClients.filter(client=>client.matchedLeadId&&safeLeadIds.has(client.matchedLeadId)).map(client=>client.id));
  const manuallyAttributedClientIds=new Set(wonClients.filter(client=>Boolean(manualSourceForClient(client))).map(client=>client.id));
  const attributedClientIds=new Set([...safelyAttributedClientIds,...manuallyAttributedClientIds]);
  const manualAttributedWon=wonClients.filter(client=>manuallyAttributedClientIds.has(client.id));
  const attributionCoverage=percentage(attributedClientIds.size,wonClients.length)??0;
  const businessPaid=wonClients.reduce((sum,client)=>sum+client.paidTotal,0);
  const attributedPaid=wonClients.filter(client=>attributedClientIds.has(client.id)).reduce((sum,client)=>sum+client.paidTotal,0);
  const paidCoverage=percentage(attributedPaid,businessPaid)??0;
  const checks=[
    {label:"CRM source completeness",ok:data.dataHealth.missingSource===0,detail:data.dataHealth.missingSource+" leads missing source"},
    {label:"Duplicate control",ok:data.dataHealth.duplicates===0,detail:data.dataHealth.duplicates+" potential duplicate CRM rows"},
    {label:"Campaign attribution",ok:data.dataHealth.missingCampaign===0,detail:data.dataHealth.missingCampaign+" leads missing campaign"},
    {label:"ROBAWS client reconciliation",ok:wonClients.length>0&&unmatchedWon.length===0,detail:wonClients.length===0?"Full ROBAWS client snapshot not populated":unmatchedWon.length+" commercial clients unmatched"},
    {label:"Marketing attribution coverage",ok:attributionCoverage>=90,detail:attributedClientIds.size+" / "+wonClients.length+" commercial clients have a safe source ("+manualAttributedWon.length+" manually assigned, "+formatPercent(attributionCoverage)+")"},
    {label:"Paid cash attribution",ok:paidCoverage>=90,detail:formatCurrency(attributedPaid)+" / "+formatCurrency(businessPaid)+" source-attributed ("+formatPercent(paidCoverage)+")"},
    {label:"Signed → commercial match",ok:signedUnconfirmed===0,detail:signedUnconfirmed+" signed leads not confirmed as ROBAWS clients"},
    {label:"Google Ads spend",ok:googleSpendPresent,detail:googleSpendPresent?"Spend available":"Spend not synced"},
  ];
  const passed=checks.filter(item=>item.ok).length;

  return <div className="space-y-6">
    <div className="grid gap-6 xl:grid-cols-[.72fr_1.28fr]">
      <Card className="p-5">
        <SectionHeader title="Trust coverage" description="The dashboard must prove where each number comes from before you use it for budget decisions."/>
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

    <Card className="p-5">
      <SectionHeader title="Reconciliation queue" description="This is the work required before marketing CAC / ROAS can be treated as complete business truth."/>
      <div className="grid gap-4 xl:grid-cols-[1.25fr_.75fr]">
        <div>
          <div className="mb-3 flex items-center justify-between gap-3"><div><strong className="text-sm">Unmatched ROBAWS commercial clients</strong><p className="mt-1 text-xs text-[var(--muted)]">{unmatchedWon.length} of {wonClients.length} commercial clients are not linked to a CRM person. Assign a source manually when you know where the client came from; this changes reporting only and does not edit ROBAWS.</p></div><StatusPill tone={attributionCoverage>=90?"good":"warn"}>{formatPercent(attributionCoverage)} source covered</StatusPill></div>
          {unmatchedWon.length?<div className="table-scroll"><table><thead><tr><th>ROBAWS client</th><th>Offers</th><th>Projects</th><th>Invoiced</th><th>Paid</th><th>Match</th><th>Manual source</th></tr></thead><tbody>
            {unmatchedWon.slice(0,40).map(client=><tr key={client.id}><td className="font-semibold">{client.name}</td><td>{client.offerCount}</td><td>{client.projectCount}</td><td>{formatCurrency(client.invoicedTotal)}</td><td className="font-semibold">{formatCurrency(client.paidTotal)}</td><td><StatusPill tone="warn">{client.matchMethod||"NONE"}</StatusPill></td><td><RobawsSourceEditor companyId={data.company.id} client={client} initialSource={manualSourceForClient(client)}/></td></tr>)}
          </tbody></table></div>:<EmptyState title="ROBAWS reconciliation complete" body="Every commercial client is linked to a CRM lead."/>}
          {unmatchedWon.length>40&&<p className="mt-3 text-xs text-[var(--muted)]">Showing the 40 highest-value unmatched clients of {unmatchedWon.length}.</p>}
        </div>
        <div>
          <strong className="text-sm">CRM signed exceptions</strong>
          <p className="mt-1 text-xs text-[var(--muted)]">CRM says signed, but ROBAWS does not yet confirm a commercial client.</p>
          <div className="mt-3 space-y-2">{signedUnconfirmedRows.length?signedUnconfirmedRows.map(row=><div key={row.lead.id} className="border border-[var(--line)] p-3"><div className="flex items-center justify-between gap-2"><strong className="text-sm">{row.lead.name}</strong><StatusPill tone="warn">{row.lead.commercialStatus||"Not confirmed"}</StatusPill></div><p className="mt-1 text-xs text-[var(--muted)]">{row.lead.source} · CRM: {row.lead.crmStatus}</p></div>):<div className="border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">No signed CRM exception.</div>}</div>
        </div>
      </div>
    </Card>

    <IntegrationCenter companyId={data.company.id} integrations={data.integrations}/>

    <ManualOverridesPanel data={data}/>

    <Card className="p-5">
      <SectionHeader title="Integration freshness" description="Last successful sync is shown per source so stale data is visible."/>
      <div className="table-scroll"><table><thead><tr><th>Source</th><th>Status</th><th>Resource</th><th>Last successful sync</th><th>Last attempt</th><th>Records</th></tr></thead><tbody>
        {data.integrations.map(item=><tr key={item.id}><td className="font-semibold">{item.name}</td><td><StatusPill tone={item.status==="Connected"?"good":item.status==="Error"?"bad":"warn"}>{item.status}</StatusPill></td><td>{item.resource}</td><td>{formatTimestamp(item.lastSuccess)}</td><td>{formatTimestamp(item.lastAttempt)}</td><td>{formatNumber(item.records)}</td></tr>)}
      </tbody></table></div>
    </Card>
  </div>;
}

export type SourceBusinessRow = {
  source:string; spend:number|null; costState:"known"|"missing"|"not-applicable";
  isManualSpend:boolean; manualNote:string; recurringSpend:number;
  leads:number; qualified:number; visits:number; offers:number; sentValue:number; openValue:number;
  signed:number; commercialClients:number; attributedClients:number; projectValue:number; paid:number;
};

export function sourceBusinessRows(data:CompanyDataset,rows:JourneyRow[]):SourceBusinessRow[] {
  const groups=new Map<string,JourneyRow[]>();
  for(const row of rows){
    const key=decisionSource(row.lead.source);
    groups.set(key,[...(groups.get(key)??[]),row]);
  }
  const invoices=(data.commercialInvoices??[]).filter(item=>!hasDateConflict(item.attributionStatus));
  const result=[...groups.entries()].map(([source,group])=>{
    const leadIds=new Set(group.flatMap(item=>item.leadIds));
    const sourceInvoices=invoices.filter(item=>item.leadId!==null&&leadIds.has(item.leadId));
    const manual = sourceSpendOverride(data,source);
    const recurring = recurringSourceSpend(data,source);
    const baseSpend = manual ? Number(manual.value) : spendForSource(data,source,group);
    const spend = baseSpend===null
      ? (recurring.amount>0?recurring.amount:null)
      : baseSpend+recurring.amount;
    const nonPaid=!paidSources.has(source);
    const costState: SourceBusinessRow["costState"] = nonPaid ? "not-applicable" : spend === null || !Number.isFinite(spend) ? "missing" : "known";
    return {
      source,
      spend:Number.isFinite(spend as number)?spend:null,
      costState,
      isManualSpend:Boolean(manual),
      manualNote:manual?.note??"",
      recurringSpend:recurring.amount,
      leads:group.length,
      qualified:group.filter(item=>item.isQualified).length,
      visits:group.filter(hasCompletedVisitEvidence).length,
      offers:group.filter(item=>item.offers.some(hasOfferSentEvidence) || hasLeadOfferEvidence(item.lead)).length,
      sentValue:group.reduce((total,item)=>total+item.sentOfferValue,0),
      openValue:group.reduce((total,item)=>total+item.openOfferValue,0),
      signed:group.filter(item=>item.isSigned).length,
      commercialClients:group.filter(item=>item.isCommercialClient).length,
      attributedClients:group.filter(item=>item.isAttributableClient).length,
      projectValue:group.reduce((total,item)=>total+item.projectValue,0),
      paid:sourceInvoices.reduce((total,item)=>total+item.paidTotal,0),
    };
  });

  const bySource=new Map(result.map(row=>[row.source,row]));
  const rowLeadIds=new Set(rows.flatMap(row=>row.leadIds));
  const manualOnlyClients=(data.commercialClients??[]).filter(client=>
    client.commercialStatus==="CLIENT_WON" &&
    commercialClientInPeriod(data,client) &&
    Boolean(manualRobawsSource(data,client)) &&
    !(client.matchedLeadId&&rowLeadIds.has(client.matchedLeadId))
  );

  for(const client of manualOnlyClients){
    const source=decisionSource(manualRobawsSource(data,client)??"Unattributed");
    let row=bySource.get(source);
    if(!row){
      const manualSpend=sourceSpendOverride(data,source);
      const recurring=recurringSourceSpend(data,source);
      const baseSpend=manualSpend?Number(manualSpend.value):spendForSource(data,source,[]);
      const spend=baseSpend===null?(recurring.amount>0?recurring.amount:null):baseSpend+recurring.amount;
      const nonPaid=!paidSources.has(source);
      row={
        source,
        spend:Number.isFinite(spend as number)?spend:null,
        costState:nonPaid?"not-applicable":spend===null||!Number.isFinite(spend)?"missing":"known",
        isManualSpend:Boolean(manualSpend),
        manualNote:manualSpend?.note??"",
        recurringSpend:recurring.amount,
        leads:0,qualified:0,visits:0,offers:0,sentValue:0,openValue:0,signed:0,
        commercialClients:0,attributedClients:0,projectValue:0,paid:0,
      };
      bySource.set(source,row);
      result.push(row);
    }
    row.commercialClients+=1;
    row.attributedClients+=1;
    row.projectValue+=client.projectValueTotal||client.acceptedOfferTotal;
    row.paid+=client.paidTotal;
  }

  return result.sort((a,b)=>b.paid-a.paid||b.projectValue-a.projectValue||b.openValue-a.openValue||b.leads-a.leads);
}

function commercialClientInPeriod(data:CompanyDataset,client:NonNullable<CompanyDataset["commercialClients"]>[number]){
  const [from,to]=data.periodLabel.split(" — ");
  const date=client.clientSince?.slice(0,10)??"";
  return Boolean(date&&from&&to&&date>=from&&date<=to);
}

function manualRobawsSource(data:CompanyDataset,client:NonNullable<CompanyDataset["commercialClients"]>[number]){
  const overrides=(data.manualOverrides??[]).filter(item=>item.scopeType==="client"&&item.fieldKey==="source"&&typeof item.value==="string");
  const keys=[`robaws:${client.externalId}`,client.id,client.matchedLeadId??""].filter(Boolean);
  const matches=overrides.filter(item=>keys.includes(item.scopeKey));
  const preferred=matches.find(item=>item.periodKey===data.periodKey)??matches.find(item=>item.periodKey==="all")??matches[0];
  return typeof preferred?.value==="string"&&preferred.value.trim()?preferred.value.trim():null;
}

function sourceSpendOverride(data:CompanyDataset,source:string){
  return (data.manualOverrides??[]).find(item=>
    item.scopeType==="source" &&
    item.scopeKey===source &&
    item.fieldKey==="spend" &&
    typeof item.value==="number"
  )??null;
}

function recurringSourceSpend(data:CompanyDataset,source:string){
  const [periodStart,periodEnd]=data.periodLabel.split(" — ");
  if(!periodStart||!periodEnd)return {amount:0,note:""};

  const today=new Date().toISOString().slice(0,10);
  let amount=0;
  const notes:string[]=[];

  for(const item of data.manualOverrides??[]){
    if(item.scopeType!=="source"||item.scopeKey!==source||item.fieldKey!=="recurring_spend")continue;
    if(!item.value||typeof item.value!=="object"||Array.isArray(item.value))continue;
    const value=item.value as Record<string,unknown>;
    const monthly=Number(value.monthly??0);
    const start=typeof value.start==="string"?value.start:"";
    const configuredEnd=typeof value.end==="string"&&value.end?value.end:null;
    if(!Number.isFinite(monthly)||monthly<=0||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(start))continue;

    const effectiveStart=[periodStart,start].sort().at(-1)!;
    const effectiveEnd=[periodEnd,configuredEnd??today,today].sort()[0];
    if(effectiveStart>effectiveEnd)continue;

    const [sy,sm]=effectiveStart.split("-").map(Number);
    const [ey,em]=effectiveEnd.split("-").map(Number);
    const months=(ey-sy)*12+(em-sm)+1;
    if(months<=0)continue;

    amount+=months*monthly;
    const label=typeof value.label==="string"&&value.label.trim()?value.label.trim():"Recurring offline spend";
    notes.push(`${label}: ${months} × €${monthly.toFixed(2)}`);
  }

  return {amount,note:notes.join(" · ")};
}

function SpendEditor({data,row,onClose}:{data:CompanyDataset;row:SourceBusinessRow;onClose:()=>void}){
  const router=useRouter();
  const [value,setValue]=useState(row.spend===null?"":String(Math.max(0,row.spend-row.recurringSpend)));
  const [note,setNote]=useState(row.manualNote);
  const [pending,setPending]=useState(false);
  const [error,setError]=useState("");

  async function save(){
    const amount=Number(value.replace(",","."));
    if(!Number.isFinite(amount)||amount<0){setError("Enter a valid spend amount.");return;}
    setPending(true);setError("");
    const response=await fetch("/api/overrides",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({
      companyId:data.company.id,
      periodKey:data.periodKey??"ytd",
      scopeType:"source",
      scopeKey:row.source,
      fieldKey:"spend",
      value:amount,
      note,
    })});
    const body=await response.json().catch(()=>({}));
    setPending(false);
    if(!response.ok){setError(body.error??"Could not save manual spend.");return;}
    onClose();router.refresh();
  }

  async function reset(){
    setPending(true);setError("");
    const response=await fetch("/api/overrides",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({
      companyId:data.company.id,
      periodKey:data.periodKey??"ytd",
      scopeType:"source",
      scopeKey:row.source,
      fieldKey:"spend",
    })});
    setPending(false);
    if(!response.ok){const body=await response.json().catch(()=>({}));setError(body.error??"Could not reset override.");return;}
    onClose();router.refresh();
  }

  return <div className="drawer-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
    <aside className="drawer max-w-[460px]" role="dialog" aria-modal="true" aria-label={"Edit "+row.source+" spend"}>
      <header className="flex items-start justify-between border-b border-[var(--line)] p-5">
        <div><p className="eyebrow">Manual correction</p><h2 className="mt-1 text-2xl font-bold tracking-tight">{row.source}</h2><p className="mt-2 text-sm text-[var(--muted)]">This changes dashboard calculations only. Synced ad-platform data stays untouched.</p></div>
        <button type="button" onClick={onClose} className="icon-button"><X size={17}/></button>
      </header>
      <div className="space-y-5 p-5">
        <label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-wide text-[var(--muted)]">Base spend for {data.periodKey??"selected period"}</span><div className="flex items-center border border-[var(--line)] bg-white px-3"><span className="text-[var(--muted)]">€</span><input value={value} onChange={e=>setValue(e.target.value)} inputMode="decimal" className="h-11 w-full px-2 outline-none" placeholder="0.00"/></div></label>
        {row.recurringSpend>0&&<div className="callout"><CircleDollarSign size={17}/><div><strong>Recurring offline spend is added automatically</strong><p>{formatCurrency(row.recurringSpend)} is added for this reporting period on top of the base spend.</p></div></div>}
        <label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-wide text-[var(--muted)]">Reason / note</span><textarea value={note} onChange={e=>setNote(e.target.value)} className="min-h-28 w-full border border-[var(--line)] p-3 text-sm outline-none" placeholder="Example: LeadAngel invoice for September"/></label>
        {error&&<div className="border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}
        <div className="flex gap-2">
          <button type="button" onClick={save} disabled={pending} className="button-primary flex-1">{pending?"Saving…":"Save manual value"}</button>
          {row.isManualSpend&&<button type="button" onClick={reset} disabled={pending} className="button-secondary"><RotateCcw size={14}/> Reset to synced</button>}
        </div>
      </div>
    </aside>
  </div>;
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

function ManualOverridesPanel({data}:{data:CompanyDataset}){
  const router=useRouter();
  const [pending,setPending]=useState<string|null>(null);
  const overrides=data.manualOverrides??[];

  async function reset(item:NonNullable<CompanyDataset["manualOverrides"]>[number]){
    setPending(item.id);
    await fetch("/api/overrides",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({
      companyId:data.company.id,
      periodKey:item.periodKey,
      scopeType:item.scopeType,
      scopeKey:item.scopeKey,
      fieldKey:item.fieldKey,
    })});
    setPending(null);
    router.refresh();
  }

  return <Card className="p-5">
    <SectionHeader title="Manual corrections" description="Visible override layer. Synced source data is never overwritten."/>
    {overrides.length?<div className="table-scroll"><table><thead><tr><th>Scope</th><th>Item</th><th>Field</th><th>Manual value</th><th>Note</th><th>Updated</th><th></th></tr></thead><tbody>
      {overrides.map(item=><tr key={item.id}><td>{item.scopeType}</td><td className="font-semibold">{item.scopeKey}</td><td>{item.fieldKey}</td><td>{typeof item.value==="number"?formatCurrency(item.value):String(item.value??"—")}</td><td>{item.note||"—"}</td><td>{formatTimestamp(item.updatedAt)}</td><td><button type="button" disabled={pending===item.id} onClick={()=>reset(item)} className="button-secondary"><RotateCcw size={13}/>{pending===item.id?"Resetting…":"Reset"}</button></td></tr>)}
    </tbody></table></div>:<EmptyState title="No manual corrections" body="Everything in this period currently comes from synced source data."/>}
  </Card>;
}

function RevenueClientTable({data}:{data:CompanyDataset}) {
  const rows=buildJourneyRows(data).filter(row=>row.isSigned||row.isCommercialClient||row.offers.length>0||row.projects.length>0);
  const invoices=(data.commercialInvoices??[]).filter(item=>!hasDateConflict(item.attributionStatus));
  if(!rows.length) return <EmptyState title="No commercial records" body="Commercial rows appear after CRM / ROBAWS data is synced."/>;
  return <div className="table-scroll"><table><thead><tr><th>Client</th><th>Source</th><th>CRM signed</th><th>ROBAWS client</th><th>Sent offer €</th><th>Project €</th><th>Invoiced €</th><th>Paid €</th><th>Attribution</th></tr></thead><tbody>
    {rows.sort((a,b)=>b.projectValue-a.projectValue).map(row=>{
      const ids=new Set(row.leadIds);
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
function HealthMetric({icon,label,value}:{icon:ReactNode;label:string;value:number}){return <div className="bg-white p-4"><div className="flex items-center gap-2 text-[var(--muted)]">{icon}<span className="text-xs font-semibold uppercase tracking-wide">{label}</span></div><strong className={`mt-3 block text-2xl ${value>0?"text-amber-700":"text-emerald-700"}`}>{formatNumber(value)}</strong></div>}


function RobawsSourceEditor({companyId,client,initialSource}:{companyId:string;client:NonNullable<CompanyDataset["commercialClients"]>[number];initialSource:string|null}) {
  const router=useRouter();
  const [source,setSource]=useState(initialSource??"");
  const [pending,setPending]=useState(false);
  const [error,setError]=useState("");

  async function save(){
    const value=source.trim();
    if(!value){setError("Enter a source first.");return;}
    setPending(true);setError("");
    const response=await fetch("/api/overrides",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({
      companyId,periodKey:"all",scopeType:"client",scopeKey:`robaws:${client.externalId}`,fieldKey:"source",value,
      note:"Manual ROBAWS client source attribution",
    })});
    if(!response.ok){const body=await response.json().catch(()=>({}));setError(body.error??"Could not save source.");setPending(false);return;}
    setPending(false);router.refresh();
  }

  async function reset(){
    setPending(true);setError("");
    const response=await fetch("/api/overrides",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({
      companyId,periodKey:"all",scopeType:"client",scopeKey:`robaws:${client.externalId}`,fieldKey:"source",
    })});
    if(!response.ok){const body=await response.json().catch(()=>({}));setError(body.error??"Could not reset source.");setPending(false);return;}
    setSource("");setPending(false);router.refresh();
  }

  return <div className="min-w-[220px]">
    <div className="flex gap-2">
      <input aria-label={`Source for ${client.name}`} className="h-9 min-w-0 flex-1 border border-[var(--line)] px-2 text-sm" value={source} onChange={event=>setSource(event.target.value)} placeholder="e.g. LeadAngel"/>
      <button type="button" className="button-primary px-3" onClick={save} disabled={pending}>{pending?"…":"Save"}</button>
      {initialSource&&<button type="button" className="button-secondary px-2" onClick={reset} disabled={pending} aria-label="Reset manual source"><RotateCcw size={13}/></button>}
    </div>
    {initialSource&&<p className="mt-1 text-[11px] font-semibold text-emerald-700">Manual: {initialSource}</p>}
    {error&&<p className="mt-1 text-[11px] text-rose-700">{error}</p>}
  </div>;
}
