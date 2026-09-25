"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, CircleDollarSign, Database, FilterX, Pencil, RotateCcw, X } from "lucide-react";
import type { CompanyDataset } from "@/lib/data/types";
import { buildFunnelSummary, buildJourneyRows, campaignPipelineRows, hasLeadOfferEvidence, hasOfferSentEvidence, stageConversion, type JourneyRow } from "@/lib/metrics/client-funnel";
import { buildOverviewAnalytics, buildSourcePerformance, hasCompletedVisitEvidence, hasSafeAcquisitionSource, normalizeAcquisitionSource } from "@/lib/metrics/business-overview";
import { formatCurrency, formatNumber, formatPercent, percentage, safeDivide } from "@/lib/metrics/kpis";
import { Card, EmptyState, KpiCard, SectionHeader, StatusPill } from "./ui";
import { IntegrationCenter } from "./integration-center";
import { RecordDrilldownDrawer, type RecordDrilldown } from "./record-drilldown";


export function FunnelPage({ data }: { data: CompanyDataset }) {
  const rows = buildJourneyRows(data);
  const summary = buildFunnelSummary(data);
  const acquisition = buildOverviewAnalytics(data,{source:"all",campaign:"all"});
  const [drilldown,setDrilldown]=useState<RecordDrilldown|null>(null);
  const appointments = rows.filter(hasAppointmentEvidence).length;
  const completedVisits = rows.filter(hasCompletedVisitEvidence).length;
  const sentOffers = rows.filter(row => row.offers.some(hasOfferSentEvidence) || hasLeadOfferEvidence(row.lead)).length;
  const commercialClients = rows.filter(row => row.isCommercialClient).length;
  const stages = [
    { label:"Known acquired leads", value:acquisition.cohort.knownAcquired, note:`${summary.uniquePeople} CRM-tracked · ${acquisition.cohort.supplierOnly} supplier-only` },
    { label:"CRM tracked", value:summary.uniquePeople, note:"Deduplicated CRM people with acquisition date" },
    { label:"Qualified", value:summary.qualified, note:"Relevant / progressed CRM people" },
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
  const cancelledOffers = rows.filter(row => row.latestOffer?.isCancelled).length;
  const qualifiedNoOfferRows=rows.filter(row=>row.isQualified&&row.offers.length===0);

  return <div className="space-y-6">
    <Card className="overflow-hidden">
      <div className="border-b border-[var(--line)] p-5"><SectionHeader title="Lead → client funnel" description="Each transition is shown separately so leakage cannot hide inside one generic conversion rate."/></div>
      <div className="control-funnel">
        {stages.map((stage,index) => {
          const previous = index===0 ? null : stages[index-1].value;
          const conversion = previous===null ? null : stageConversion(stage.value,previous);
          const relevant=["Known acquired leads","CRM tracked"].includes(stage.label)?rows
            :stage.label==="Qualified"?rows.filter(row=>row.isQualified)
            :stage.label==="Appointments"?rows.filter(hasAppointmentEvidence)
            :stage.label==="Visits"?rows.filter(hasCompletedVisitEvidence)
            :stage.label==="Offers sent"?rows.filter(row=>row.offers.some(hasOfferSentEvidence)||hasLeadOfferEvidence(row.lead))
            :stage.label==="Accepted"?rows.filter(row=>row.offers.some(item=>item.isAccepted))
            :stage.label==="CRM signed"?rows.filter(row=>row.isSigned)
            :rows.filter(row=>row.isCommercialClient);
          const leadIds=new Set(relevant.flatMap(row=>row.leadIds));
          const selection:RecordDrilldown={
            title:stage.label,
            subtitle:stage.label==="Known acquired leads"
              ? `${data.periodLabel} · ${summary.uniquePeople} CRM-tracked records shown here; ${acquisition.cohort.supplierOnly} supplier-only leads have no CRM record/acquisition date`
              : data.periodLabel,
            leads:relevant.map(row=>row.lead),
            appointments:["Appointments","Visits"].includes(stage.label)?(data.commercialAppointments??[]).filter(item=>leadIds.has(item.leadId)):undefined,
            offers:["Offers sent","Accepted"].includes(stage.label)?relevant.flatMap(row=>row.offers).filter((item,index,array)=>array.findIndex(other=>other.id===item.id)===index):undefined,
            clients:stage.label==="ROBAWS clients"?(data.commercialClients??[]).filter(client=>Boolean(client.matchedLeadId&&leadIds.has(client.matchedLeadId))):undefined,
          };
          return <button type="button" className="control-funnel-stage drillable text-left" key={stage.label} onClick={()=>setDrilldown(selection)}>
            <span>{stage.label}</span>
            <strong className="drillable-value">{formatNumber(stage.value)}</strong>
            <small>{stage.note}</small>
            {conversion!==null && <em>{formatPercent(conversion)} from previous stage</em>}
          </button>;
        })}
      </div>
      <button type="button" className="m-4 mt-0 flex w-[calc(100%-2rem)] items-center justify-between gap-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-left text-amber-950" onClick={()=>setDrilldown({title:"Qualified people without a ROBAWS offer",subtitle:data.periodLabel,leads:qualifiedNoOfferRows.map(row=>row.lead)})}>
        <div><strong>{qualifiedNoOfferRows.length} qualified people have no linked ROBAWS offer</strong><p className="mt-1 text-xs opacity-80">Click to see exactly who they are. This is why Qualified can be higher than People with offer.</p></div><span className="text-lg font-bold">{qualifiedNoOfferRows.length}</span>
      </button>
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
              <div><strong>{previous.label} → {stage.label}</strong><span>{index===0?lost+" known leads are supplier-only / not CRM-tracked":lost+" did not progress"}</span></div>
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
          <Leak label="Offer afgekeurd" value={rejected}/>
          <Leak label="Offer cancelled" value={cancelledOffers}/>
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
    {drilldown&&<RecordDrilldownDrawer data={data} selection={drilldown} onClose={()=>setDrilldown(null)}/>}
  </div>;
}

export function SourcesCampaignsPage({ data }: { data: CompanyDataset }) {
  const rows = buildJourneyRows(data);
  const sources = sourceBusinessRows(data,rows);
  const campaignRows = campaignBusinessRows(data,rows);
  const sourceKnownClients=sources.reduce((sum,row)=>sum+row.commercialClients,0);
  const datedCohortClients=sources.reduce((sum,row)=>sum+row.attributedClients,0);
  const undatedSourceClients=sources.reduce((sum,row)=>sum+row.undatedClients,0);
  const [editingSource,setEditingSource]=useState<SourceBusinessRow|null>(null);
  const [drilldown,setDrilldown]=useState<RecordDrilldown|null>(null);

  return <div className="space-y-6">
    <div className="callout"><AlertTriangle size={18}/><div><strong>{sourceKnownClients} source-known commercial client(s) are visible in this acquisition scope.</strong><p>{datedCohortClients} client(s) have a trusted acquisition date and can drive cohort CAC/ROAS. {undatedSourceClients} source-known client(s) have no trustworthy acquisition month and remain visible but excluded from cohort economics.</p></div></div>
    <Card className="p-5">
      <SectionHeader title="Source → business result" description="Marketing outcomes follow the acquisition source and acquisition cohort. Supplier-delivered counts are used when verified; downstream stages remain CRM-backed. Later project value stays with the month/source that acquired the lead."/>
      <div className="table-scroll"><table className="wide-decision-table">
        <thead><tr><th>Source</th><th>Spend</th><th>Known leads</th><th>Qualified</th><th>Visits</th><th>Offers sent</th><th>Sent €</th><th>Open €</th><th>Signed</th><th>Source-known clients</th><th>Dated cohort clients</th><th>Source project € excl. VAT</th><th>Source paid value €</th><th>Cohort project € excl. VAT</th><th>Cohort paid value €</th><th>CPL</th><th>Cost / qual.</th><th>Cost / visit</th><th>Cost / offer</th><th>Source CAC</th><th>Cohort CAC</th><th>Pipeline ROAS</th><th>Source paid ROAS</th><th>Cohort paid ROAS</th></tr></thead>
        <tbody>{sources.map(row => <tr key={row.source}>
          <td className="font-semibold"><button type="button" className="underline decoration-transparent underline-offset-4 hover:decoration-current" onClick={()=>{const sourceRows=rows.filter(item=>decisionSource(item.lead.source)===row.source);const leadIds=new Set(sourceRows.flatMap(item=>item.leadIds));setDrilldown({title:row.source+" source details",subtitle:data.periodLabel,initialKind:"clients",leads:sourceRows.map(item=>item.lead),clients:(data.commercialClients??[]).filter(client=>client.commercialStatus==="CLIENT_WON"&&(Boolean(client.matchedLeadId&&leadIds.has(client.matchedLeadId))||(data.periodKey==="ytd"&&decisionSource(manualRobawsSource(data,client)??"")===row.source))).sort((a,b)=>b.paidTotal-a.paidTotal||a.name.localeCompare(b.name)),offers:(data.commercialOffers??[]).filter(item=>decisionSource(item.source)===row.source),projects:(data.periodCommercialProjects??[]).filter(item=>decisionSource(item.source)===row.source),invoices:(data.periodCommercialInvoices??[]).filter(item=>decisionSource(item.source)===row.source)})}}>{row.source}</button></td>
          <td><button type="button" onClick={()=>setEditingSource(row)} className="inline-flex items-center gap-2 font-semibold underline decoration-transparent underline-offset-4 hover:decoration-current">{row.costState==="missing"?<StatusPill tone="warn">Add spend</StatusPill>:row.spend===null?"—":formatCurrency(row.spend)}{row.isManualSpend&&<StatusPill tone="accent">Manual</StatusPill>}{row.recurringSpend>0&&<StatusPill tone="accent">+ recurring</StatusPill>}<Pencil size={12}/></button></td>
          <td>{row.deliveredLeads===null&&row.crmLeads===0&&row.commercialClients>0?<><StatusPill tone="warn">Lead count missing</StatusPill><small className="block text-[var(--muted)]">Source-known client exists</small></>:<>{row.leads}{row.deliveredLeads!==null&&<small className="block text-[var(--muted)]">{row.crmLeads} CRM-tracked · {row.supplierOnlyLeads} supplier-only</small>}</>}</td><td>{row.qualified}</td><td>{row.visits}</td><td>{row.offers}</td>
          <td>{formatCurrency(row.sentValue)}</td><td>{formatCurrency(row.openValue)}</td><td>{row.signed}</td><td>{row.commercialClients}</td><td>{row.attributedClients}{row.undatedClients>0&&<small className="block text-amber-700">+{row.undatedClients} month unverified</small>}</td>
          <td>{formatCurrency(row.sourceProjectValue)}</td><td className="font-semibold">{formatCurrency(row.sourcePaid)}</td><td>{formatCurrency(row.cohortProjectValue)}</td><td>{formatCurrency(row.cohortPaid)}</td>
          <td>{costMetric(row.spend,row.leads)}</td><td>{costMetric(row.spend,row.qualified)}</td><td>{costMetric(row.spend,row.visits)}</td><td>{costMetric(row.spend,row.offers)}</td><td>{costMetric(row.spend,row.commercialClients)}</td><td>{costMetric(row.spend,row.attributedClients)}</td>
          <td>{ratioMetric(row.openValue,row.spend)}</td><td className="font-semibold">{ratioMetric(row.sourcePaid,row.spend)}</td><td>{ratioMetric(row.cohortPaid,row.spend)}</td>
        </tr>)}</tbody>
      </table></div>
    </Card>

    <Card className="p-5">
      <SectionHeader title="Campaign → commercial outcome" description="Campaigns are judged beyond CPL: lead quality, visits, offers, attributable clients and project value are kept together."/>
      {campaignRows.length ? <div className="table-scroll"><table>
        <thead><tr><th>Campaign</th><th>Channel</th><th>Spend</th><th>Leads</th><th>Qualified</th><th>Visits</th><th>Offers sent</th><th>Sent €</th><th>Open €</th><th>Attributed clients</th><th>Project €</th><th>CAC</th><th>Project ROAS</th></tr></thead>
        <tbody>{campaignRows.map(row=><tr key={row.campaign}><td className="font-semibold"><button type="button" className="underline decoration-transparent underline-offset-4 hover:decoration-current" onClick={()=>{const campaignLeads=data.leads.filter(lead=>lead.campaign===row.campaign);const ids=new Set(campaignLeads.map(lead=>lead.id));setDrilldown({title:row.campaign+" campaign details",subtitle:data.periodLabel,leads:campaignLeads,offers:(data.commercialOffers??[]).filter(item=>ids.has(item.leadId)),projects:(data.commercialProjects??[]).filter(item=>Boolean(item.leadId&&ids.has(item.leadId))),invoices:(data.commercialInvoices??[]).filter(item=>Boolean(item.leadId&&ids.has(item.leadId)))})}}>{row.campaign}</button></td><td>{row.channel}</td><td>{row.spend>0?formatCurrency(row.spend):"—"}</td><td>{row.leads}</td><td>{row.qualified}</td><td>{row.visits}</td><td>{row.offers}</td><td>{formatCurrency(row.sentValue)}</td><td>{formatCurrency(row.openValue)}</td><td>{row.clients}</td><td>{formatCurrency(row.projectValue)}</td><td>{row.spend>0?costMetric(row.spend,row.clients):"—"}</td><td>{row.spend>0?ratioMetric(row.projectValue,row.spend):"—"}</td></tr>)}</tbody>
      </table></div> : <EmptyState title="No campaign attribution" body="Campaign-level rows appear when CRM leads retain a campaign relationship."/>}
    </Card>

    <div className="grid gap-3 lg:grid-cols-2">
      <div className="callout"><AlertTriangle size={18}/><div><strong>Spend scope matters.</strong><p>Channel spend is the tracked spend for the selected period. If a channel also ran awareness or non-lead campaigns, that spend remains included rather than being silently removed from CAC.</p></div></div>
      <div className="callout"><AlertTriangle size={18}/><div><strong>Ad set / ad / creative economics need the lead-to-ad join.</strong><p>The schema can store ad-level data, but this page will not infer creative winners from CTR or campaign totals when person-level commercial attribution is missing.</p></div></div>
    </div>
    {editingSource&&<SpendEditor data={data} row={editingSource} onClose={()=>setEditingSource(null)}/>}
    {drilldown&&<RecordDrilldownDrawer data={data} selection={drilldown} onClose={()=>setDrilldown(null)}/>}
  </div>;
}

export function RevenuePage({ data }: { data: CompanyDataset }) {
  const offers=(data.commercialOffers??[]).filter(item=>!hasDateConflict(item.attributionStatus));
  const projects=(data.commercialProjects??[]).filter(item=>!hasDateConflict(item.attributionStatus));
  const invoices=(data.commercialInvoices??[]).filter(item=>!hasDateConflict(item.attributionStatus));
  const periodProjects=(data.periodCommercialProjects??projects).filter(item=>!hasDateConflict(item.attributionStatus));
  const periodInvoices=(data.periodCommercialInvoices??invoices).filter(item=>!hasDateConflict(item.attributionStatus));
  const [drilldown,setDrilldown]=useState<RecordDrilldown|null>(null);
  const sent=offers.filter(item=>Boolean(item.sentAt));
  const open=sent.filter(item=>item.isOpen);
  const accepted=offers.filter(item=>item.isAccepted);
  const offeredValue=sum(sent.map(item=>item.priceInclVat));
  const openValue=sum(open.map(item=>item.priceInclVat));
  const acceptedValue=sum(accepted.map(item=>item.priceInclVat));
  const cohortProjectValue=sum(projects.map(item=>Number(item.valueInclVat??0)));
  const cohortInvoiced=sum(invoices.map(item=>Math.max(0,item.totalInclVat-item.creditedTotal)));
  const cohortPaid=sum(invoices.map(item=>item.paidTotal));
  const periodProjectValue=sum(periodProjects.map(item=>Number(item.valueInclVat??0)));
  const periodInvoiced=sum(periodInvoices.map(item=>Math.max(0,item.totalInclVat-item.creditedTotal)));
  const periodPaid=sum(periodInvoices.map(item=>item.paidTotal));

  return <div className="space-y-6">
    <Card className="p-5">
      <SectionHeader title="Acquisition-cohort commercial value" description="All values in this block follow the lead-acquisition cohort. Later offers, project value, invoices and paid value remain attached to the month the lead was acquired."/>
      <div className="revenue-stage-grid mt-4">
        <RevenueStage label="Total offered" value={offeredValue} note={sent.length+" sent offers"} onClick={()=>setDrilldown({title:"Sent offers · acquisition cohort",subtitle:data.periodLabel,offers:sent})}/>
        <RevenueStage label="Open pipeline" value={openValue} note={open.length+" still open"} onClick={()=>setDrilldown({title:"Open offers · acquisition cohort",subtitle:data.periodLabel,offers:open})}/>
        <RevenueStage label="Accepted / contracted" value={acceptedValue} note={accepted.length+" accepted offers"} onClick={()=>setDrilldown({title:"Accepted offers · acquisition cohort",subtitle:data.periodLabel,offers:accepted})}/>
        <RevenueStage label="Cohort project value" value={cohortProjectValue} note={projects.length+" linked project records"} onClick={()=>setDrilldown({title:"Projects attributed to acquisition cohort",subtitle:data.periodLabel,projects})}/>
        <RevenueStage label="Cohort invoiced" value={cohortInvoiced} note="Lifetime linked invoices · net of credits" onClick={()=>setDrilldown({title:"Invoices attributed to acquisition cohort",subtitle:data.periodLabel,invoices})}/>
        <RevenueStage label="Cohort paid value" value={cohortPaid} note="Current paid_total on linked invoices; not payment-date cash" onClick={()=>setDrilldown({title:"Paid value attributed to acquisition cohort",subtitle:data.periodLabel,invoices:invoices.filter(item=>item.paidTotal>0)})}/>
      </div>
    </Card>

    <Card className="p-5">
      <SectionHeader title="Business this period" description="Separate operational clock: projects and invoices are counted by their actual calendar dates in the selected period, regardless of when the lead was acquired."/>
      <div className="revenue-stage-grid mt-4">
        <RevenueStage label="Projects won" value={periodProjectValue} note={periodProjects.length+" project records"} onClick={()=>setDrilldown({title:"Projects won in selected period",subtitle:data.periodLabel,projects:periodProjects})}/>
        <RevenueStage label="Invoiced" value={periodInvoiced} note="Invoices dated in selected period · net of credits" onClick={()=>setDrilldown({title:"Invoices in selected period",subtitle:data.periodLabel,invoices:periodInvoices})}/>
        <RevenueStage label="Paid value on period invoices" value={periodPaid} note="Current paid_total on invoices dated in this period; not payment-date cash collection" onClick={()=>setDrilldown({title:"Period invoices with paid value",subtitle:data.periodLabel,invoices:periodInvoices.filter(item=>item.paidTotal>0)})}/>
      </div>
    </Card>

    <Card className="p-5">
      <SectionHeader title="Commercial client ledger" description="Signed status, ROBAWS confirmation, project value, invoiced and paid stay separate."/>
      <RevenueClientTable data={data}/>
    </Card>
    {drilldown&&<RecordDrilldownDrawer data={data} selection={drilldown} onClose={()=>setDrilldown(null)}/>}
  </div>;
}

export function DataHealthPage({ data }: { data: CompanyDataset }) {
  const rows=buildJourneyRows(data);
  const clients=data.commercialClients??[];
  const sourcePerformance=buildSourcePerformance(data,rows);
  const supplierOnly=sourcePerformance.reduce((sum,row)=>sum+row.supplierOnlyLeads,0);
  const supplierMatchedPeople=sourcePerformance.reduce((sum,row)=>sum+Number(row.supplierMatchedPeople??0),0);
  const sourceKnownWithoutTrustedMonth=sourcePerformance.reduce((sum,row)=>sum+row.undatedClients,0);
  const knownAcquired=rows.length+supplierOnly;
  const googleSpendPresent=sourcePerformance.some(row=>row.source==="Google Ads"&&row.costState==="known"&&Number(row.spend??0)>0);
  const signedUnconfirmedRows=rows.filter(row=>row.isSigned&&!row.isCommercialClient);
  const acquisitionDateConflictRows=rows.filter(row=>row.hasAcquisitionDateConflict);
  const signedUnconfirmed=signedUnconfirmedRows.length;
  const unmatchedClients=clients.filter(client=>!client.matchedLeadId).length;
  const wonClients=clients.filter(client=>client.commercialStatus==="CLIENT_WON");
  const unmatchedWon=wonClients.filter(client=>!client.matchedLeadId).sort((a,b)=>b.paidTotal-a.paidTotal||b.invoicedTotal-a.invoicedTotal);
  const sourceOverrides=(data.manualOverrides??[]).filter(item=>item.scopeType==="client"&&item.fieldKey==="source"&&typeof item.value==="string");
  const supplierVerifiedSourceOverrides=sourceOverrides.filter(item=>item.note.toLowerCase().includes("agenciyou workbook"));
  const userSourceOverrides=sourceOverrides.filter(item=>!item.note.toLowerCase().includes("agenciyou workbook")&&!item.note.toLowerCase().includes("propagated from user-verified robaws client source"));
  const manualSourceForClient=(client:NonNullable<CompanyDataset["commercialClients"]>[number])=>{
    const keys=[`robaws:${client.externalId}`,client.id,client.matchedLeadId??""].filter(Boolean);
    const matches=sourceOverrides.filter(item=>keys.includes(item.scopeKey));
    const preferred=matches.find(item=>item.periodKey===data.periodKey)??matches.find(item=>item.periodKey==="all")??matches[0];
    return typeof preferred?.value==="string"&&preferred.value.trim()?preferred.value.trim():null;
  };
  const safelyAttributed=rows.filter(row=>row.isAttributableClient&&hasSafeAcquisitionSource(row.lead.source));
  const safeLeadIds=new Set(safelyAttributed.flatMap(row=>row.leadIds));
  const safelyAttributedClientIds=new Set(wonClients.filter(client=>client.matchedLeadId&&safeLeadIds.has(client.matchedLeadId)).map(client=>client.id));
  const manuallyAttributedClientIds=new Set(wonClients.filter(client=>hasSafeAcquisitionSource(manualSourceForClient(client))).map(client=>client.id));
  const attributedClientIds=new Set([...safelyAttributedClientIds,...manuallyAttributedClientIds]);
  const attributionCoverage=percentage(attributedClientIds.size,wonClients.length)??0;
  const businessPaid=wonClients.reduce((sum,client)=>sum+client.paidTotal,0);
  const attributedPaid=wonClients.filter(client=>attributedClientIds.has(client.id)).reduce((sum,client)=>sum+client.paidTotal,0);
  const paidCoverage=percentage(attributedPaid,businessPaid)??0;
  const checks=[
    {label:"CRM source completeness",ok:data.dataHealth.missingSource===0,detail:data.dataHealth.missingSource+" leads missing source"},
    {label:"Duplicate control",ok:data.dataHealth.duplicates===0,detail:data.dataHealth.duplicates+" potential duplicate CRM rows"},
    {label:"Campaign attribution",ok:data.dataHealth.missingCampaign===0,detail:data.dataHealth.missingCampaign+" leads missing campaign"},
    {label:"ROBAWS client reconciliation",ok:wonClients.length>0&&unmatchedWon.length===0,detail:wonClients.length===0?"Full ROBAWS client snapshot not populated":unmatchedWon.length+" commercial clients unmatched"},
    {label:"Marketing attribution coverage",ok:attributionCoverage>=90,detail:attributedClientIds.size+" / "+wonClients.length+" commercial clients have a safe source ("+supplierVerifiedSourceOverrides.length+" supplier-verified lead mappings, "+userSourceOverrides.length+" user/manual source overrides, "+formatPercent(attributionCoverage)+")"},
    {label:"Paid-value attribution",ok:paidCoverage>=90,detail:formatCurrency(attributedPaid)+" / "+formatCurrency(businessPaid)+" source-attributed ("+formatPercent(paidCoverage)+")"},
    {label:"Signed → commercial match",ok:signedUnconfirmed===0,detail:signedUnconfirmed+" signed leads not confirmed as ROBAWS clients"},
    {label:"Google Ads spend",ok:googleSpendPresent,detail:googleSpendPresent?"Verified spend available":"No verified spend"},
    {label:"Supplier → CRM identity coverage",ok:supplierOnly===0,detail:supplierMatchedPeople+" supplier people matched to CRM · "+supplierOnly+" supplier-only without CRM/acquisition date"},
    {label:"Acquisition-date consistency",ok:acquisitionDateConflictRows.length===0,detail:acquisitionDateConflictRows.length+" linked won client(s) have client evidence dated before the CRM lead creation date and are excluded from monthly cohort attribution"},
    {label:"Cohort-month client coverage",ok:sourceKnownWithoutTrustedMonth===0,detail:sourceKnownWithoutTrustedMonth+" source-known won client(s) do not have a trustworthy acquisition month and are excluded from cohort CAC/ROAS"},
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
          <HealthMetric icon={<Database size={15}/>} label="Known acquired people" value={knownAcquired}/>
          <HealthMetric icon={<AlertTriangle size={15}/>} label="Supplier-only / undated" value={supplierOnly}/>
          <HealthMetric icon={<AlertTriangle size={15}/>} label="Acquisition date conflicts" value={acquisitionDateConflictRows.length}/>
          <HealthMetric icon={<AlertTriangle size={15}/>} label="Source-known clients without month" value={sourceKnownWithoutTrustedMonth}/>
        </div>
      </Card>
    </div>

    <Card className="p-5">
      <SectionHeader title="Reconciliation queue" description="This is the work required before monthly cohort CAC / ROAS can be treated as complete business truth. Supplier-only leads remain visible rather than being assigned to a guessed month."/>
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
  leads:number; crmLeads:number; deliveredLeads:number|null; supplierOnlyLeads:number;
  qualified:number; visits:number; offers:number; sentValue:number; openValue:number;
  signed:number; commercialClients:number; attributedClients:number; undatedClients:number;
  sourceProjectValue:number; sourcePaid:number; cohortProjectValue:number; cohortPaid:number;
};

export function sourceBusinessRows(data:CompanyDataset,rows:JourneyRow[]):SourceBusinessRow[] {
  return buildSourcePerformance(data,rows).map(row=>({
    source:row.source,
    spend:row.spend,
    costState:row.costState,
    isManualSpend:row.isManualSpend,
    manualNote:row.spendNote,
    recurringSpend:row.recurringSpend,
    leads:row.deliveredLeads??row.leads,
    crmLeads:row.leads,
    deliveredLeads:row.deliveredLeads,
    supplierOnlyLeads:row.supplierOnlyLeads,
    qualified:row.qualified,
    visits:row.visits,
    offers:row.offers,
    sentValue:rows.filter(item=>normalizeAcquisitionSource(item.lead.source)===row.source).reduce((sum,item)=>sum+item.sentOfferValue,0),
    openValue:rows.filter(item=>normalizeAcquisitionSource(item.lead.source)===row.source).reduce((sum,item)=>sum+item.openOfferValue,0),
    signed:rows.filter(item=>normalizeAcquisitionSource(item.lead.source)===row.source&&item.isSigned).length,
    commercialClients:row.sourceKnownClients,
    attributedClients:row.attributableClients,
    undatedClients:row.undatedClients,
    sourceProjectValue:row.sourceProjectValueExclVat,
    sourcePaid:row.sourcePaidValue,
    cohortProjectValue:row.projectValueExclVat,
    cohortPaid:row.paidValue,
  }));
}

function manualRobawsSource(data:CompanyDataset,client:NonNullable<CompanyDataset["commercialClients"]>[number]){
  const overrides=(data.manualOverrides??[]).filter(item=>item.scopeType==="client"&&item.fieldKey==="source"&&typeof item.value==="string");
  const keys=[`robaws:${client.externalId}`,client.id,client.matchedLeadId??""].filter(Boolean);
  const matches=overrides.filter(item=>keys.includes(item.scopeKey));
  const preferred=matches.find(item=>item.periodKey===data.periodKey)??matches.find(item=>item.periodKey==="all")??matches[0];
  return typeof preferred?.value==="string"&&preferred.value.trim()?preferred.value.trim():null;
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
  const supplierVerified=overrides.filter(item=>item.note.includes("Verified from Isoprotech x Agenciyou workbook"));
  const visibleOverrides=overrides.filter(item=>!item.note.includes("Verified from Isoprotech x Agenciyou workbook"));

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
    <SectionHeader title="Verified reporting overrides" description="Reporting-only corrections are separated by provenance. Raw synced CRM/ROBAWS source data is never overwritten."/>
    {supplierVerified.length>0&&<div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950"><strong>{supplierVerified.length} supplier-verified source mappings</strong><p className="mt-1 text-xs">These mappings come from the verified AgenciYou supplier workbook and are applied for reporting attribution. They are grouped here instead of being presented as user-entered manual corrections.</p></div>}
    {visibleOverrides.length?<div className="table-scroll"><table><thead><tr><th>Scope</th><th>Item</th><th>Field</th><th>Reporting value</th><th>Note</th><th>Updated</th><th></th></tr></thead><tbody>
      {visibleOverrides.map(item=><tr key={item.id}><td>{item.scopeType}</td><td className="font-semibold">{item.scopeKey}</td><td>{item.fieldKey}</td><td>{typeof item.value==="number"?formatCurrency(item.value):String(item.value??"—")}</td><td>{item.note||"—"}</td><td>{formatTimestamp(item.updatedAt)}</td><td><button type="button" disabled={pending===item.id} onClick={()=>reset(item)} className="button-secondary"><RotateCcw size={13}/>{pending===item.id?"Resetting…":"Reset"}</button></td></tr>)}
    </tbody></table></div>:<EmptyState title="No user/manual corrections" body={supplierVerified.length?"Supplier-verified attribution mappings are active; there are no additional user-entered corrections.":"Everything in this period currently comes from synced source data."}/>}
  </Card>;
}

function RevenueClientTable({data}:{data:CompanyDataset}) {
  const clients=(data.commercialClients??[]).filter(client=>client.commercialStatus==="CLIENT_WON").sort((a,b)=>b.projectValueTotal-a.projectValueTotal||b.paidTotal-a.paidTotal);
  if(!clients.length) return <EmptyState title="No commercial clients" body="ROBAWS CLIENT_WON rows appear here after commercial sync."/>;
  return <div className="table-scroll"><table><thead><tr><th>Client</th><th>Reporting source</th><th>CRM link</th><th>Match</th><th>Accepted offer €</th><th>Project €</th><th>Invoiced €</th><th>Paid value €</th><th>Acquisition month</th></tr></thead><tbody>
    {clients.map(client=>{
      const lead=client.matchedLeadId?data.leads.find(item=>item.id===client.matchedLeadId):undefined;
      const source=manualRobawsSource(data,client)??lead?.source??"Unknown";
      const leadDate=lead?.date?.slice(0,10)??"";
      const clientDate=client.clientSince?.slice(0,10)??"";
      const trustedMonth=Boolean(leadDate&&(!clientDate||clientDate>=leadDate));
      return <tr key={client.id}><td className="font-semibold">{client.name}</td><td>{source}</td><td>{lead?<StatusPill tone="good">CRM linked</StatusPill>:<StatusPill tone="neutral">No CRM lead</StatusPill>}</td><td>{client.matchMethod||"NONE"}</td><td>{formatCurrency(client.acceptedOfferTotal)}</td><td>{formatCurrency(client.projectValueTotal)}</td><td>{formatCurrency(client.invoicedTotal)}</td><td className="font-semibold">{formatCurrency(client.paidTotal)}</td><td>{trustedMonth?<StatusPill tone="good">{leadDate.slice(0,7)}</StatusPill>:<StatusPill tone="warn">Month unverified</StatusPill>}</td></tr>;
    })}
  </tbody></table></div>;
}

function hasAppointmentEvidence(row:JourneyRow){
  const status=normalized(row.lead.crmStatus);
  const stage=normalized(row.lead.stage);
  return row.appointments.length>0||stage.includes("visit booked")||status==="afspraak ingeboekt";
}
function decisionSource(source:string){ return normalizeAcquisitionSource(source); }
function costMetric(spend:number|null,count:number){return spend===null||count===0?"—":formatCurrency(spend/count)}
function ratioMetric(value:number,spend:number|null){return spend===null||spend===0?"—":formatNumber(value/spend)+"×"}
function normalized(value:string){return value.trim().toLowerCase().replace(/\s+/g," ")}
function hasDateConflict(value:string|null|undefined){return String(value??"").toUpperCase().includes("DATE_CONFLICT")}
function sum(values:number[]){return values.reduce((total,value)=>total+Number(value||0),0)}
function formatTimestamp(value:string|null){if(!value)return "—";return new Intl.DateTimeFormat("nl-BE",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",timeZone:"Europe/Brussels"}).format(new Date(value))}
function Leak({label,value}:{label:string;value:number}){return <div className="bg-white p-4"><span className="text-xs text-[var(--muted)]">{label}</span><strong className="mt-2 block text-xl">{formatNumber(value)}</strong></div>}
function RevenueStage({label,value,note,onClick}:{label:string;value:number;note:string;onClick?:()=>void}){const content=<><span>{label}</span><strong className={onClick?"drillable-value":""}>{formatCurrency(value,true)}</strong><small>{note}</small></>;return onClick?<button type="button" className="revenue-stage drillable text-left" onClick={onClick}>{content}</button>:<div className="revenue-stage">{content}</div>}
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
