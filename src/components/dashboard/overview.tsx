"use client";

import Link from "next/link";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, CheckCircle2, CircleDollarSign, Clock3, Database, Minus, ReceiptText, TrendingDown, TrendingUp, WalletCards } from "lucide-react";
import type { CompanyDataset } from "@/lib/data/types";
import { buildFunnelSummary, buildJourneyRows, hasOfferSentEvidence, type JourneyRow } from "@/lib/metrics/client-funnel";
import { formatCurrency, formatNumber, formatPercent, percentage, safeDivide } from "@/lib/metrics/kpis";
import { sourceBusinessRows, type SourceBusinessRow } from "./control-pages";
import { Card, SectionHeader, StatusPill } from "./ui";
import { SystemPulse } from "./system-pulse";
import { MoneyTrendChart } from "./charts";
import { RecordDrilldownDrawer, type RecordDrilldown } from "./record-drilldown";

export function OverviewPage({data}:{data:CompanyDataset}) {
  const searchParams=useSearchParams();
  const month=searchParams.get("month");
  const scopedHref=(href:string)=>month?`${href}?month=${encodeURIComponent(month)}`:href;
  const rows=buildJourneyRows(data);
  const summary=buildFunnelSummary(data);
  const [drilldown,setDrilldown]=useState<RecordDrilldown|null>(null);
  const periodProjects=data.periodCommercialProjects??[];
  const periodInvoices=data.periodCommercialInvoices??[];
  const sources=sourceBusinessRows(data,rows);
  const paidSources=sources.filter(row=>["Meta Ads / Facebook","Google Ads","LeadAngel","AgenciYou"].includes(row.source));
  const googleAdsIntegration=data.integrations.find(item=>item.provider==="google_ads");
  const googleBusinessIntegration=data.integrations.find(item=>item.provider==="google_business");
  const metaIntegration=data.integrations.find(item=>item.provider==="meta");
  const websiteFormsIntegration=data.integrations.find(item=>item.provider==="website_forms");
  const metaLeadAccessReady=!metaIntegration?.metaMissingPermissions?.includes("leads_retrieval");
  const leadDateCounts=new Map<string,number>();
  for(const lead of data.leads){const date=lead.date.slice(0,10);leadDateCounts.set(date,(leadDateCounts.get(date)??0)+1);}
  const peakLeadDate=([...leadDateCounts.entries()].sort((a,b)=>b[1]-a[1])[0]??["",0]) as [string,number];
  const suspiciousLeadDateBatch=data.leads.length>=20&&peakLeadDate[1]>=20&&peakLeadDate[1]/data.leads.length>=0.25;
  const offers=(data.commercialOffers??[]).filter(item=>!hasDateConflict(item.attributionStatus));
  const projects=(data.commercialProjects??[]).filter(item=>!hasDateConflict(item.attributionStatus));
  const invoices=(data.commercialInvoices??[]).filter(item=>!hasDateConflict(item.attributionStatus));
  const sentOffers=offers.filter(hasOfferSentEvidence);
  const openOffers=sentOffers.filter(item=>item.isOpen);
  const acceptedOffers=offers.filter(item=>item.isAccepted);
  const paid=invoices.reduce((sum,item)=>sum+item.paidTotal,0);
  const invoiced=invoices.reduce((sum,item)=>sum+Math.max(0,item.totalInclVat-item.creditedTotal),0);
  const projectValue=projects.reduce((sum,item)=>sum+Number(item.valueInclVat??0),0);
  const openValue=openOffers.reduce((sum,item)=>sum+item.priceInclVat,0);
  const acceptedValue=acceptedOffers.reduce((sum,item)=>sum+item.priceInclVat,0);
  const knownSpendRows=paidSources.filter(row=>row.spend!==null);
  const coveredSpend=knownSpendRows.reduce((sum,row)=>sum+Number(row.spend??0),0);
  const coveredLeads=knownSpendRows.reduce((sum,row)=>sum+row.leads,0);
  const coveredQualified=knownSpendRows.reduce((sum,row)=>sum+row.qualified,0);
  const coveredVisits=knownSpendRows.reduce((sum,row)=>sum+row.visits,0);
  const coveredOffers=knownSpendRows.reduce((sum,row)=>sum+row.offers,0);
  const coveredClients=knownSpendRows.reduce((sum,row)=>sum+row.attributedClients,0);
  const coveredPaid=knownSpendRows.reduce((sum,row)=>sum+row.paid,0);

  const robawsClientRecords=data.commercialClients??[];
  const robawsWonRecords=robawsClientRecords.filter(client=>client.commercialStatus==="CLIENT_WON");
  const robawsMatchedWonRecords=robawsWonRecords.filter(client=>Boolean(client.matchedLeadId));
  const rowByLeadId=new Map<string,JourneyRow>();
  rows.forEach(row=>row.leadIds.forEach(id=>rowByLeadId.set(id,row)));
  const cohortCommercialClients=(data.commercialClients??[]).filter(client=>
    client.commercialStatus==="CLIENT_WON"
    && Boolean(client.matchedLeadId&&rowByLeadId.has(client.matchedLeadId))
  );
  const sourceOverrides=(data.manualOverrides??[]).filter(item=>item.scopeType==="client"&&item.fieldKey==="source"&&typeof item.value==="string");
  const overrideSource=(client:NonNullable<CompanyDataset["commercialClients"]>[number])=>{
    const keys=[`robaws:${client.externalId}`,client.id,client.matchedLeadId??""].filter(Boolean);
    const matches=sourceOverrides.filter(item=>keys.includes(item.scopeKey));
    const preferred=matches.find(item=>item.periodKey===data.periodKey)??matches.find(item=>item.periodKey==="all")??matches[0];
    return typeof preferred?.value==="string"&&preferred.value.trim()?preferred.value.trim():null;
  };
  const manualSourceWonRecords=robawsWonRecords.filter(client=>Boolean(overrideSource(client)));
  const manualSourceUnmatchedWonRecords=manualSourceWonRecords.filter(client=>!client.matchedLeadId);
  const sourceResolvedWonRecords=robawsWonRecords.filter(client=>Boolean(client.matchedLeadId)||Boolean(overrideSource(client)));
  const sourceEvidence=cohortCommercialClients.map(client=>{
    const row=client.matchedLeadId?rowByLeadId.get(client.matchedLeadId):undefined;
    const manual=overrideSource(client);
    const source=manual??row?.lead.source?.trim()??"";
    const safe=Boolean(manual)||Boolean(row?.isAttributableClient);
    return {client,source,safe,manual:Boolean(manual)};
  });
  const knownSourceClients=sourceEvidence.filter(item=>item.safe&&item.source);
  const paidMarketingClients=knownSourceClients.filter(item=>isPaidMarketingSource(item.source));
  const unknownSourceClients=cohortCommercialClients.length-knownSourceClients.length;
  const cohortPaid=cohortCommercialClients.reduce((sum,client)=>sum+client.paidTotal,0);
  const knownSourcePaid=knownSourceClients.reduce((sum,item)=>sum+item.client.paidTotal,0);
  const paidMarketingPaid=paidMarketingClients.reduce((sum,item)=>sum+item.client.paidTotal,0);
  const sourceCoverage=percentage(knownSourceClients.length,cohortCommercialClients.length)??0;
  const paidCashSourceCoverage=percentage(knownSourcePaid,cohortPaid)??0;

  const decision=data.businessDecision;
  const periodTotals=decision?.current??null;
  const directComparison=decision?.comparison??null;
  const directComparisonHasData=Boolean(directComparison && (directComparison.spend>0||directComparison.invoiced>0||directComparison.paid>0||directComparison.leads>0));
  const completeActiveMonths=(decision?.monthly??[]).filter(item=>item.complete&&(item.spend>0||item.invoiced>0||item.paid>0||item.leads>0));
  const latestComplete=completeActiveMonths.at(-1)??null;
  const previousComplete=completeActiveMonths.at(-2)??null;
  const momentumCurrent=directComparisonHasData&&periodTotals ? periodTotals : latestComplete;
  const momentumPrevious=directComparisonHasData ? directComparison : previousComplete;
  const momentumLabel=directComparisonHasData
    ? `${periodTotals?.label??"Selected period"} vs ${directComparison?.label??"previous period"}`
    : latestComplete&&previousComplete
      ? `${latestComplete.label} vs ${previousComplete.label}`
      : "No reliable comparison period";
  const momentum=buildMomentum(momentumCurrent,momentumPrevious,momentumLabel);

  const selectedFrom=periodTotals?.fromDate??data.periodLabel.split(" — ")[0]??"";
  const selectedTo=periodTotals?.toDate??data.periodLabel.split(" — ")[1]??"";
  const periodCommercialRecords=(data.commercialClients??[]).filter(client=>{
    const date=client.clientSince?.slice(0,10);
    return Boolean(date&&date>=selectedFrom&&date<=selectedTo);
  });
  const periodClientWonRecords=periodCommercialRecords.filter(client=>client.commercialStatus==="CLIENT_WON");
  const selectedSourceEvidence=periodClientWonRecords.map(client=>{
    const row=client.matchedLeadId?rowByLeadId.get(client.matchedLeadId):undefined;
    const manual=overrideSource(client);
    const source=manual??row?.lead.source?.trim()??"";
    const safe=Boolean(manual)||Boolean(row?.isAttributableClient);
    return {client,source,safe,manual:Boolean(manual)};
  }).filter(item=>item.safe&&item.source);
  const sourceOutcomeMap=new Map<string,{source:string;clients:number;paid:number;invoiced:number;projectValue:number;spend:number|null;openValue:number}>();
  for(const item of selectedSourceEvidence){
    const source=decisionSourceName(item.source);
    const current=sourceOutcomeMap.get(source)??{source,clients:0,paid:0,invoiced:0,projectValue:0,spend:null,openValue:0};
    current.clients+=1;
    current.paid+=item.client.paidTotal;
    current.invoiced+=item.client.invoicedTotal;
    current.projectValue+=item.client.projectValueTotal||item.client.acceptedOfferTotal;
    sourceOutcomeMap.set(source,current);
  }
  for(const row of sources){
    const source=decisionSourceName(row.source);
    const current=sourceOutcomeMap.get(source)??{source,clients:0,paid:0,invoiced:0,projectValue:0,spend:null,openValue:0};
    if(row.spend!==null) current.spend=(current.spend??0)+row.spend;
    current.openValue+=row.openValue;
    sourceOutcomeMap.set(source,current);
  }
  const sourceOutcomes=[...sourceOutcomeMap.values()]
    .filter(row=>row.clients>0||(row.spend??0)>0||row.openValue>0||row.projectValue>0)
    .map(row=>({...row,verdict:sourceVerdict(row)}))
    .sort((a,b)=>b.paid-a.paid||b.projectValue-a.projectValue||b.clients-a.clients||(b.spend??0)-(a.spend??0));
  const unknownSelectedClients=periodClientWonRecords.filter(client=>{
    const row=client.matchedLeadId?rowByLeadId.get(client.matchedLeadId):undefined;
    return !overrideSource(client)&&!row?.isAttributableClient;
  });
  const unknownSelectedPaid=unknownSelectedClients.reduce((sum,client)=>sum+client.paidTotal,0);

  const funnelNumbers=[
    {label:"Unique leads",value:summary.uniquePeople},
    {label:"Qualified",value:summary.qualified},
    {label:"Visits",value:rows.filter(hasCompletedVisitEvidence).length},
    {label:"Offers sent",value:summary.offersSent},
    {label:"Signed now",value:summary.crmSigned},
    {label:"ROBAWS confirmed",value:summary.commercialClients},
  ];
  const funnelLeaks=funnelNumbers.slice(0,-1).map((item,index)=>{
    const next=funnelNumbers[index+1];
    const loss=Math.max(0,item.value-next.value);
    return {from:item.label,to:next.label,loss,rate:item.value?loss/item.value*100:0};
  }).sort((a,b)=>b.rate-a.rate);
  const biggestLeak=funnelLeaks[0]??null;
  const staleOffers=openOffers.filter(item=>(item.daysWaiting??0)>7);
  const staleValue=staleOffers.reduce((sum,item)=>sum+item.priceInclVat,0);
  const noReturnSpend=sourceOutcomes.filter(item=>(item.spend??0)>0&&item.paid===0).reduce((sum,item)=>sum+Number(item.spend??0),0);

  const stageDrilldowns:Record<string,()=>RecordDrilldown>={
    "Unique leads":()=>({title:"Unique leads",subtitle:data.periodLabel,leads:rows.map(row=>row.lead)}),
    "Qualified":()=>({title:"Qualified leads",subtitle:data.periodLabel,leads:rows.filter(row=>row.isQualified).map(row=>row.lead)}),
    "Visits":()=>{const visitRows=rows.filter(hasCompletedVisitEvidence);const ids=new Set(visitRows.flatMap(row=>row.leadIds));return{title:"Visited leads",subtitle:data.periodLabel,leads:visitRows.map(row=>row.lead),appointments:(data.commercialAppointments??[]).filter(item=>ids.has(item.leadId))}},
    "Offers sent":()=>({title:"Offers sent",subtitle:data.periodLabel,leads:rows.filter(row=>row.offers.some(hasOfferSentEvidence)).map(row=>row.lead),offers:sentOffers}),
    "Signed now":()=>({title:"Signed CRM leads",subtitle:data.periodLabel,leads:rows.filter(row=>row.isSigned).map(row=>row.lead)}),
    "ROBAWS-confirmed":()=>({title:"ROBAWS-confirmed clients",subtitle:data.periodLabel,clients:cohortCommercialClients}),
    "Cohort paid cash":()=>({title:"Clients behind cohort paid cash",subtitle:"Lifetime cash for clients acquired in "+data.periodLabel,clients:cohortCommercialClients}),
  };
  const stages=[
    {label:"Unique leads",value:formatNumber(summary.uniquePeople),note:formatNumber(data.metrics.leads)+" CRM rows · all sources"},
    {label:"Qualified",value:formatNumber(summary.qualified),note:formatPercent(percentage(summary.qualified,summary.uniquePeople))+" of unique people"},
    {label:"Visits",value:formatNumber(rows.filter(hasCompletedVisitEvidence).length),note:"Completed / post-visit evidence"},
    {label:"Offers sent",value:formatNumber(summary.offersSent),note:formatCurrency(summary.sentQuotedValue,true)+" sent value"},
    {label:"Signed now",value:formatNumber(summary.crmSigned),note:"Current Monday status of leads created in this period"},
    {label:"ROBAWS-confirmed",value:formatNumber(summary.commercialClients),note:formatNumber(knownSourceClients.length)+" have a safe acquisition source"},
    {label:"Cohort paid cash",value:formatCurrency(cohortPaid,true),note:"Lifetime paid cash on ROBAWS-confirmed leads from this cohort"},
  ];

  const actionItems=buildActionItems(data,rows,openOffers,paidSources);
  const budgetCards=paidSources.map(source=>budgetConclusion(source));

  return <div className="space-y-6">
    <DecisionHero momentum={momentum} periodLabel={periodTotals?.label??data.periodLabel}/>

    <div className="cohort-scope-note">
      <Clock3 size={17}/>
      <div><strong>How to read this period</strong><p>Leads are selected by their creation date ({selectedFrom} — {selectedTo}). “Signed now” and “ROBAWS-confirmed” show the current outcome of that cohort. Calendar-month sales below use ROBAWS project won dates instead of assuming a Monday status change is the contract date.</p></div>
    </div>

    {periodTotals&&<div className="decision-money-grid">
      <DecisionMoneyCard icon="spend" label="Tracked marketing spend" value={periodTotals.spend} comparison={directComparisonHasData?directComparison?.spend:null} note="Media/platform spend currently available in the dashboard"/>
      <DecisionMoneyCard icon="invoice" label="Won project value" value={periodTotals.wonProjectValue} comparison={directComparisonHasData?directComparison?.wonProjectValue:null} note={periodTotals.wonProjects+" ROBAWS project(s) won inside the selected period"} onClick={()=>setDrilldown({title:"Won projects",subtitle:data.periodLabel,projects:periodProjects})}/>
      <DecisionMoneyCard icon="invoice" label="Invoiced this period" value={periodTotals.invoiced} comparison={directComparisonHasData?directComparison?.invoiced:null} note="ROBAWS invoices dated inside the selected period" onClick={()=>setDrilldown({title:"Invoices in selected period",subtitle:data.periodLabel,invoices:periodInvoices})}/>
      <DecisionMoneyCard icon="paid" label="Paid cash this period" value={periodTotals.paid} comparison={directComparisonHasData?directComparison?.paid:null} note="Cash recorded against ROBAWS invoices in this period" onClick={()=>setDrilldown({title:"Invoices with paid cash",subtitle:data.periodLabel,invoices:periodInvoices.filter(item=>item.paidTotal>0)})}/>
      <DecisionMoneyCard icon="return" label="Cash after tracked spend" value={periodTotals.paid-periodTotals.spend} comparison={directComparisonHasData&&directComparison?directComparison.paid-directComparison.spend:null} note="Paid cash minus tracked media spend — not company profit" accent onClick={()=>setDrilldown({title:"Cash records behind this period",subtitle:data.periodLabel,invoices:periodInvoices.filter(item=>item.paidTotal>0)})}/>
    </div>}

    <div className="decision-grid">
      <Card className="p-5">
        <SectionHeader title="Are we moving in the right direction?" description={momentum.context}/>
        <MoneyTrendChart data={(decision?.monthly??[]).map(item=>({label:item.label,paid:item.paid,spend:item.spend,complete:item.complete}))}/>
        <div className="decision-chart-legend"><span><i className="legend-paid"/> Paid cash</span><span><i className="legend-spend"/> Tracked marketing spend</span></div>
      </Card>

      <Card className="p-5">
        <SectionHeader title="Where the money comes from" description="Acquisition cohort for leads created in the selected period. Client cash is lifetime cash from that cohort; spend is tracked acquisition-period spend."/>
        <div className="source-decision-list">
          {sourceOutcomes.map(row=><SourceDecisionRow key={row.source} {...row} onClick={()=>{const key=decisionSourceName(row.source);const sourceClients=selectedSourceEvidence.filter(item=>decisionSourceName(item.source)===key).map(item=>item.client);const leadIds=new Set(sourceClients.flatMap(client=>client.matchedLeadId?[client.matchedLeadId]:[]));const sourceRows=rows.filter(item=>decisionSourceName(item.lead.source)===key||item.leadIds.some(id=>leadIds.has(id)));setDrilldown({title:key+" details",subtitle:data.periodLabel,leads:sourceRows.map(item=>item.lead),clients:sourceClients,offers:offers.filter(item=>decisionSourceName(item.source)===key),projects:periodProjects.filter(item=>decisionSourceName(item.source)===key),invoices:periodInvoices.filter(item=>decisionSourceName(item.source)===key)})}}/>)}
          {!sourceOutcomes.length&&<p className="decision-empty">No safely attributed source outcome is available for this period yet.</p>}
        </div>
        {unknownSelectedClients.length>0&&<div className="unknown-attribution-note"><AlertTriangle size={16}/><div><strong>{unknownSelectedClients.length} client(s) still have no safe source</strong><p>{formatCurrency(unknownSelectedPaid)} paid cash from those clients cannot yet be assigned to a marketing source.</p></div></div>}
      </Card>
    </div>

    <Card className="p-5">
      <SectionHeader title="Where are we losing momentum?" description="This separates funnel leakage, stale commercial value and paid spend with no collected return yet."/>
      <div className="loss-signal-grid">
        <LossSignal icon="funnel" label="Biggest funnel drop" value={biggestLeak?formatPercent(biggestLeak.rate):"—"} detail={biggestLeak?`${biggestLeak.loss} people drop between ${biggestLeak.from} and ${biggestLeak.to}`:"Not enough funnel evidence"}/>
        <LossSignal icon="pipeline" label="Open value older than 7 days" value={formatCurrency(staleValue,true)} detail={staleOffers.length+` offer(s) need follow-up`}/>
        <LossSignal icon="spend" label="Spend with no paid return yet" value={formatCurrency(noReturnSpend,true)} detail="Not automatically a loss — pipeline may still convert"/>
      </div>
    </Card>

    <Card className="overflow-hidden">
      <div className="border-b border-[var(--line)] p-5">
        <SectionHeader title="Acquisition funnel — all CRM sources" description="Leads are grouped by creation date in the selected period. Later stages show their current outcome, not the date each stage happened."/>
      </div>
      <div className="story-chain">
        {stages.map((stage,index)=><button type="button" className="story-stage drillable text-left" key={stage.label} onClick={()=>setDrilldown(stageDrilldowns[stage.label]())}><div className="flex items-center justify-between gap-2"><span>{stage.label}</span>{index<stages.length-1&&<ArrowRight size={14}/>}</div><strong className="drillable-value">{stage.value}</strong><small>{stage.note}</small></button>)}
      </div>
    </Card>

    <Card className="overflow-hidden">
      <div className="border-b border-[var(--line)] p-5">
        <SectionHeader title="Can I trust these numbers?" description="Calendar-period business activity and selected lead-cohort attribution are shown separately. Source attribution does not imply an exact campaign."/>
      </div>
      <div className="grid gap-px bg-[var(--line)] xl:grid-cols-3">
        <div className="bg-white p-5">
          <div className="flex items-center justify-between gap-3"><div><p className="eyebrow">CALENDAR PERIOD · ROBAWS</p><h3 className="mt-1 text-lg font-semibold">What happened during this period</h3></div><StatusPill tone="good">Source of truth</StatusPill></div>
          <div className="mt-4 grid grid-cols-3 gap-px bg-[var(--line)]">
            <TruthMetric label="Projects won" value={formatNumber(periodTotals?.wonProjects??0)}/>
            <TruthMetric label="Invoiced in period" value={formatCurrency(periodTotals?.invoiced??0)}/>
            <TruthMetric label="Paid in period" value={formatCurrency(periodTotals?.paid??0)}/>
          </div>
          <p className="mt-3 text-xs leading-5 text-[var(--muted)]">{formatCurrency(periodTotals?.wonProjectValue??0)} of ROBAWS project value was won in this period. {formatNumber(periodCommercialRecords.length)} client record(s) have client_since in the period; {formatNumber(periodClientWonRecords.length)} of those are currently CLIENT_WON.</p>
        </div>
        <div className="bg-white p-5">
          <div className="flex items-center justify-between gap-3"><div><p className="eyebrow">ACQUISITION COHORT</p><h3 className="mt-1 text-lg font-semibold">Current clients from leads created in this period</h3></div><StatusPill tone={unknownSourceClients===0?"good":"warn"}>{formatPercent(sourceCoverage)} source covered</StatusPill></div>
          <div className="mt-4 grid grid-cols-3 gap-px bg-[var(--line)]">
            <TruthMetric label="Known source" value={formatNumber(knownSourceClients.length)}/>
            <TruthMetric label="Known-source paid" value={formatCurrency(knownSourcePaid)}/>
            <TruthMetric label="Unknown source" value={formatNumber(unknownSourceClients)}/>
          </div>
          <p className="mt-3 text-xs leading-5 text-[var(--muted)]">{formatNumber(cohortCommercialClients.length)} leads from this acquisition cohort are currently ROBAWS-confirmed. Paid amounts are lifetime client cash, not cash collected only in the selected month.</p>
        </div>
        <div className="bg-white p-5">
          <div className="flex items-center justify-between gap-3"><div><p className="eyebrow">PAID MARKETING EVIDENCE</p><h3 className="mt-1 text-lg font-semibold">Only paid acquisition sources</h3></div><StatusPill tone="warn">Partial attribution</StatusPill></div>
          <div className="mt-4 grid grid-cols-3 gap-px bg-[var(--line)]">
            <TruthMetric label="Paid-source clients" value={formatNumber(paidMarketingClients.length)}/>
            <TruthMetric label="Paid-source paid" value={formatCurrency(paidMarketingPaid)}/>
            <TruthMetric label="Known spend" value={formatCurrency(coveredSpend)}/>
          </div>
          <p className="mt-3 text-xs leading-5 text-[var(--muted)]">Meta/Facebook, Google Ads, LeadAngel and AgenciYou are treated as paid acquisition. Missing source cost remains missing; it is never converted to €0.</p>
        </div>
      </div>
    </Card>

    <Card className="p-5">
      <SectionHeader title="Economics with complete cost coverage" description="Cost KPIs include only sources whose spend is actually available; missing spend never becomes €0."/>
      <div className="economics-grid">
        <Economy label="Covered spend" value={formatCurrency(coveredSpend)} note={knownSpendRows.map(row=>row.source).join(", ")||"No paid source fully covered"}/>
        <Economy label="CPL" value={formatCurrency(safeDivide(coveredSpend,coveredLeads))} note={coveredLeads+" covered leads"}/>
        <Economy label="Cost / qualified" value={formatCurrency(safeDivide(coveredSpend,coveredQualified))} note={coveredQualified+" qualified"}/>
        <Economy label="Cost / visit" value={formatCurrency(safeDivide(coveredSpend,coveredVisits))} note={coveredVisits+" visits"}/>
        <Economy label="Cost / offer" value={formatCurrency(safeDivide(coveredSpend,coveredOffers))} note={coveredOffers+" sent offers"}/>
        <Economy label="CAC" value={formatCurrency(safeDivide(coveredSpend,coveredClients))} note={coveredClients+" attributable clients"}/>
        <Economy label="Paid ROAS" value={coveredSpend?formatNumber(coveredPaid/coveredSpend)+"×":"—"} note={formatCurrency(coveredPaid)+" paid cash"}/>
      </div>
    </Card>

    <div className="grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
      <Card className="p-5">
        <SectionHeader title="What requires action?" description="The dashboard states the issue; management should not have to calculate it manually."/>
        <div className="space-y-3">
          {actionItems.length?actionItems.map(item=><ActionItem key={item.title} {...item} href={scopedHref(item.href)}/>):<div className="flex items-center gap-3 border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"><CheckCircle2 size={18}/><strong>No critical action rule is triggered by the current evidence.</strong></div>}
        </div>
      </Card>

      <Card className="p-5">
        <SectionHeader title="CRM-linked revenue stages" description="These stages use CRM-linked commercial evidence only. They are not the total business revenue and not automatically paid-marketing attribution."/>
        <div className="space-y-1">
          <MoneyRow label="Total offered" value={sentOffers.reduce((sum,item)=>sum+item.priceInclVat,0)}/>
          <MoneyRow label="Open pipeline" value={openValue}/>
          <MoneyRow label="Accepted / contracted" value={acceptedValue}/>
          <MoneyRow label="Project value" value={projectValue}/>
          <MoneyRow label="Linked invoice rows" value={invoiced}/>
          <MoneyRow label="CRM-linked paid" value={paid} accent/>
        </div>
        <Link href={scopedHref("/revenue")} className="mt-4 inline-flex items-center gap-2 text-sm font-semibold underline underline-offset-4">Open revenue evidence <ArrowRight size={14}/></Link>
      </Card>
    </div>

    <Card className="p-5">
      <SectionHeader title="Budget conclusions" description="These rules use client and cash evidence, not lead volume or CTR alone."/>
      <div className="grid gap-4 lg:grid-cols-3">
        {budgetCards.map(card=><BudgetCard key={card.source} {...card}/>)}
      </div>
      <Link href={scopedHref("/campaigns")} className="mt-5 inline-flex items-center gap-2 text-sm font-semibold underline underline-offset-4">Open full source & campaign economics <ArrowRight size={14}/></Link>
    </Card>

    <SystemPulse data={data}/>

    <Card className="p-5">
      <SectionHeader title="Data trust" description="Performance conclusions are separated from data-quality blockers."/>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <Trust label="Google Ads sync" ok={Boolean(googleAdsIntegration?.lastSuccess)} detail={googleAdsIntegration?.lastSuccess?"Live data has synced":"OAuth is connected, but no Google Ads customer has completed a sync"}/>
        <Trust label="Google Business sync" ok={Boolean(googleBusinessIntegration?.lastSuccess)} detail={googleBusinessIntegration?.lastSuccess?"Live data has synced":"Connected account, but no Business Profile location has completed a sync"}/>
        <Trust label="Meta Lead Ads attribution" ok={metaLeadAccessReady} detail={metaLeadAccessReady?"Lead retrieval permission available":"Missing leads_retrieval permission — direct Meta lead matching is incomplete"}/>
        <Trust label="Website lead capture" ok={websiteFormsIntegration?.status==="Connected"&&Boolean(websiteFormsIntegration.lastSuccess)} detail={websiteFormsIntegration?.lastSuccess?"Website form source is syncing":"Website forms are not connected; GA4 currently shows visits but no tracked form submissions"}/>
        <Trust label="ROBAWS client coverage" ok={sourceResolvedWonRecords.length===robawsWonRecords.length} detail={robawsMatchedWonRecords.length+" / "+robawsWonRecords.length+" won clients are CRM-matched; "+manualSourceUnmatchedWonRecords.length+" unmatched client(s) have a manual source; "+(robawsWonRecords.length-sourceResolvedWonRecords.length)+" remain neither matched nor manually sourced"}/>
        <Trust label="Lead-date quality" ok={!suspiciousLeadDateBatch} detail={suspiciousLeadDateBatch?peakLeadDate[1]+" / "+data.leads.length+" selected leads share "+peakLeadDate[0]+" — verify bulk-import dates before treating this as a true acquisition cohort":"No extreme single-day concentration in the selected lead dates"}/>
        <Trust label="LeadAngel cost" ok={!paidSources.some(row=>row.source==="LeadAngel"&&row.costState==="missing")} detail={paidSources.some(row=>row.source==="LeadAngel"&&row.costState==="missing")?"Missing — ROI blocked":"Available or no LeadAngel cohort"}/>
        <Trust label="Source coverage" ok={unknownSourceClients===0} detail={knownSourceClients.length+" / "+cohortCommercialClients.length+" commercial clients have a safe acquisition source"}/>
        <Trust label="Paid-cash source coverage" ok={paidCashSourceCoverage>=90} detail={formatPercent(paidCashSourceCoverage)+" of ROBAWS paid cash has a known acquisition source"}/>
        <Trust label="Potential duplicates" ok={data.dataHealth.duplicates===0} detail={data.dataHealth.duplicates+" flagged"}/>
        <Trust label="Signed reconciliation" ok={rows.filter(row=>row.isSigned&&!row.isCommercialClient).length===0} detail={rows.filter(row=>row.isSigned&&!row.isCommercialClient).length+" signed not ROBAWS-confirmed"}/>
      </div>
      <Link href={scopedHref("/data-health")} className="mt-5 inline-flex items-center gap-2 text-sm font-semibold underline underline-offset-4">Open data health <ArrowRight size={14}/></Link>
    </Card>
  </div>;
}

