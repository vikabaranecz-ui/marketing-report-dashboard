"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, CircleDollarSign, Clock3, Database, TrendingUp } from "lucide-react";
import type { CompanyDataset } from "@/lib/data/types";
import { buildFunnelSummary, buildJourneyRows, type JourneyRow } from "@/lib/metrics/client-funnel";
import { formatCurrency, formatNumber, formatPercent, percentage, safeDivide } from "@/lib/metrics/kpis";
import { sourceBusinessRows, type SourceBusinessRow } from "./control-pages";
import { Card, KpiCard, SectionHeader, StatusPill } from "./ui";

function delta(current:number,previous:number){return previous===0?null:((current-previous)/previous)*100}

export function OverviewPage({data}:{data:CompanyDataset}) {
  const rows=buildJourneyRows(data);
  const summary=buildFunnelSummary(data);
  const sources=sourceBusinessRows(data,rows);
  const paidSources=sources.filter(row=>["Meta Ads / Facebook","Google Ads","LeadAngel"].includes(row.source));
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

  const stages=[
    {label:"Spend",value:formatCurrency(data.metrics.spend,true),note:"Tracked paid media"},
    {label:"CRM leads",value:formatNumber(data.metrics.leads),note:formatPercent(percentage(data.metrics.qualified,data.metrics.leads))+" qualified"},
    {label:"Qualified",value:formatNumber(data.metrics.qualified),note:"Marketing quality boundary"},
    {label:"Visits",value:formatNumber(rows.filter(hasCompletedVisitEvidence).length),note:"Completed / post-visit evidence"},
    {label:"Offers sent",value:formatNumber(summary.offersSent),note:formatCurrency(summary.sentQuotedValue,true)+" sent value"},
    {label:"CRM signed",value:formatNumber(summary.crmSigned),note:"Monday status"},
    {label:"ROBAWS clients",value:formatNumber(summary.commercialClients),note:formatNumber(summary.attributableClients)+" attributable"},
    {label:"Paid",value:formatCurrency(paid,true),note:"Commercial cash"},
  ];

  const actionItems=buildActionItems(data,rows,openOffers,paidSources);
  const budgetCards=paidSources.map(source=>budgetConclusion(source));

  return <div className="space-y-6">
    <Card className="overflow-hidden">
      <div className="border-b border-[var(--line)] p-5">
        <SectionHeader title="Is marketing producing business?" description="One chain from tracked spend to paid revenue. Detailed evidence lives in the drill-down pages."/>
      </div>
      <div className="story-chain">
        {stages.map((stage,index)=><div className="story-stage" key={stage.label}><div className="flex items-center justify-between gap-2"><span>{stage.label}</span>{index<stages.length-1&&<ArrowRight size={14}/>}</div><strong>{stage.value}</strong><small>{stage.note}</small></div>)}
      </div>
    </Card>

    <div className="kpi-grid border-l border-t border-[var(--line)]">
      <KpiCard label="Marketing spend" value={formatCurrency(data.metrics.spend,true)} delta={delta(data.metrics.spend,data.previous.spend)} meta="Target: not configured"/>
      <KpiCard label="CRM leads" value={formatNumber(data.metrics.leads)} delta={delta(data.metrics.leads,data.previous.leads)} meta="Target: not configured"/>
      <KpiCard label="Qualified leads" value={formatNumber(data.metrics.qualified)} delta={delta(data.metrics.qualified,data.previous.qualified)} meta={formatPercent(percentage(data.metrics.qualified,data.metrics.leads))+" of CRM leads"}/>
      <KpiCard label="Visits" value={formatNumber(data.metrics.visits)} delta={delta(data.metrics.visits,data.previous.visits)} meta="Target: not configured"/>
      <KpiCard label="Won project value" value={formatCurrency(projectValue,true)} delta={delta(projectValue,data.previous.revenue)} meta={formatNumber(summary.attributableClients)+" attributable clients"}/>
      <KpiCard label="Open pipeline" value={formatCurrency(openValue,true)} meta={formatNumber(openOffers.length)+" sent + open offers"}/>
      <KpiCard label="Invoiced" value={formatCurrency(invoiced,true)} meta="Net of credits"/>
      <KpiCard label="Paid" value={formatCurrency(paid,true)} meta="Cash received"/>
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
          {actionItems.length?actionItems.map(item=><ActionItem key={item.title} {...item}/>):<div className="flex items-center gap-3 border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"><CheckCircle2 size={18}/><strong>No critical action rule is triggered by the current evidence.</strong></div>}
        </div>
      </Card>

      <Card className="p-5">
        <SectionHeader title="Revenue stages" description="Offer value, project value, invoiced and paid are different commercial states."/>
        <div className="space-y-1">
          <MoneyRow label="Total offered" value={sentOffers.reduce((sum,item)=>sum+item.priceInclVat,0)}/>
          <MoneyRow label="Open pipeline" value={openValue}/>
          <MoneyRow label="Accepted / contracted" value={acceptedValue}/>
          <MoneyRow label="Project value" value={projectValue}/>
          <MoneyRow label="Invoiced" value={invoiced}/>
          <MoneyRow label="Paid" value={paid} accent/>
        </div>
        <Link href="/revenue" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold underline underline-offset-4">Open revenue evidence <ArrowRight size={14}/></Link>
      </Card>
    </div>

    <Card className="p-5">
      <SectionHeader title="Budget conclusions" description="These rules use client and cash evidence, not lead volume or CTR alone."/>
      <div className="grid gap-4 lg:grid-cols-3">
        {budgetCards.map(card=><BudgetCard key={card.source} {...card}/>)}
      </div>
      <Link href="/campaigns" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold underline underline-offset-4">Open full source & campaign economics <ArrowRight size={14}/></Link>
    </Card>

    <Card className="p-5">
      <SectionHeader title="Data trust" description="Performance conclusions are separated from data-quality blockers."/>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Trust label="Google Ads spend" ok={!paidSources.some(row=>row.source==="Google Ads"&&row.costState==="missing")} detail={paidSources.some(row=>row.source==="Google Ads"&&row.costState==="missing")?"Missing — no CAC/ROAS":"Available or no Google cohort"}/>
        <Trust label="LeadAngel cost" ok={!paidSources.some(row=>row.source==="LeadAngel"&&row.costState==="missing")} detail={paidSources.some(row=>row.source==="LeadAngel"&&row.costState==="missing")?"Missing — ROI blocked":"Available or no LeadAngel cohort"}/>
        <Trust label="Potential duplicates" ok={data.dataHealth.duplicates===0} detail={data.dataHealth.duplicates+" flagged"}/>
        <Trust label="Signed reconciliation" ok={rows.filter(row=>row.isSigned&&!row.isCommercialClient).length===0} detail={rows.filter(row=>row.isSigned&&!row.isCommercialClient).length+" signed not ROBAWS-confirmed"}/>
      </div>
      <Link href="/data-health" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold underline underline-offset-4">Open data health <ArrowRight size={14}/></Link>
    </Card>
  </div>;
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
function Economy({label,value,note}:{label:string;value:string;note:string}){return <div className="economy-cell"><span>{label}</span><strong>{value}</strong><small>{note}</small></div>}
function MoneyRow({label,value,accent=false}:{label:string;value:number;accent?:boolean}){return <div className={`money-row ${accent?"money-row-accent":""}`}><span>{label}</span><strong>{formatCurrency(value)}</strong></div>}
function Trust({label,ok,detail}:{label:string;ok:boolean;detail:string}){return <div className="trust-card"><div className="flex items-center gap-2">{ok?<CheckCircle2 size={16} className="text-emerald-700"/>:<AlertTriangle size={16} className="text-amber-700"/>}<strong>{label}</strong></div><p>{detail}</p></div>}
function hasDateConflict(value:string|null|undefined){return String(value??"").toUpperCase().includes("DATE_CONFLICT")}
