"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, ArrowRight, CheckCircle2, CircleDollarSign, Clock3, Database, TrendingUp } from "lucide-react";
import type { CompanyDataset } from "@/lib/data/types";
import { buildFunnelSummary, buildJourneyRows, type JourneyRow } from "@/lib/metrics/client-funnel";
import { formatCurrency, formatNumber, formatPercent, percentage, safeDivide } from "@/lib/metrics/kpis";
import { sourceBusinessRows, type SourceBusinessRow } from "./control-pages";
import { Card, KpiCard, SectionHeader, StatusPill } from "./ui";
import { SystemPulse } from "./system-pulse";

function delta(current:number,previous:number){return previous===0?null:((current-previous)/previous)*100}

export function OverviewPage({data}:{data:CompanyDataset}) {
  const searchParams=useSearchParams();
  const month=searchParams.get("month");
  const scopedHref=(href:string)=>month?`${href}?month=${encodeURIComponent(month)}`:href;
  const rows=buildJourneyRows(data);
  const summary=buildFunnelSummary(data);
  const sources=sourceBusinessRows(data,rows);
  const paidSources=sources.filter(row=>["Meta Ads / Facebook","Google Ads","LeadAngel","AgenciYou"].includes(row.source));
  const offers=(data.commercialOffers??[]).filter(item=>!hasDateConflict(item.attributionStatus));
  const projects=(data.commercialProjects??[]).filter(item=>!hasDateConflict(item.attributionStatus));
  const invoices=(data.commercialInvoices??[]).filter(item=>!hasDateConflict(item.attributionStatus));
  const sentOffers=offers.filter(item=>Boolean(item.sentAt));
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

  const allCommercialClients=(data.commercialClients??[]).filter(client=>client.commercialStatus==="CLIENT_WON");
  const rowByLeadId=new Map<string,JourneyRow>();
  rows.forEach(row=>row.leadIds.forEach(id=>rowByLeadId.set(id,row)));
  const sourceOverrides=(data.manualOverrides??[]).filter(item=>item.scopeType==="client"&&item.fieldKey==="source"&&typeof item.value==="string");
  const overrideSource=(client:NonNullable<CompanyDataset["commercialClients"]>[number])=>{
    const keys=[`robaws:${client.externalId}`,client.id,client.matchedLeadId??""].filter(Boolean);
    const matches=sourceOverrides.filter(item=>keys.includes(item.scopeKey));
    const preferred=matches.find(item=>item.periodKey===data.periodKey)??matches.find(item=>item.periodKey==="all")??matches[0];
    return typeof preferred?.value==="string"&&preferred.value.trim()?preferred.value.trim():null;
  };
  const sourceEvidence=allCommercialClients.map(client=>{
    const row=client.matchedLeadId?rowByLeadId.get(client.matchedLeadId):undefined;
    const manual=overrideSource(client);
    const source=manual??row?.lead.source?.trim()??"";
    const safe=Boolean(manual)||Boolean(row?.isAttributableClient);
    return {client,source,safe,manual:Boolean(manual)};
  });
  const knownSourceClients=sourceEvidence.filter(item=>item.safe&&item.source);
  const paidMarketingClients=knownSourceClients.filter(item=>isPaidMarketingSource(item.source));
  const otherKnownSourceClients=knownSourceClients.filter(item=>!isPaidMarketingSource(item.source));
  const unknownSourceClients=allCommercialClients.length-knownSourceClients.length;
  const businessInvoiced=allCommercialClients.reduce((sum,client)=>sum+client.invoicedTotal,0);
  const businessPaid=allCommercialClients.reduce((sum,client)=>sum+client.paidTotal,0);
  const knownSourceInvoiced=knownSourceClients.reduce((sum,item)=>sum+item.client.invoicedTotal,0);
  const knownSourcePaid=knownSourceClients.reduce((sum,item)=>sum+item.client.paidTotal,0);
  const paidMarketingPaid=paidMarketingClients.reduce((sum,item)=>sum+item.client.paidTotal,0);
  const sourceCoverage=percentage(knownSourceClients.length,allCommercialClients.length)??0;
  const paidCashSourceCoverage=percentage(knownSourcePaid,businessPaid)??0;

  const stages=[
    {label:"Unique leads",value:formatNumber(summary.uniquePeople),note:formatNumber(data.metrics.leads)+" CRM rows · all sources"},
    {label:"Qualified",value:formatNumber(summary.qualified),note:formatPercent(percentage(summary.qualified,summary.uniquePeople))+" of unique people"},
    {label:"Visits",value:formatNumber(rows.filter(hasCompletedVisitEvidence).length),note:"Completed / post-visit evidence"},
    {label:"Offers sent",value:formatNumber(summary.offersSent),note:formatCurrency(summary.sentQuotedValue,true)+" sent value"},
    {label:"CRM signed",value:formatNumber(summary.crmSigned),note:"Monday status"},
    {label:"Known-source clients",value:formatNumber(knownSourceClients.length),note:formatNumber(unknownSourceClients)+" ROBAWS clients still source-unknown"},
    {label:"Known-source paid",value:formatCurrency(knownSourcePaid,true),note:formatPercent(paidCashSourceCoverage)+" of ROBAWS paid cash"},
  ];

  const actionItems=buildActionItems(data,rows,openOffers,paidSources);
  const budgetCards=paidSources.map(source=>budgetConclusion(source));

  return <div className="space-y-6">
    <SystemPulse data={data}/>

    <Card className="overflow-hidden">
      <div className="border-b border-[var(--line)] p-5">
        <SectionHeader title="Can I trust these numbers?" description="ROBAWS business truth, known acquisition source and paid-marketing evidence are separate. Source attribution does not imply an exact campaign."/>
      </div>
      <div className="grid gap-px bg-[var(--line)] xl:grid-cols-3">
        <div className="bg-white p-5">
          <div className="flex items-center justify-between gap-3"><div><p className="eyebrow">BUSINESS TRUTH · ROBAWS</p><h3 className="mt-1 text-lg font-semibold">What actually happened commercially</h3></div><StatusPill tone="good">Source of truth</StatusPill></div>
          <div className="mt-4 grid grid-cols-3 gap-px bg-[var(--line)]">
            <TruthMetric label="Commercial clients" value={formatNumber(allCommercialClients.length)}/>
            <TruthMetric label="Invoiced" value={formatCurrency(businessInvoiced)}/>
            <TruthMetric label="Paid" value={formatCurrency(businessPaid)}/>
          </div>
          <p className="mt-3 text-xs leading-5 text-[var(--muted)]">ROBAWS totals. No marketing assumption is required.</p>
        </div>
        <div className="bg-white p-5">
          <div className="flex items-center justify-between gap-3"><div><p className="eyebrow">SOURCE ATTRIBUTION</p><h3 className="mt-1 text-lg font-semibold">Clients with a known acquisition source</h3></div><StatusPill tone={unknownSourceClients===0?"good":"warn"}>{formatPercent(sourceCoverage)} covered</StatusPill></div>
          <div className="mt-4 grid grid-cols-3 gap-px bg-[var(--line)]">
            <TruthMetric label="Known source" value={formatNumber(knownSourceClients.length)}/>
            <TruthMetric label="Known-source paid" value={formatCurrency(knownSourcePaid)}/>
            <TruthMetric label="Unknown source" value={formatNumber(unknownSourceClients)}/>
          </div>
          <p className="mt-3 text-xs leading-5 text-[var(--muted)]">{formatNumber(paidMarketingClients.length)} paid-marketing clients + {formatNumber(otherKnownSourceClients.length)} other known-source clients. This is source-level evidence, not campaign-level attribution.</p>
        </div>
        <div className="bg-white p-5">
          <div className="flex items-center justify-between gap-3"><div><p className="eyebrow">PAID MARKETING EVIDENCE</p><h3 className="mt-1 text-lg font-semibold">Only paid acquisition sources</h3></div><StatusPill tone="warn">Partial attribution</StatusPill></div>
          <div className="mt-4 grid grid-cols-3 gap-px bg-[var(--line)]">
            <TruthMetric label="Paid-source clients" value={formatNumber(paidMarketingClients.length)}/>
            <TruthMetric label="Paid-source paid" value={formatCurrency(paidMarketingPaid)}/>
            <TruthMetric label="Known spend" value={formatCurrency(coveredSpend)}/>
          </div>
          <p className="mt-3 text-xs leading-5 text-[var(--muted)]">Meta/Facebook, Google Ads, LeadAngel and AgenciYou are treated as paid acquisition. Exact campaign attribution is shown only where a deterministic campaign link exists.</p>
        </div>
      </div>
    </Card>

    <Card className="overflow-hidden">
      <div className="border-b border-[var(--line)] p-5">
        <SectionHeader title="Acquisition funnel — all CRM sources" description="This funnel includes every CRM source. Paid-marketing economics are kept separate below."/>
      </div>
      <div className="story-chain">
        {stages.map((stage,index)=><div className="story-stage" key={stage.label}><div className="flex items-center justify-between gap-2"><span>{stage.label}</span>{index<stages.length-1&&<ArrowRight size={14}/>}</div><strong>{stage.value}</strong><small>{stage.note}</small></div>)}
      </div>
    </Card>

    <div className="kpi-grid border-l border-t border-[var(--line)]">
      <KpiCard label="Known paid-source spend" value={formatCurrency(coveredSpend,true)} meta={(paidSources.some(row=>row.isManualSpend)?"Includes manual correction · ":"")+"Target: not configured"}/>
      <KpiCard label="Unique leads" value={formatNumber(summary.uniquePeople)} meta={formatNumber(data.metrics.leads)+" CRM rows · target not configured"}/>
      <KpiCard label="Qualified people" value={formatNumber(summary.qualified)} meta={formatPercent(percentage(summary.qualified,summary.uniquePeople))+" of unique people"}/>
      <KpiCard label="Visits" value={formatNumber(rows.filter(hasCompletedVisitEvidence).length)} meta="Deduplicated visit evidence"/>
      <KpiCard label="CRM-linked project value" value={formatCurrency(projectValue,true)} meta={formatNumber(summary.attributableClients)+" safely linked commercial clients"}/>
      <KpiCard label="CRM-linked open pipeline" value={formatCurrency(openValue,true)} meta={formatNumber(openOffers.length)+" linked sent + open offers"}/>
      <KpiCard label="Known-source invoiced" value={formatCurrency(knownSourceInvoiced,true)} meta={formatPercent(sourceCoverage)+" client source coverage"}/>
      <KpiCard label="Known-source paid" value={formatCurrency(knownSourcePaid,true)} meta={formatPercent(paidCashSourceCoverage)+" of ROBAWS paid cash has known source"}/>
    </div>

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

    <Card className="p-5">
      <SectionHeader title="Data trust" description="Performance conclusions are separated from data-quality blockers."/>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <Trust label="Google Ads spend" ok={!paidSources.some(row=>row.source==="Google Ads"&&row.costState==="missing")} detail={paidSources.some(row=>row.source==="Google Ads"&&row.costState==="missing")?"Missing — no CAC/ROAS":"Available or no Google cohort"}/>
        <Trust label="LeadAngel cost" ok={!paidSources.some(row=>row.source==="LeadAngel"&&row.costState==="missing")} detail={paidSources.some(row=>row.source==="LeadAngel"&&row.costState==="missing")?"Missing — ROI blocked":"Available or no LeadAngel cohort"}/>
        <Trust label="Source coverage" ok={unknownSourceClients===0} detail={knownSourceClients.length+" / "+allCommercialClients.length+" commercial clients have a safe acquisition source"}/>
        <Trust label="Paid-cash source coverage" ok={paidCashSourceCoverage>=90} detail={formatPercent(paidCashSourceCoverage)+" of ROBAWS paid cash has a known acquisition source"}/>
        <Trust label="Potential duplicates" ok={data.dataHealth.duplicates===0} detail={data.dataHealth.duplicates+" flagged"}/>
        <Trust label="Signed reconciliation" ok={rows.filter(row=>row.isSigned&&!row.isCommercialClient).length===0} detail={rows.filter(row=>row.isSigned&&!row.isCommercialClient).length+" signed not ROBAWS-confirmed"}/>
      </div>
      <Link href={scopedHref("/data-health")} className="mt-5 inline-flex items-center gap-2 text-sm font-semibold underline underline-offset-4">Open data health <ArrowRight size={14}/></Link>
    </Card>
  </div>;
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