type MomentumMetric = { label?:string; spend:number; invoiced:number; paid:number; leads:number } | null | undefined;

function buildMomentum(current:MomentumMetric,previous:MomentumMetric,context:string){
  if(!current||!previous)return{tone:"neutral" as const,title:"Not enough history yet",summary:"The dashboard can show the current period, but there is not enough comparable history to call a trend.",context};
  const paidChange=relativeChange(current.paid,previous.paid);
  const leadChange=relativeChange(current.leads,previous.leads);
  const spendChange=relativeChange(current.spend,previous.spend);
  if(previous.paid===0&&current.paid>0){
    return{tone:"good" as const,title:"Business momentum is improving",summary:`Paid cash moved from €0 to ${formatCurrency(current.paid,true)}. Tracked spend is ${formatCurrency(current.spend,true)} for the comparison period.`,context};
  }
  if(paidChange!==null&&paidChange>=10&&leadChange!==null&&leadChange>=-10){
    return{tone:"good" as const,title:"Growth signal is positive",summary:`Paid cash is up ${formatPercent(paidChange)} while leads are ${changeWords(leadChange)}. Tracked spend is ${changeWords(spendChange)}.`,context};
  }
  if(paidChange!==null&&paidChange>=10){
    return{tone:"warn" as const,title:"Cash is up, but demand needs watching",summary:`Paid cash is up ${formatPercent(paidChange)}, but leads are ${changeWords(leadChange)}. Check whether growth is coming from older pipeline rather than new demand.`,context};
  }
  if(paidChange!==null&&paidChange<=-10&&leadChange!==null&&leadChange>10){
    return{tone:"warn" as const,title:"Demand is up, cash is down",summary:`Leads are up ${formatPercent(leadChange)}, but paid cash is down ${formatPercent(Math.abs(paidChange))}. The issue is likely later in the funnel or invoice timing.`,context};
  }
  if(paidChange!==null&&paidChange<=-10){
    return{tone:"bad" as const,title:"Business momentum is down",summary:`Paid cash is down ${formatPercent(Math.abs(paidChange))}. Leads are ${changeWords(leadChange)} and tracked spend is ${changeWords(spendChange)}.`,context};
  }
  return{tone:"neutral" as const,title:"Business momentum is broadly stable",summary:`Paid cash is ${changeWords(paidChange)}. Leads are ${changeWords(leadChange)} and tracked spend is ${changeWords(spendChange)}.`,context};
}

