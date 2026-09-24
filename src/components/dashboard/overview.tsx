"use client";

import Link from "next/link";
import { useMemo,useState,type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { AlertTriangle,ArrowRight,CheckCircle2,CircleDollarSign,Database,ReceiptText,UsersRound,WalletCards } from "lucide-react";

import type { CommercialClient,CompanyDataset } from "@/lib/data/types";
import { buildFunnelSummary,buildJourneyRows,hasCompletedVisitEvidence,hasOfferSentEvidence } from "@/lib/metrics/client-funnel";
import { buildOverviewModel } from "@/lib/metrics/overview-model";
import { formatCurrency,formatNumber,formatPercent,percentage } from "@/lib/metrics/kpis";
import { sourceBusinessRows } from "./control-pages";
import { BusinessActivityChart,CohortPaybackChart,CostOutcomeChart,SourcePerformanceChart } from "./charts";
import { RecordDrilldownDrawer,type RecordDrilldown } from "./record-drilldown";
import { Card,SectionHeader,StatusPill } from "./ui";
import { SystemPulse } from "./system-pulse";

type SortKey="paid"|"spend"|"customers"|"cac"|"roas";

export function OverviewPage({data}:{data:CompanyDataset}){
  const searchParams=useSearchParams();
  const month=searchParams.get("month");
  const scopedHref=(href:string)=>month?`${href}?month=${encodeURIComponent(month)}`:href;
  const rows=buildJourneyRows(data);
  const summary=buildFunnelSummary(data);
  const sources=sourceBusinessRows(data,rows);
  const model=buildOverviewModel(data,rows,sources.map(item=>({
    source:item.source,
    spend:item.spend,
    leads:item.leads,
    qualified:item.qualified,
    visits:item.visits,
    offers:item.offers,
    attributedClients:item.attributedClients,
    projectValue:item.projectValue,
    paid:item.paid,
  })));
  const [drilldown,setDrilldown]=useState<RecordDrilldown|null>(null);
  const [sourceSort,setSourceSort]=useState<SortKey>("paid");

  const paidSources=model.sourcePerformance.filter(item=>item.spend!==null);
  const missingCostSources=model.sourcePerformance.filter(item=>item.spend===null&&isPaidSource(item.source));
  const periodOpenInvoices=model.period.invoices.filter(item=>Math.max(0,item.totalInclVat-item.creditedTotal-item.paidTotal)>.01);

  const overrideSource=(client:CommercialClient)=>{
    const keys=[`robaws:${client.externalId}`,client.id,client.matchedLeadId??""].filter(Boolean);
    const matches=(data.manualOverrides??[]).filter(item=>item.scopeType==="client"&&item.fieldKey==="source"&&keys.includes(item.scopeKey));
    const preferred=matches.find(item=>item.periodKey===data.periodKey)??matches.find(item=>item.periodKey==="all")??matches[0];
    return typeof preferred?.value==="string"&&preferred.value.trim()?preferred.value.trim():null;
  };
  const leadById=new Map(data.leads.map(lead=>[lead.id,lead]));
  const attributableClients=(data.commercialClients??[]).filter(client=>{
    const source=overrideSource(client)??(client.matchedLeadId?leadById.get(client.matchedLeadId)?.source:"");
    return Boolean(source);
  });
  const unattributedClients=(data.commercialClients??[]).filter(client=>client.commercialStatus==="CLIENT_WON"&&!attributableClients.includes(client));
  const attributablePaid=attributableClients.reduce((sum,item)=>sum+item.paidTotal,0);
  const totalClientPaid=(data.commercialClients??[]).reduce((sum,item)=>sum+item.paidTotal,0);
  const sourceCoverage=percentage(attributableClients.length,(data.commercialClients??[]).filter(item=>item.commercialStatus==="CLIENT_WON").length)??0;
  const paidCoverage=percentage(attributablePaid,totalClientPaid)??0;

  const sortedSources=useMemo(()=>[...model.sourcePerformance]
    .filter(item=>item.leads>0||item.attributedClients>0||item.paid>0||(item.spend??0)>0)
    .sort((a,b)=>{
      if(sourceSort==="spend")return Number(b.spend??-1)-Number(a.spend??-1);
      if(sourceSort==="customers")return b.attributedClients-a.attributedClients;
      if(sourceSort==="cac")return Number(a.cac??Number.POSITIVE_INFINITY)-Number(b.cac??Number.POSITIVE_INFINITY);
      if(sourceSort==="roas")return Number(b.cashRoas??-1)-Number(a.cashRoas??-1);
      return b.paid-a.paid;
    }),[model.sourcePerformance,sourceSort]);

  const insight=buildInsight(model,missingCostSources.length,unattributedClients.length);

  const sourceClients=(source:string)=>(data.commercialClients??[]).filter(client=>{
    const value=overrideSource(client)??(client.matchedLeadId?leadById.get(client.matchedLeadId)?.source:"")??"";
    return normalizeSource(value)===normalizeSource(source);
  }).sort((a,b)=>b.paidTotal-a.paidTotal);

  const actions=[
    model.period.notInvoiced>0?{
      title:"Won value not yet invoiced",
      value:formatCurrency(model.period.notInvoiced),
      detail:"Difference between selected-period won project value and selected-period invoiced value. This is not labelled lost.",
      onClick:()=>setDrilldown({title:"Won projects in selected period",subtitle:data.periodLabel,projects:model.period.projects}),
    }:null,
    model.period.outstanding>0?{
      title:"Period invoices not yet fully paid",
      value:formatCurrency(model.period.outstanding),
      detail:"Outstanding value on invoices dated in the selected calendar period.",
      onClick:()=>setDrilldown({title:"Outstanding period invoices",subtitle:data.periodLabel,invoices:periodOpenInvoices}),
    }:null,
    missingCostSources.length?{
      title:"Paid source cost missing",
      value:formatNumber(missingCostSources.length),
      detail:"CAC and cohort cash ROAS are blocked for these sources until spend is available.",
      onClick:()=>setDrilldown({title:"Clients from sources with missing cost",clients:(data.commercialClients??[]).filter(client=>missingCostSources.some(source=>normalizeSource(overrideSource(client)??(client.matchedLeadId?leadById.get(client.matchedLeadId)?.source:"")??"")===normalizeSource(source.source)))}),
    }:null,
    unattributedClients.length?{
      title:"Commercial customers without acquisition source",
      value:formatNumber(unattributedClients.length),
      detail:"Their commercial value exists, but it cannot safely be credited to marketing.",
      onClick:()=>setDrilldown({title:"Commercial customers without acquisition source",initialKind:"clients",clients:unattributedClients}),
    }:null,
    model.financialCoverage.missingInvoices>0?{
      title:"ROBAWS invoice detail incomplete",
      value:formatNumber(model.financialCoverage.missingInvoices),
      detail:`${formatCurrency(model.financialCoverage.missingPaid)} of paid value exists at client level but is not yet represented by detailed invoice rows.`,
      onClick:()=>setDrilldown({title:"Clients affected by missing ROBAWS invoice detail",initialKind:"clients",clients:model.financialCoverage.affectedClients}),
    }:null,
  ].filter(Boolean) as Array<{title:string;value:string;detail:string;onClick:()=>void}>;

  return <div className="space-y-7">
    <section className="overview-exec">
      <div className="overview-exec-head">
        <div><p className="eyebrow">MANAGEMENT OVERVIEW</p><h2>Business activity and acquisition performance</h2><p>Calendar-period company activity and acquisition-cohort outcomes are intentionally separated.</p></div>
        <div className="overview-period-chip"><span>Selected period</span><strong>{data.periodLabel}</strong></div>
      </div>
      <div className="overview-exec-grid">
        <div className="overview-exec-group business">
          <div className="overview-group-label"><ReceiptText size={16}/><span>Business · calendar period</span></div>
          <ExecMetric label="Won value" value={formatCurrency(model.period.wonValue,true)} onClick={()=>setDrilldown({title:"Projects won in selected period",subtitle:data.periodLabel,projects:model.period.projects})}/>
          <ExecMetric label="Invoiced" value={formatCurrency(model.period.invoiced,true)} onClick={()=>setDrilldown({title:"Invoices dated in selected period",subtitle:data.periodLabel,invoices:model.period.invoices})}/>
          <ExecMetric label="Paid value on period invoices" value={formatCurrency(model.period.paid,true)} onClick={()=>setDrilldown({title:"Period invoices carrying paid value",subtitle:data.periodLabel,invoices:model.period.invoices.filter(item=>item.paidTotal>0)})}/>
        </div>
        <div className="overview-exec-group acquisition">
          <div className="overview-group-label"><CircleDollarSign size={16}/><span>Acquisition · selected cohort</span></div>
          <ExecMetric label="Covered spend" value={formatCurrency(model.acquisitionEconomics.spend,true)}/>
          <ExecMetric label="Unique leads" value={formatNumber(summary.uniquePeople)} onClick={()=>setDrilldown({title:"Unique leads",subtitle:data.periodLabel,leads:rows.map(item=>item.lead)})}/>
          <ExecMetric label="Attributable customers" value={formatNumber(model.acquisitionEconomics.customers)} onClick={()=>setDrilldown({title:"Attributable commercial customers",initialKind:"clients",clients:attributableClients})}/>
          <ExecMetric label="Cohort CAC" value={formatCurrency(model.acquisitionEconomics.cac,true)}/>
          <ExecMetric label="Cohort cash ROAS to date" value={model.acquisitionEconomics.cashRoas===null?"—":formatNumber(model.acquisitionEconomics.cashRoas)+"×"}/>
        </div>
      </div>
    </section>

    <div className="overview-insight"><CheckCircle2 size={17}/><div><strong>Current management read</strong><p>{insight}</p></div></div>

    <section className="overview-section">
      <SectionTitle eyebrow="BUSINESS PERFORMANCE · CALENDAR PERIOD" title="What happened in the company during this period?" description="Commercial dates only. Financial values below use invoice/project records for the selected calendar period."/>
      <div className="business-flow">
        <FlowStage label="Won project value" value={model.period.wonValue} share={100} note={formatNumber(model.period.wonProjects)+" project(s)"} onClick={()=>setDrilldown({title:"Projects won in selected period",subtitle:data.periodLabel,projects:model.period.projects})}/>
        <ArrowRight size={18}/>
        <FlowStage label="Invoiced" value={model.period.invoiced} share={model.period.invoicedShare} note={formatPercent(model.period.invoicedShare)+" of won value"} onClick={()=>setDrilldown({title:"Invoices dated in selected period",subtitle:data.periodLabel,invoices:model.period.invoices})}/>
        <ArrowRight size={18}/>
        <FlowStage label="Paid value on period invoices" value={model.period.paid} share={model.period.paidOfWonShare} note={formatPercent(model.period.paidOfInvoicedShare)+" of invoiced"} onClick={()=>setDrilldown({title:"Period invoices carrying paid value",subtitle:data.periodLabel,invoices:model.period.invoices.filter(item=>item.paidTotal>0)})}/>
      </div>
      <div className="business-flow-foot">
        <div><span>Not yet invoiced</span><strong>{formatCurrency(model.period.notInvoiced)}</strong></div>
        <div><span>Outstanding invoiced value</span><strong>{formatCurrency(model.period.outstanding)}</strong></div>
        <div><span>Paid / won value</span><strong>{formatPercent(model.period.paidOfWonShare)}</strong></div>
      </div>
      <p className="metric-truth-note"><strong>Payment basis:</strong> ROBAWS currently provides invoice date + paid total, not payment transaction dates. Therefore this dashboard shows <strong>paid value attached to invoices dated in the period</strong>, not “cash collected during the period”.</p>
    </section>

    {model.financialCoverage.missingInvoices>0&&<button type="button" className="robaws-coverage-card is-incomplete" onClick={()=>setDrilldown({title:"Clients affected by missing ROBAWS invoice detail",initialKind:"clients",clients:model.financialCoverage.affectedClients})}>
      <div className="robaws-coverage-head"><div><p className="eyebrow">ROBAWS FINANCIAL COVERAGE</p><h3>Detailed invoice coverage is incomplete</h3><p>Client-level ROBAWS totals and detailed invoice rows do not reconcile yet. Period invoice metrics may therefore be understated.</p></div><StatusPill tone="bad">{formatPercent(model.financialCoverage.coverage)} loaded</StatusPill></div>
      <div className="robaws-coverage-metrics">
        <div><span>Invoices loaded</span><strong>{formatNumber(model.financialCoverage.loadedInvoices)} / {formatNumber(model.financialCoverage.expectedInvoices)}</strong></div>
        <div><span>Missing invoice rows</span><strong>{formatNumber(model.financialCoverage.missingInvoices)}</strong></div>
        <div><span>Missing invoiced value</span><strong>{formatCurrency(model.financialCoverage.missingInvoiced)}</strong></div>
        <div><span>Missing paid value</span><strong>{formatCurrency(model.financialCoverage.missingPaid)}</strong></div>
        <div><span>Clients affected</span><strong>{formatNumber(model.financialCoverage.affectedClients.length)}</strong></div>
      </div>
    </button>}

    <section className="overview-section">
      <SectionTitle eyebrow="ACQUISITION COHORT" title="What happened to leads acquired in this period?" description="Each milestone is independently evidenced and scaled against unique leads. The dashboard does not force an artificial narrowing funnel."/>
      {model.nonSequential&&<div className="non-sequential-note"><AlertTriangle size={15}/><span>Non-sequential CRM evidence: a later milestone can be higher than an earlier one because visit/offer evidence is incomplete or recorded independently.</span></div>}
      <div className="milestone-bars">
        {model.milestones.map(item=><button type="button" key={item.key} className="milestone-row" onClick={()=>{
          if(item.key==="leads")setDrilldown({title:item.label,leads:rows.map(row=>row.lead)});
          else if(item.key==="qualified")setDrilldown({title:item.label,leads:rows.filter(row=>row.isQualified).map(row=>row.lead)});
          else if(item.key==="visits")setDrilldown({title:item.label,leads:rows.filter(hasCompletedVisitEvidence).map(row=>row.lead)});
          else if(item.key==="offers")setDrilldown({title:item.label,offers:(data.commercialOffers??[]).filter(hasOfferSentEvidence)});
          else if(item.key==="signed")setDrilldown({title:item.label,leads:rows.filter(row=>row.isSigned).map(row=>row.lead)});
          else setDrilldown({title:item.label,initialKind:"clients",clients:(data.commercialClients??[]).filter(client=>Boolean(client.matchedLeadId&&rows.some(row=>row.leadIds.includes(client.matchedLeadId!))))});
        }}>
          <div className="milestone-label"><strong>{item.label}</strong><span>{formatNumber(item.value)} · {formatPercent(item.share)} of unique leads</span></div>
          <div className="milestone-track"><i style={{width:`${Math.min(100,item.share)}%`}}/></div>
        </button>)}
      </div>
    </section>

    <section className="overview-section">
      <SectionTitle eyebrow="ACQUISITION ECONOMICS" title="What does it cost to reach each outcome?" description="Cost metrics use only sources whose acquisition spend is available. Missing cost stays missing; it is never converted to €0."/>
      <div className="economics-summary">
        <Economy label="Covered spend" value={formatCurrency(model.acquisitionEconomics.spend)}/>
        <Economy label="CPL" value={formatCurrency(model.acquisitionEconomics.cpl)}/>
        <Economy label="Cost / qualified" value={formatCurrency(model.acquisitionEconomics.costQualified)}/>
        <Economy label="Cost / visit" value={formatCurrency(model.acquisitionEconomics.costVisit)}/>
        <Economy label="Cost / offer" value={formatCurrency(model.acquisitionEconomics.costOffer)}/>
        <Economy label="Cohort CAC" value={formatCurrency(model.acquisitionEconomics.cac)}/>
        <Economy label="Cohort value" value={formatCurrency(model.acquisitionEconomics.projectValue)}/>
        <Economy label="Cohort paid value" value={formatCurrency(model.acquisitionEconomics.paid)}/>
        <Economy label="Cohort cash ROAS to date" value={model.acquisitionEconomics.cashRoas===null?"—":formatNumber(model.acquisitionEconomics.cashRoas)+"×"}/>
      </div>
      <div className="overview-two-col">
        <Card className="p-5"><SectionHeader title="Cost to reach each outcome" description="Horizontal bars show acquisition cost per evidenced outcome."/><CostOutcomeChart data={model.costPerOutcome}/></Card>
        <Card className="p-5">
          <SectionHeader title="Acquisition value flow" description="This is cohort marketing performance, not calendar-period business revenue."/>
          <div className="acquisition-value-flow">
            <ValueStep label="Spend" value={formatCurrency(model.acquisitionEconomics.spend,true)}/>
            <ArrowRight size={15}/>
            <ValueStep label="Leads" value={formatNumber(model.acquisitionEconomics.leads)}/>
            <ArrowRight size={15}/>
            <ValueStep label="Customers" value={formatNumber(model.acquisitionEconomics.customers)}/>
            <ArrowRight size={15}/>
            <ValueStep label="Project value" value={formatCurrency(model.acquisitionEconomics.projectValue,true)}/>
            <ArrowRight size={15}/>
            <ValueStep label="Lifetime paid value" value={formatCurrency(model.acquisitionEconomics.paid,true)}/>
          </div>
          {missingCostSources.length>0&&<div className="cost-missing-note"><AlertTriangle size={15}/><span>{missingCostSources.map(item=>item.source).join(", ")}: cost missing, so cost-based metrics for those sources are blocked.</span></div>}
        </Card>
      </div>
    </section>

    <section className="overview-section">
      <SectionTitle eyebrow="BUSINESS ACTIVITY OVER TIME" title="How are commercial activity and acquisition spend moving by month?" description="Bars are won, invoiced and paid value attached to invoices; the yellow line is tracked marketing spend."/>
      <Card className="p-5"><BusinessActivityChart data={model.monthly}/><p className="chart-footnote">Paid values are attached to invoice month because payment timestamps are not available. Marketing spend remains a separate acquisition measure.</p></Card>
    </section>

    <section className="overview-section">
      <div className="section-title-row"><SectionTitle eyebrow="SOURCE PERFORMANCE" title="Which acquisition sources produce customers and value?" description="Visual comparison first; detailed economics remain available below."/><label className="overview-sort"><span>Sort by</span><select value={sourceSort} onChange={e=>setSourceSort(e.target.value as SortKey)}><option value="paid">Paid value</option><option value="spend">Spend</option><option value="customers">Customers</option><option value="cac">CAC</option><option value="roas">Cohort ROAS</option></select></label></div>
      <div className="overview-two-col">
        <Card className="p-5"><SectionHeader title="Spend vs paid value" description="No automatic winner/loser labels are applied."/><SourcePerformanceChart data={sortedSources.map(item=>({source:item.source,spend:item.spend,customers:item.attributedClients,paid:item.paid}))}/></Card>
        <Card className="p-5">
          <div className="source-compact-list">
            {sortedSources.slice(0,8).map(item=><button key={item.source} type="button" onClick={()=>setDrilldown({title:item.source+" clients",initialKind:"clients",clients:sourceClients(item.source)})}>
              <div><strong>{item.source}</strong><span>{formatNumber(item.leads)} leads · {formatNumber(item.attributedClients)} customers</span></div>
              <div><span>Spend</span><strong>{item.spend===null?"Cost missing":formatCurrency(item.spend,true)}</strong></div>
              <div><span>CAC</span><strong>{item.cac===null?"—":formatCurrency(item.cac,true)}</strong></div>
              <div><span>Paid</span><strong>{formatCurrency(item.paid,true)}</strong></div>
              <div><span>Cohort ROAS</span><strong>{item.cashRoas===null?"—":formatNumber(item.cashRoas)+"×"}</strong></div>
            </button>)}
          </div>
          <Link href={scopedHref("/campaigns")} className="overview-link">Open full source & campaign table <ArrowRight size={14}/></Link>
        </Card>
      </div>
    </section>

    <section className="overview-section">
      <SectionTitle eyebrow="COHORT PAYBACK" title="How long does acquired value take to show up?" description="Customers remain attached to their acquisition cohort. The chart uses invoice month as the timing anchor because actual payment dates are not available."/>
      <div className="overview-two-col">
        <Card className="p-5">
          {model.cohortPayback.length?<CohortPaybackChart data={model.cohortPayback} spend={model.acquisitionEconomics.spend}/>:<div className="overview-empty">No reliable cohort invoice timing is available for this selection.</div>}
          <p className="chart-footnote">Cumulative paid value means current paid_total attached to invoices by months since lead acquisition; it is not a payment-date cash curve.</p>
        </Card>
        <Card className="p-5">
          <SectionHeader title="Payback checkpoints" description="Only months with reliable invoice evidence are shown."/>
          <div className="payback-checkpoints">
            {model.cohortPayback.map(item=><div key={item.monthIndex}><span>{item.label}</span><strong>{formatCurrency(item.cumulativePaid,true)}</strong><small>{formatCurrency(item.cumulativeInvoiced,true)} invoiced · {item.customers} customer(s)</small></div>)}
          </div>
          <Link href={scopedHref("/client-journey")} className="overview-link">Open customer payback <ArrowRight size={14}/></Link>
        </Card>
      </div>
    </section>

    <section className="overview-section">
      <SectionTitle eyebrow="ACTION REQUIRED" title="What needs management attention?" description="Only issues supported by current data are shown. Every item opens the underlying records."/>
      <div className="action-grid">
        {actions.length?actions.map(item=><button type="button" key={item.title} className="action-card" onClick={item.onClick}><div><strong>{item.title}</strong><p>{item.detail}</p></div><b>{item.value}</b></button>):<div className="overview-ok"><CheckCircle2 size={17}/><strong>No current action rule is triggered by the available data.</strong></div>}
      </div>
    </section>

    <section className="overview-section">
      <SectionTitle eyebrow="CAN I TRUST THESE NUMBERS?" title="Data quality and attribution coverage" description="Warnings state exactly which metrics are affected."/>
      <div className="trust-domain-grid">
        <TrustDomain title="Marketing data" icon={<CircleDollarSign size={16}/>} items={[
          {label:"Spend coverage",state:missingCostSources.length?"partial":"complete",detail:missingCostSources.length?`${missingCostSources.length} paid source(s) have missing cost → source CAC and cohort ROAS cannot be calculated.`:"Tracked paid sources have cost coverage."},
          {label:"Marketing integrations",state:data.integrations.some(item=>["meta","google_ads"].includes(item.provider)&&item.status!=="Connected")?"review":"complete",detail:data.integrations.filter(item=>["meta","google_ads"].includes(item.provider)).map(item=>`${item.name}: ${item.status}`).join(" · ")||"No paid-media integration records."},
        ]}/>
        <TrustDomain title="CRM data" icon={<UsersRound size={16}/>} items={[
          {label:"Missing source",state:data.dataHealth.missingSource?"partial":"complete",detail:`${data.dataHealth.missingSource} lead record(s) missing source.`},
          {label:"Missing campaign",state:data.dataHealth.missingCampaign?"partial":"complete",detail:`${data.dataHealth.missingCampaign} lead record(s) missing campaign.`},
          {label:"Potential duplicates",state:data.dataHealth.duplicates?"review":"complete",detail:`${data.dataHealth.duplicates} potential duplicate lead(s).`},
        ]}/>
        <TrustDomain title="Commercial / ROBAWS" icon={<Database size={16}/>} items={[
          {label:"Invoice detail coverage",state:model.financialCoverage.missingInvoices?"partial":"complete",detail:`${model.financialCoverage.loadedInvoices} / ${model.financialCoverage.expectedInvoices} detailed invoice row(s) loaded. Missing detail affects period invoice/paid reporting.`},
          {label:"Payment timing",state:"partial",detail:"ROBAWS provides invoice_date + paid_total, but not payment_date/payment_amount → payment-date cash cannot be shown."},
        ]}/>
        <TrustDomain title="Attribution" icon={<WalletCards size={16}/>} items={[
          {label:"Customer source coverage",state:sourceCoverage>=100?"complete":sourceCoverage>0?"partial":"missing",detail:`${formatPercent(sourceCoverage)} of won commercial customers have a safe acquisition source.`},
          {label:"Paid-value attribution",state:paidCoverage>=100?"complete":paidCoverage>0?"partial":"missing",detail:`${formatPercent(paidCoverage)} of client paid value is attached to a safe acquisition source.`},
        ]}/>
      </div>
      <Link href={scopedHref("/data-health")} className="overview-link">Open full data health <ArrowRight size={14}/></Link>
    </section>

    <SystemPulse data={data}/>
    {drilldown&&<RecordDrilldownDrawer data={data} selection={drilldown} onClose={()=>setDrilldown(null)}/>}
  </div>;
}

function SectionTitle({eyebrow,title,description}:{eyebrow:string;title:string;description:string}){
  return <div className="overview-section-title"><p className="eyebrow">{eyebrow}</p><h2>{title}</h2><p>{description}</p></div>;
}
function ExecMetric({label,value,onClick}:{label:string;value:string;onClick?:()=>void}){
  const content=<><span>{label}</span><strong>{value}</strong></>;
  return onClick?<button type="button" className="exec-metric drillable text-left" onClick={onClick}>{content}</button>:<div className="exec-metric">{content}</div>;
}
function FlowStage({label,value,share,note,onClick}:{label:string;value:number;share:number;note:string;onClick:()=>void}){
  return <button type="button" className="flow-stage drillable text-left" onClick={onClick}><span>{label}</span><strong>{formatCurrency(value)}</strong><div className="flow-track"><i style={{width:`${Math.min(100,share)}%`}}/></div><small>{note}</small></button>;
}
function Economy({label,value}:{label:string;value:string}){return <div className="economy-cell"><span>{label}</span><strong>{value}</strong></div>}
function ValueStep({label,value}:{label:string;value:string}){return <div><span>{label}</span><strong>{value}</strong></div>}
function TrustDomain({title,icon,items}:{title:string;icon:ReactNode;items:Array<{label:string;state:"complete"|"partial"|"missing"|"review";detail:string}>}){
  return <Card className="trust-domain"><div className="trust-domain-head">{icon}<h3>{title}</h3></div>{items.map(item=><div className="trust-domain-row" key={item.label}><StatusPill tone={item.state==="complete"?"good":item.state==="missing"?"bad":"warn"}>{item.state==="complete"?"Complete":item.state==="partial"?"Partial":item.state==="missing"?"Missing":"Needs review"}</StatusPill><div><strong>{item.label}</strong><p>{item.detail}</p></div></div>)}</Card>;
}
function buildInsight(model:ReturnType<typeof buildOverviewModel>,missingCosts:number,unattributed:number){
  if(model.financialCoverage.missingInvoices>0)return `ROBAWS invoice detail is incomplete: ${model.financialCoverage.missingInvoices} invoice row(s) are missing from detailed reporting, so calendar-period invoice metrics can be understated.`;
  if(missingCosts>0)return `${missingCosts} paid acquisition source(s) have missing cost, so CAC and cohort cash ROAS are incomplete for those sources.`;
  if(unattributed>0)return `${unattributed} commercial customer(s) have no safe acquisition source, so their value cannot yet be assigned to marketing.`;
  if(model.period.notInvoiced>0)return `${formatCurrency(model.period.notInvoiced)} of selected-period won value is not represented by selected-period invoices yet.`;
  if(model.period.outstanding>0)return `${formatCurrency(model.period.outstanding)} remains outstanding on invoices dated in the selected period.`;
  return "The currently available commercial, acquisition-cost and attribution checks do not show a major data-quality blocker.";
}
function normalizeSource(value:string){
  const key=value.trim().toLowerCase();
  if(["facebook ads","meta ads","facebook","meta","facade ad","facade ads","meta / facebook"].includes(key))return"meta ads / facebook";
  return key;
}
function isPaidSource(value:string){return["meta ads / facebook","google ads","leadangel","agenciyou","solary"].includes(normalizeSource(value))}