function relativeChange(current:number,previous:number){
  if(previous===0)return current===0?0:null;
  return (current-previous)/previous*100;
}
function changeWords(value:number|null){
  if(value===null)return"not comparable";
  if(Math.abs(value)<2)return"roughly flat";
  return value>0?`up ${formatPercent(value)}`:`down ${formatPercent(Math.abs(value))}`;
}

function decisionSourceName(source:string){
  const value=source.trim().toLowerCase();
  if(value.includes("facebook")||value.includes("meta")||value.includes("instagram"))return"Meta Ads / Facebook";
  if(value==="google ads"||value.includes("google ad"))return"Google Ads";
  if(value==="leadangel")return"LeadAngel";
  if(value==="agenciyou")return"AgenciYou";
  if(value==="web"||value.includes("website"))return"Web";
  return source.trim()||"Unknown";
}

function sourceVerdict(row:{clients:number;paid:number;spend:number|null;openValue:number}){
  if(row.spend===null)return{tone:"neutral" as const,label:"Cost missing"};
  if(row.paid>0&&row.spend>0&&row.paid/row.spend>=3)return{tone:"good" as const,label:"Working"};
  if(row.paid>0)return{tone:"good" as const,label:"Producing cash"};
  if(row.openValue>0)return{tone:"warn" as const,label:"Pipeline only"};
  if(row.spend>0)return{tone:"bad" as const,label:"No paid return yet"};
  return{tone:"neutral" as const,label:"Organic / no spend"};
}

function DecisionHero({momentum,periodLabel}:{momentum:{tone:"good"|"warn"|"bad"|"neutral";title:string;summary:string;context:string};periodLabel:string}){
  const icon=momentum.tone==="good"?<TrendingUp size={22}/>:momentum.tone==="bad"?<TrendingDown size={22}/>:momentum.tone==="warn"?<AlertTriangle size={22}/>:<Minus size={22}/>;
  return <section className={`decision-hero tone-${momentum.tone}`}><div className="decision-hero-icon">{icon}</div><div className="min-w-0 flex-1"><p className="decision-kicker">Management read · {periodLabel}</p><h2>{momentum.title}</h2><p>{momentum.summary}</p><small>{momentum.context}</small></div></section>;
}

function DecisionMoneyCard({icon,label,value,comparison,note,accent=false,onClick}:{icon:"spend"|"invoice"|"paid"|"return";label:string;value:number;comparison:number|null|undefined;note:string;accent?:boolean;onClick?:()=>void}){
  const Icon=icon==="spend"?CircleDollarSign:icon==="invoice"?ReceiptText:icon==="paid"?WalletCards:TrendingUp;
  const change=comparison===null||comparison===undefined?null:relativeChange(value,comparison);
  const className=`decision-money-card ${accent?"is-accent":""} ${onClick?"drillable":""}`;
  const content=<><div className="decision-money-head"><span><Icon size={16}/>{label}</span>{change!==null&&<span className={`decision-delta ${change>=0?"is-up":"is-down"}`}>{change>=0?<ArrowUpRight size={13}/>:<ArrowDownRight size={13}/>} {formatPercent(Math.abs(change))}</span>}</div><strong className={onClick?"drillable-value":""}>{formatCurrency(value,true)}</strong><p>{note}</p></>;
  return onClick?<button type="button" className={className+" text-left"} onClick={onClick}>{content}</button>:<div className={className}>{content}</div>;
}

function SourceDecisionRow({source,clients,paid,projectValue,spend,openValue,verdict,onClick}:{source:string;clients:number;paid:number;projectValue:number;spend:number|null;openValue:number;verdict:{tone:"good"|"warn"|"bad"|"neutral";label:string};onClick?:()=>void}){
  const cashReturn=spend===null?null:paid-spend;
  return <button type="button" onClick={onClick} className="source-decision-row drillable w-full text-left"><div className="source-decision-name"><strong>{source}</strong><StatusPill tone={verdict.tone}>{verdict.label}</StatusPill><small>{clients} client(s)</small></div><div><span>Spend</span><strong>{spend===null?"—":formatCurrency(spend,true)}</strong></div><div><span>Project value</span><strong>{formatCurrency(projectValue,true)}</strong></div><div><span>Paid</span><strong>{formatCurrency(paid,true)}</strong></div><div><span>Cash after spend</span><strong className={cashReturn!==null&&cashReturn<0?"text-rose-700":""}>{cashReturn===null?"—":formatCurrency(cashReturn,true)}</strong></div><div><span>Open pipeline</span><strong>{formatCurrency(openValue,true)}</strong></div></button>;
}

function LossSignal({icon,label,value,detail}:{icon:"funnel"|"pipeline"|"spend";label:string;value:string;detail:string}){
  const Icon=icon==="funnel"?TrendingDown:icon==="pipeline"?Clock3:CircleDollarSign;
  return <div className="loss-signal"><div className="loss-icon"><Icon size={17}/></div><div><span>{label}</span><strong>{value}</strong><p>{detail}</p></div></div>;
}

function isPaidMarketingSource(source:string){
  const value=source.trim().toLowerCase();
  return value.includes("facebook")
    || value.includes("meta")
    || value.includes("instagram")
    || value==="google ads"
    || value==="leadangel"
    || value==="agenciyou";
}

function buildActionItems(data:CompanyDataset,rows:JourneyRow[],openOffers:NonNullable<CompanyDataset["commercialOffers"]>,sources:SourceBusinessRow[]) {
  const items:Array<{title:string;body:string;tone:"bad"|"warn"|"good";href:string;icon:"clock"|"data"|"money"|"trend"}>=[];
  const stale=openOffers.filter(item=>(item.daysWaiting??0)>7);
  const staleValue=stale.reduce((sum,item)=>sum+item.priceInclVat,0);
  if(stale.length)items.push({title:stale.length+" open offers are older than 7 days",body:formatCurrency(staleValue)+" of open commercial value needs review or follow-up.",tone:"bad",href:"/offers-pipeline",icon:"clock"});
  const signedUnconfirmed=rows.filter(row=>row.isSigned&&!row.isCommercialClient);
  if(signedUnconfirmed.length)items.push({title:signedUnconfirmed.length+" signed leads are not confirmed as ROBAWS clients",body:"Reconcile the CRM and ROBAWS records before judging source CAC or revenue.",tone:"warn",href:"/data-health",icon:"data"});
  const missingCost=sources.filter(row=>row.costState==="missing");
  if(missingCost.length)items.push({title:"Paid-source spend is incomplete",body:missingCost.map(row=>row.source).join(", ")+" cannot be compared on CAC or ROAS yet.",tone:"warn",href:"/data-health",icon:"money"});
  const visitsNoOffer=rows.filter(row=>hasCompletedVisitEvidence(row)&&!row.offers.length&&!row.isCommercialClient);
  if(visitsNoOffer.length)items.push({title:visitsNoOffer.length+" visited leads have no ROBAWS offer linked",body:"Check quote creation / linking before assuming these opportunities were lost.",tone:"warn",href:"/funnel",icon:"trend"});
  if(data.dataHealth.missingCampaign>0)items.push({title:data.dataHealth.missingCampaign+" leads are missing campaign attribution",body:"Campaign conclusions exclude or weaken these records.",tone:"warn",href:"/data-health",icon:"data"});
  return items.slice(0,5);
}

function budgetConclusion(row:SourceBusinessRow){
  const paidRoas=row.spend&&row.spend>0?row.paid/row.spend:null;
  let action="Monitor";
  let body="There is not enough commercial evidence for a budget change.";
  let tone:"good"|"warn"|"bad"="warn";
  if(row.costState==="missing"){
    action="Fix spend tracking";
    body=`${row.leads} leads, ${row.commercialClients} ROBAWS clients and ${formatCurrency(row.paid)} paid cash are visible, but acquisition cost is missing.`;
  }else if(row.spend!==null&&row.attributedClients===0&&row.openValue>0){
    action="Hold";
    body=`${formatCurrency(row.spend)} spent. No attributable client yet, but ${formatCurrency(row.openValue)} remains in open pipeline.`;
  }else if(row.spend!==null&&row.attributedClients===0){
    action="Do not increase";
    tone="bad";
    body=`${formatCurrency(row.spend)} spent with no attributable commercial client in the selected cohort.`;
  }else if(row.spend!==null&&row.attributedClients===1&&paidRoas!==null&&paidRoas>=3){
    action="Scale cautiously";
    tone="good";
    body=`${formatCurrency(row.spend)} spend → ${formatCurrency(row.paid)} paid cash (${formatNumber(paidRoas)}×), but the result is concentrated in one attributable client.`;
  }else if(row.spend!==null&&row.attributedClients>1&&paidRoas!==null&&paidRoas>=3){
    action="Evidence supports increase";
    tone="good";
    body=`${row.attributedClients} attributable clients and ${formatNumber(paidRoas)}× paid ROAS provide broader evidence than CPL alone.`;
  }else if(row.spend!==null){
    action="Hold / improve";
    body=`${row.attributedClients} attributable clients, ${formatCurrency(row.openValue)} open pipeline and ${formatCurrency(row.paid)} paid cash from ${formatCurrency(row.spend)} spend.`;
  }
  return {source:row.source,action,body,tone};
}

function hasCompletedVisitEvidence(row:JourneyRow){
  const status=row.lead.crmStatus.trim().toLowerCase().replace(/\s+/g," ");
  const stage=row.lead.stage.trim().toLowerCase();
  return row.appointments.some(item=>Boolean(item.completedAt))||stage.includes("visit completed")||stage.includes("quote")||stage.includes("won")||["visited offerte to be done","offer sent","email offerte","signed","offerte afgekeurd"].includes(status);
}
function ActionItem({title,body,tone,href,icon}:{title:string;body:string;tone:"bad"|"warn"|"good";href:string;icon:"clock"|"data"|"money"|"trend"}){
  const Icon=icon==="clock"?Clock3:icon==="data"?Database:icon==="money"?CircleDollarSign:TrendingUp;
  const cls=tone==="bad"?"border-rose-200 bg-rose-50 text-rose-900":tone==="good"?"border-emerald-200 bg-emerald-50 text-emerald-900":"border-amber-200 bg-amber-50 text-amber-900";
  return <Link href={href} className={`flex gap-3 border p-4 ${cls}`}><Icon size={18} className="mt-0.5 shrink-0"/><div><strong className="text-sm">{title}</strong><p className="mt-1 text-sm leading-5 opacity-80">{body}</p></div><ArrowRight size={15} className="ml-auto mt-0.5 shrink-0"/></Link>;
}
function BudgetCard({source,action,body,tone}:{source:string;action:string;body:string;tone:"good"|"warn"|"bad"}){
  const cls=tone==="good"?"border-emerald-200 bg-emerald-50":tone==="bad"?"border-rose-200 bg-rose-50":"border-amber-200 bg-amber-50";
  return <div className={`border p-4 ${cls}`}><div className="flex items-start justify-between gap-3"><strong className="text-sm">{source}</strong><StatusPill tone={tone}>{action}</StatusPill></div><p className="mt-3 text-sm leading-6">{body}</p></div>;
}
function TruthMetric({label,value}:{label:string;value:string}){return <div className="bg-[var(--surface)] p-3"><span className="text-[10px] font-bold uppercase tracking-wide text-[var(--muted)]">{label}</span><strong className="mt-2 block text-lg">{value}</strong></div>}
function Economy({label,value,note}:{label:string;value:string;note:string}){return <div className="economy-cell"><span>{label}</span><strong>{value}</strong><small>{note}</small></div>}
function MoneyRow({label,value,accent=false}:{label:string;value:number;accent?:boolean}){return <div className={`money-row ${accent?"money-row-accent":""}`}><span>{label}</span><strong>{formatCurrency(value)}</strong></div>}
function Trust({label,ok,detail}:{label:string;ok:boolean;detail:string}){return <div className="trust-card"><div className="flex items-center gap-2">{ok?<CheckCircle2 size={16} className="text-emerald-700"/>:<AlertTriangle size={16} className="text-amber-700"/>}<strong>{label}</strong></div><p>{detail}</p></div>}
function hasDateConflict(value:string|null|undefined){return String(value??"").toUpperCase().includes("DATE_CONFLICT")}
