"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle, ArrowRight, BarChart3, CheckCircle2, CircleDollarSign, Database,
  Filter, ShieldCheck, UsersRound,
} from "lucide-react";
import type { CommercialClient, CommercialInvoice, CompanyDataset } from "@/lib/data/types";
import {
  buildOverviewAnalytics, hasCompletedVisitEvidence, manualClientSource, normalizeAcquisitionSource,
  PAID_ACQUISITION_SOURCES, type SourcePerformanceRow,
} from "@/lib/metrics/business-overview";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/metrics/kpis";
import { hasOfferSentEvidence } from "@/lib/metrics/client-funnel";
import { Card, SectionHeader, StatusPill } from "./ui";
import {
  BusinessActivityChart, CohortPaybackChart, CostOutcomeChart, SourcePerformanceChart,
} from "./charts";
import { RecordDrilldownDrawer, type RecordDrilldown } from "./record-drilldown";

type ExecutiveMode="period"|"cohort";
type SourceSort="spend"|"customers"|"cac"|"paid"|"roas";

export function OverviewPage({data}:{data:CompanyDataset}){
  const searchParams=useSearchParams();
  const month=searchParams.get("month");
  const scopedHref=(href:string)=>month?href+"?month="+encodeURIComponent(month):href;

  const [mode,setMode]=useState<ExecutiveMode>("period");
  const [sourceFilter,setSourceFilter]=useState("all");
  const [campaignFilter,setCampaignFilter]=useState("all");
  const [sourceSort,setSourceSort]=useState<SourceSort>("paid");
  const [showSourceTable,setShowSourceTable]=useState(false);
  const [drilldown,setDrilldown]=useState<RecordDrilldown|null>(null);

  const analytics=useMemo(
    ()=>buildOverviewAnalytics(data,{source:sourceFilter,campaign:campaignFilter}),
    [data,sourceFilter,campaignFilter],
  );
  const sourceRows=analytics.sourceRows;
  const sourceOptions=sourceRows.map(item=>item.source);
  const campaignOptions=[...new Set(analytics.allRows
    .filter(row=>sourceFilter==="all"||normalizeAcquisitionSource(row.lead.source)===sourceFilter)
    .map(row=>row.lead.campaign).filter(value=>value&&value!=="—"))].sort();
  const scopeLabel=[
    sourceFilter==="all"?"All sources":sourceFilter,
    campaignFilter==="all"?null:campaignFilter,
  ].filter(Boolean).join(" · ");

  const spendRows=buildSpendEvidence(data,sourceRows,sourceFilter,campaignFilter);
  const selectedLeadIds=new Set(analytics.rows.flatMap(row=>row.leadIds));
  const selectedOffers=(data.commercialOffers??[]).filter(item=>selectedLeadIds.has(item.leadId));
  const selectedSentOffers=selectedOffers.filter(hasOfferSentEvidence);
  const selectedClients=clientsForRows(data,analytics.rows);
  const dueOffers=selectedOffers.filter(item=>item.isOpen&&item.followUpAt&&new Date(item.followUpAt).getTime()<=Date.now());
  const outstandingInvoices=analytics.business.invoices.filter(item=>netInvoice(item)>item.paidTotal);
  const unattributedWon=(data.commercialClients??[]).filter(client=>client.commercialStatus==="CLIENT_WON"&&!resolvedClientSource(data,client));
  const unattributedPaid=unattributedWon.reduce((sum,item)=>sum+item.paidTotal,0);
  const affectedCoverageClients=coverageGapClients(data);
  const integrationIssues=data.integrations.filter(item=>item.status!=="Connected"||!item.lastSuccess);

  const insight=managementInsight(analytics);
  const monthly=(data.businessDecision?.monthly??[]).map(item=>({
    month:item.month,label:item.label,won:item.wonProjectValue,invoiced:item.invoiced,
    paid:item.paid,spend:item.spend,complete:item.complete,
  }));
  const displayedSourceRows=sourceFilter==="all"
    ? sourceRows
    : sourceRows.filter(row=>row.source===sourceFilter);
  const scopedPerformanceRows:SourcePerformanceRow[]=campaignFilter==="all"
    ? displayedSourceRows
    : [{
        source:campaignFilter,
        spend:analytics.economics.costState==="missing"?null:analytics.economics.coveredSpend,
        costState:analytics.economics.costState==="missing"?"missing":"known",
        spendNote:"Campaign-level acquisition scope",
        isManualSpend:false,recurringSpend:0,
        leads:analytics.cohort.unique,qualified:analytics.cohort.qualified,visits:analytics.cohort.visits,
        offers:analytics.cohort.offers,customers:analytics.cohort.customers,
        attributableClients:analytics.economics.attributableCustomers,
        projectValueExclVat:analytics.economics.cohortValueExclVat,
        projectValueInclVat:analytics.cohort.projectValueInclVat,
        paidValue:analytics.economics.cohortPaidValue,
        cpl:analytics.economics.cpl,costQualified:analytics.economics.costQualified,
        costVisit:analytics.economics.costVisit,costOffer:analytics.economics.costOffer,
        cac:analytics.economics.cac,cohortCashRoas:analytics.economics.cohortCashRoas,
      }];
  const sortedSources=[...scopedPerformanceRows].sort((a,b)=>sourceComparator(a,b,sourceSort));
  const sourceChartRows=sortedSources.map(row=>({
    source:row.source,spend:row.spend,paid:row.paidValue,customers:row.attributableClients,
  }));

  const openSource=(source:string)=>{
    const normalized=normalizeAcquisitionSource(source);
    const leadRows=analytics.allRows.filter(row=>normalizeAcquisitionSource(row.lead.source)===normalized);
    const leadIds=new Set(leadRows.flatMap(row=>row.leadIds));
    const clients=(data.commercialClients??[]).filter(client=>{
      const manual=manualClientSource(data,client);
      return Boolean(client.matchedLeadId&&leadIds.has(client.matchedLeadId))
        || normalizeAcquisitionSource(manual??"")===normalized;
    }).sort((a,b)=>b.paidTotal-a.paidTotal||a.name.localeCompare(b.name));
    const clientIds=new Set(clients.map(client=>client.externalId));
    setDrilldown({
      title:normalized+" records",subtitle:data.periodLabel,initialKind:"clients",
      leads:leadRows.map(row=>row.lead),clients,
      offers:(data.commercialOffers??[]).filter(item=>normalizeAcquisitionSource(item.source)===normalized),
      projects:(data.allCommercialProjects??data.periodCommercialProjects??[]).filter(item=>normalizeAcquisitionSource(item.source)===normalized||Boolean(item.externalClientId&&clientIds.has(item.externalClientId))),
      invoices:(data.allCommercialInvoices??data.periodCommercialInvoices??[]).filter(item=>normalizeAcquisitionSource(item.source)===normalized||Boolean(item.externalClientId&&clientIds.has(item.externalClientId))),
      spendRows:buildSpendEvidence(data,sourceRows,normalized,"all"),
    });
  };

  const openMonth=(selectedMonth:string)=>{
    const projects=(data.allCommercialProjects??data.periodCommercialProjects??[]).filter(item=>item.date.slice(0,7)===selectedMonth);
    const invoices=(data.allCommercialInvoices??data.periodCommercialInvoices??[]).filter(item=>item.date.slice(0,7)===selectedMonth);
    setDrilldown({title:"Business records · "+monthLabel(selectedMonth),subtitle:"Calendar-period ROBAWS records",projects,invoices});
  };

  const openMilestone=(key:string)=>{
    if(key==="leads") return setDrilldown({title:"Unique acquired leads",subtitle:scopeLabel,leads:analytics.rows.map(row=>row.lead)});
    if(key==="qualified") return setDrilldown({title:"Qualified acquired leads",subtitle:scopeLabel,leads:analytics.rows.filter(row=>row.isQualified).map(row=>row.lead)});
    if(key==="visits") return setDrilldown({title:"Completed visit evidence",subtitle:scopeLabel,leads:analytics.rows.filter(hasCompletedVisitEvidence).map(row=>row.lead),appointments:(data.commercialAppointments??[]).filter(item=>selectedLeadIds.has(item.leadId)&&Boolean(item.completedAt))});
    if(key==="offers") return setDrilldown({title:"Offers sent for acquired leads",subtitle:scopeLabel,offers:selectedSentOffers});
    if(key==="signed") return setDrilldown({title:"Signed CRM leads",subtitle:scopeLabel,leads:analytics.rows.filter(row=>row.isSigned).map(row=>row.lead)});
    return setDrilldown({title:"Confirmed commercial customers",subtitle:scopeLabel,initialKind:"clients",clients:selectedClients});
  };

  return <div className="overview-v2 space-y-6">
    <section className="overview-executive">
      <div className="overview-executive-head">
        <div>
          <p className="eyebrow">Management overview</p>
          <h1>Business performance and acquisition economics</h1>
          <p>Calendar-period company activity and acquisition-cohort performance are intentionally separated.</p>
        </div>
        <div className="overview-mode-toggle" role="tablist" aria-label="Overview focus">
          <button type="button" role="tab" aria-selected={mode==="period"} onClick={()=>setMode("period")}>Period</button>
          <button type="button" role="tab" aria-selected={mode==="cohort"} onClick={()=>setMode("cohort")}>Cohort</button>
        </div>
      </div>

      {mode==="period"
        ?<div className="executive-summary-grid">
          <ExecutiveMetric label="Won project value" value={formatCurrency(analytics.business.wonValueInclVat)} note="ROBAWS projects won in selected calendar period · incl. VAT" onClick={()=>setDrilldown({title:"Projects won in selected period",subtitle:data.periodLabel,projects:analytics.business.projects})}/>
          <ExecutiveMetric label="Invoiced" value={formatCurrency(analytics.business.invoicedInclVat)} note="Invoices dated in selected calendar period · net of credits · incl. VAT" onClick={()=>setDrilldown({title:"Invoices in selected period",subtitle:data.periodLabel,invoices:analytics.business.invoices})}/>
          <ExecutiveMetric label="Paid value on period invoices" value={formatCurrency(analytics.business.paidValueOnPeriodInvoices)} note="Current paid_total on invoices dated in this period; not a payment-date metric" onClick={()=>setDrilldown({title:"Period invoices with paid value",subtitle:data.periodLabel,invoices:analytics.business.invoices.filter(item=>item.paidTotal>0)})}/>
        </div>
        :<div className="executive-summary-grid executive-summary-cohort">
          <ExecutiveMetric label="Covered acquisition spend" value={formatCurrency(analytics.economics.coveredSpend)} note={analytics.economics.missingCostSources.length?"Cost missing: "+analytics.economics.missingCostSources.join(", "):String(analytics.economics.coveredSources.length)+" paid source(s) with cost"} onClick={()=>setDrilldown({title:"Acquisition spend evidence",subtitle:scopeLabel,initialKind:"spend",spendRows})}/>
          <ExecutiveMetric label="Unique leads" value={formatNumber(analytics.cohort.unique)} note={scopeLabel} onClick={()=>openMilestone("leads")}/>
          <ExecutiveMetric label="Attributable customers" value={formatNumber(analytics.economics.attributableCustomers)} note="Used for cohort CAC" onClick={()=>setDrilldown({title:"Attributable customers",subtitle:scopeLabel,initialKind:"clients",clients:selectedClients})}/>
          <ExecutiveMetric label="Cohort CAC" value={nullableCurrency(analytics.economics.cac)} note={analytics.economics.cac===null?"Cost or customer evidence missing":"Covered spend / attributable customers"}/>
          <ExecutiveMetric label="Cohort cash ROAS to date" value={nullableRatio(analytics.economics.cohortCashRoas)} note="Lifetime paid value currently attributable / covered acquisition spend"/>
        </div>}
    </section>

    <div className="overview-insight">
      <BarChart3 size={17}/>
      <div><strong>Current management insight</strong><p>{insight}</p></div>
    </div>

    <Card className="overview-scope-card">
      <div className="overview-scope-head">
        <div><Filter size={16}/><div><strong>Acquisition scope</strong><p>These filters change cohort, economics, source and payback views. Company-wide calendar-period business activity stays unfiltered.</p></div></div>
        <span>{scopeLabel}</span>
      </div>
      <div className="overview-scope-controls">
        <select value={sourceFilter} onChange={e=>{setSourceFilter(e.target.value);setCampaignFilter("all")}}>
          <option value="all">All sources</option>{sourceOptions.map(value=><option key={value} value={value}>{value}</option>)}
        </select>
        <select value={campaignFilter} onChange={e=>setCampaignFilter(e.target.value)}>
          <option value="all">All campaigns</option>{campaignOptions.map(value=><option key={value} value={value}>{value}</option>)}
        </select>
        {(sourceFilter!=="all"||campaignFilter!=="all")&&<button type="button" className="button-secondary" onClick={()=>{setSourceFilter("all");setCampaignFilter("all")}}>Clear filters</button>}
      </div>
    </Card>

    <section>
      <SectionHeader title="Business performance — calendar period" description="What happened in the company during the selected dates. This uses ROBAWS commercial dates and is not filtered by marketing attribution."/>
      <Card className="business-flow-card">
        <BusinessMoneyFlow analytics={analytics} onProjects={()=>setDrilldown({title:"Projects won in selected period",subtitle:data.periodLabel,projects:analytics.business.projects})} onInvoices={()=>setDrilldown({title:"Invoices in selected period",subtitle:data.periodLabel,invoices:analytics.business.invoices})}/>
      </Card>
    </section>

    <section className="grid gap-6 xl:grid-cols-[1.05fr_.95fr]">
      <Card className="p-5">
        <SectionHeader title="Acquisition cohort — conversion milestones" description="What eventually happened to leads acquired in the selected period. Bars are independently evidenced and scaled against unique leads."/>
        <div className="milestone-list">
          {analytics.cohort.milestones.map(item=><MilestoneBar key={item.key} label={item.label} value={item.value} rate={item.rate} onClick={()=>openMilestone(item.key)}/>)}
        </div>
        {!analytics.cohort.sequentialSupported&&<div className="nonsequential-note"><AlertTriangle size={15}/><div><strong>Non-sequential CRM evidence</strong><p>Some later stages exist without every earlier stage being recorded. Stage-to-stage funnel loss is therefore not shown as if the CRM were perfectly sequential.</p></div></div>}
      </Card>

      <Card className="p-5">
        <SectionHeader title="Acquisition value flow" description="Marketing spend → acquired people → customers → customer value. This is cohort performance, not calendar-period company revenue."/>
        <div className="acquisition-flow">
          <FlowStep label="Covered spend" value={formatCurrency(analytics.economics.coveredSpend)} tone="yellow"/>
          <ArrowRight size={16}/>
          <FlowStep label="Leads" value={formatNumber(analytics.cohort.unique)}/>
          <ArrowRight size={16}/>
          <FlowStep label="Customers" value={formatNumber(analytics.economics.attributableCustomers)}/>
          <ArrowRight size={16}/>
          <FlowStep label="Project value" value={formatCurrency(analytics.economics.cohortValueExclVat)} note="excl. VAT"/>
          <ArrowRight size={16}/>
          <FlowStep label="Lifetime paid value" value={formatCurrency(analytics.economics.cohortPaidValue)} note="invoice paid_total"/>
        </div>
        {analytics.economics.missingCostSources.length>0&&<div className="cost-missing-note"><AlertTriangle size={15}/><span>Cost missing for {analytics.economics.missingCostSources.join(", ")}. Cost-based metrics exclude those sources rather than treating them as €0.</span></div>}
      </Card>
    </section>

    <section>
      <SectionHeader title="Acquisition economics" description="Cost metrics use only paid sources with actual cost coverage. Missing cost stays missing."/>
      <div className="economics-summary-grid">
        <EconomicsMetric label="Covered spend" value={formatCurrency(analytics.economics.coveredSpend)} note={String(analytics.economics.coveredSources.length)+" covered source(s)"}/>
        <EconomicsMetric label="CPL" value={nullableCurrency(analytics.economics.cpl)} note={String(analytics.economics.coveredLeads)+" covered leads"}/>
        <EconomicsMetric label="Cost / qualified" value={nullableCurrency(analytics.economics.costQualified)} note={String(analytics.economics.coveredQualified)+" covered qualified"}/>
        <EconomicsMetric label="Cost / visit" value={nullableCurrency(analytics.economics.costVisit)} note={String(analytics.economics.coveredVisits)+" covered visits"}/>
        <EconomicsMetric label="Cost / offer" value={nullableCurrency(analytics.economics.costOffer)} note={String(analytics.economics.coveredOffers)+" covered offers"}/>
        <EconomicsMetric label="Cohort CAC" value={nullableCurrency(analytics.economics.cac)} note={String(analytics.economics.attributableCustomers)+" attributable customers"}/>
        <EconomicsMetric label="Cohort value" value={formatCurrency(analytics.economics.cohortValueExclVat)} note="Project value · excl. VAT where available"/>
        <EconomicsMetric label="Cohort paid value" value={formatCurrency(analytics.economics.cohortPaidValue)} note="Lifetime invoice paid_total · incl. VAT"/>
        <EconomicsMetric label="Cohort cash ROAS to date" value={nullableRatio(analytics.economics.cohortCashRoas)} note="Paid value / covered acquisition spend"/>
      </div>
      <Card className="mt-4 p-5">
        <SectionHeader title="Cost to reach each outcome" description="Bar length shows acquisition cost per increasingly valuable outcome. This is not a funnel."/>
        <CostOutcomeChart data={[
          {name:"Lead",value:analytics.economics.cpl},
          {name:"Qualified lead",value:analytics.economics.costQualified},
          {name:"Visit",value:analytics.economics.costVisit},
          {name:"Offer",value:analytics.economics.costOffer},
          {name:"Customer",value:analytics.economics.cac},
        ]}/>
      </Card>
    </section>

    <section>
      <SectionHeader title="Business activity over time" description="Grouped bars show calendar-month won, invoiced and paid value on invoices. The separate line below shows only marketing spend with an exact date."/>
      <Card className="p-5">
        <BusinessActivityChart data={monthly} onMonthClick={openMonth}/>
        <p className="chart-footnote">Click a month to open its ROBAWS project and invoice records. Manual YTD source costs are not spread across months without evidence.</p>
      </Card>
    </section>

    <section>
      <div className="section-row">
        <SectionHeader title="Source performance" description="Visual comparison first. Customer value is acquisition-cohort value; cost metrics remain blank when spend is missing."/>
        <div className="source-sort-controls">
          <label>Sort by
            <select value={sourceSort} onChange={e=>setSourceSort(e.target.value as SourceSort)}>
              <option value="spend">Spend</option><option value="customers">Customers</option><option value="cac">CAC</option><option value="paid">Paid value</option><option value="roas">ROAS</option>
            </select>
          </label>
        </div>
      </div>
      <Card className="p-5">
        <SourcePerformanceChart data={sourceChartRows} onSourceClick={campaignFilter==="all"?openSource:()=>setDrilldown({title:"Campaign records · "+campaignFilter,subtitle:scopeLabel,leads:analytics.rows.map(row=>row.lead),offers:selectedSentOffers,clients:selectedClients,spendRows})}/>
        <div className="mt-4 flex justify-between gap-3">
          <p className="chart-footnote">Yellow = covered spend. Black = lifetime paid value attributable to the acquisition source.</p>
          <button type="button" className="button-secondary" onClick={()=>setShowSourceTable(value=>!value)}>{showSourceTable?"Hide detailed table":"Show detailed table"}</button>
        </div>
        {showSourceTable&&<div className="table-scroll mt-4"><table><thead><tr><th>Source</th><th>Spend</th><th>Leads</th><th>Qualified</th><th>Visits</th><th>Offers</th><th>Customers</th><th>Project value excl. VAT</th><th>Paid value</th><th>CAC</th><th>Cohort cash ROAS</th></tr></thead><tbody>
          {sortedSources.map(row=><tr key={row.source}><td className="font-semibold"><button type="button" className="client-link" onClick={()=>campaignFilter==="all"?openSource(row.source):setDrilldown({title:"Campaign records · "+campaignFilter,subtitle:scopeLabel,leads:analytics.rows.map(item=>item.lead),offers:selectedSentOffers,clients:selectedClients,spendRows})}>{row.source}</button></td><td>{row.costState==="missing"?"Cost missing":row.spend===null?"—":formatCurrency(row.spend)}</td><td>{row.leads}</td><td>{row.qualified}</td><td>{row.visits}</td><td>{row.offers}</td><td>{row.attributableClients}</td><td>{formatCurrency(row.projectValueExclVat)}</td><td>{formatCurrency(row.paidValue)}</td><td>{nullableCurrency(row.cac)}</td><td>{nullableRatio(row.cohortCashRoas)}</td></tr>)}
        </tbody></table></div>}
      </Card>
    </section>

    <section>
      <SectionHeader title="Cohort payback" description="Customers are grouped by acquisition month so later project, invoice and paid value stays attached to the month they were acquired."/>
      <div className="grid gap-6 xl:grid-cols-[1.08fr_.92fr]">
        <Card className="p-5">
          <CohortPaybackChart data={analytics.payback.series} spendReference={analytics.payback.acquisitionSpendReference}/>
          <div className="payment-timing-note"><AlertTriangle size={15}/><p>ROBAWS currently supplies invoice_date and paid_total, but no payment_date/payment_amount records. The line therefore shows cumulative paid value attached to invoices by months since acquisition, using invoice dates as the timing anchor. It is not labelled as actual cash collection timing.</p></div>
        </Card>
        <Card className="p-5">
          <div className="table-scroll"><table><thead><tr><th>Acquisition month</th><th>Acquisition spend</th><th>Customers</th><th>Project value</th><th>Invoiced to date</th><th>Paid value to date</th></tr></thead><tbody>
            {analytics.payback.cohorts.map(item=><tr key={item.month}><td className="font-semibold"><button type="button" className="client-link" onClick={()=>{
              const rows=analytics.rows.filter(row=>row.lead.date.startsWith(item.month));
              setDrilldown({title:"Acquisition cohort · "+monthLabel(item.month),subtitle:scopeLabel,leads:rows.map(row=>row.lead),clients:clientsForRows(data,rows)});
            }}>{monthLabel(item.month)}</button></td><td>{item.acquisitionSpend===null?"Not allocated":formatCurrency(item.acquisitionSpend)}{item.spendState==="synced-only"&&<small className="block text-[var(--muted)]">synced dated spend only</small>}</td><td>{item.customers}</td><td>{formatCurrency(item.projectValue)}</td><td>{formatCurrency(item.invoiced)}</td><td>{formatCurrency(item.paid)}</td></tr>)}
          </tbody></table></div>
        </Card>
      </div>
    </section>

    <section>
      <SectionHeader title="Action required" description="Only issues supported by current records are shown. Each item opens the evidence or the relevant control page."/>
      <div className="action-grid">
        {dueOffers.length>0&&<ActionButton title="Offers need follow-up" value={formatNumber(dueOffers.length)} detail={formatCurrency(dueOffers.reduce((sum,item)=>sum+item.priceInclVat,0))+" open value has a follow-up date that is due."} onClick={()=>setDrilldown({title:"Offers with follow-up due",subtitle:scopeLabel,offers:dueOffers})}/>}
        {analytics.business.notYetInvoicedPeriodGap>0&&<ActionButton title="Won value exceeds period invoicing" value={formatCurrency(analytics.business.notYetInvoicedPeriodGap)} detail="Aggregate calendar-period gap. It is not labelled lost because invoice timing can lag project wins." onClick={()=>setDrilldown({title:"Projects won in selected period",subtitle:data.periodLabel,projects:analytics.business.projects})}/>}
        {analytics.business.outstanding>0&&<ActionButton title="Outstanding on period invoices" value={formatCurrency(analytics.business.outstanding)} detail="Current unpaid balance on invoices dated in the selected period." onClick={()=>setDrilldown({title:"Outstanding period invoices",subtitle:data.periodLabel,invoices:outstandingInvoices})}/>}
        {analytics.economics.missingCostSources.length>0&&<ActionButton title="Source cost missing" value={formatNumber(analytics.economics.missingCostSources.length)} detail="CAC and cohort cash ROAS cannot be calculated for these paid sources." onClick={()=>setDrilldown({title:"Sources with missing cost",subtitle:scopeLabel,initialKind:"spend",spendRows:spendRows.filter(item=>item.state==="missing")})}/>}
        {unattributedWon.length>0&&<ActionButton title="Commercial customers without safe source" value={formatNumber(unattributedWon.length)} detail={formatCurrency(unattributedPaid)+" paid value cannot be safely assigned to acquisition."} onClick={()=>setDrilldown({title:"Customers without acquisition source",subtitle:"ROBAWS commercial customers",initialKind:"clients",clients:unattributedWon})}/>}
        {(analytics.coverage.missingInvoices>0||analytics.coverage.missingProjects>0)&&<ActionButton title="ROBAWS detail coverage incomplete" value={String(analytics.coverage.loadedInvoices)+"/"+String(analytics.coverage.expectedInvoices)+" invoices"} detail={String(analytics.coverage.missingInvoices)+" invoice row(s) and "+String(analytics.coverage.missingProjects)+" project row(s) are not represented in the detailed snapshot."} onClick={()=>setDrilldown({title:"Clients affected by ROBAWS detail gaps",subtitle:"Reconciliation coverage",initialKind:"clients",clients:affectedCoverageClients})}/>}
        {data.dataHealth.duplicates>0&&<ActionLink title="Potential duplicate leads" value={formatNumber(data.dataHealth.duplicates)} detail="Review duplicate candidates before trusting unique-lead conversion." href={scopedHref("/data-health")}/>}
        {integrationIssues.length>0&&<ActionLink title="Integration sync needs review" value={formatNumber(integrationIssues.length)} detail={integrationIssues.map(item=>item.name).join(", ")} href={scopedHref("/data-health")}/>}
        {dueOffers.length===0&&analytics.business.notYetInvoicedPeriodGap===0&&analytics.business.outstanding===0&&analytics.economics.missingCostSources.length===0&&unattributedWon.length===0&&analytics.coverage.missingInvoices===0&&analytics.coverage.missingProjects===0&&data.dataHealth.duplicates===0&&integrationIssues.length===0&&
          <div className="action-clear"><CheckCircle2 size={17}/><strong>No supported action alert is currently triggered.</strong></div>}
      </div>
    </section>

    <section>
      <SectionHeader title="Can I trust these numbers?" description="Marketing, CRM, ROBAWS and attribution are evaluated separately. Every warning states which metric it affects."/>
      <div className="trust-v2-grid">
        <TrustPanel title="Marketing data" icon={<CircleDollarSign size={16}/>} items={[
          trustFromCoverage("Spend coverage",analytics.attribution.spendCoverage,String(analytics.attribution.paidSourcesWithCost)+" / "+String(analytics.attribution.paidSources)+" paid source(s) have cost. Missing cost blocks source CAC and cohort cash ROAS."),
          trustIntegration("Google Ads",data.integrations.find(item=>item.provider==="google_ads")),
          trustIntegration("Meta",data.integrations.find(item=>item.provider==="meta")),
        ]}/>
        <TrustPanel title="CRM data" icon={<UsersRound size={16}/>} items={[
          trustCount("Missing lead source",data.dataHealth.missingSource,"Affects source attribution and source conversion."),
          trustCount("Missing campaign",data.dataHealth.missingCampaign,"Affects campaign-level economics."),
          trustCount("Potential duplicates",data.dataHealth.duplicates,"Affects unique leads and conversion rates."),
          analytics.cohort.sequentialSupported
            ?{label:"Stage evidence",state:"Complete" as const,detail:"Current scoped records support sequential stage relationships."}
            :{label:"Stage evidence",state:"Needs review" as const,detail:"Non-sequential CRM evidence: later stages exist without every earlier stage recorded."},
        ]}/>
        <TrustPanel title="Commercial / ROBAWS" icon={<Database size={16}/>} items={[
          trustFromCoverage("Invoice detail coverage",analytics.coverage.invoiceCoverage,String(analytics.coverage.loadedInvoices)+" / "+String(analytics.coverage.expectedInvoices)+" invoice rows loaded. Missing detail affects invoice drilldowns and reconciliation."),
          trustFromCoverage("Project detail coverage",analytics.coverage.projectCoverage,String(analytics.coverage.loadedProjects)+" / "+String(analytics.coverage.expectedProjects)+" project rows loaded. Missing detail affects won-project drilldowns and monthly won value."),
          {label:"Payment timing",state:"Partial" as const,detail:"paid_total exists, but payment_date/payment_amount do not. Paid values cannot be labelled cash collected by date."},
        ]}/>
        <TrustPanel title="Attribution" icon={<ShieldCheck size={16}/>} items={[
          trustFromCoverage("Customer source coverage",analytics.attribution.sourceCoverage,String(analytics.attribution.sourceResolved)+" / "+String(analytics.attribution.commercialCustomers)+" commercial customer(s) have a safe source."),
          trustFromCoverage("Paid-value attribution",analytics.attribution.paidValueCoverage,formatCurrency(analytics.attribution.attributedPaid)+" / "+formatCurrency(analytics.attribution.paidTotal)+" paid value is source-attributed."),
          reconciliationTrust(analytics.reconciliation),
        ]}/>
      </div>
      <div className="vat-note"><strong>VAT basis:</strong> calendar invoice/cash reporting uses incl. VAT; acquisition project value uses excl. VAT where ROBAWS provides it; marketing spend remains source-reported because the current spend records do not consistently carry VAT metadata.</div>
    </section>

    {drilldown&&<RecordDrilldownDrawer data={data} selection={drilldown} onClose={()=>setDrilldown(null)}/>}
  </div>;
}

function BusinessMoneyFlow({analytics,onProjects,onInvoices}:{analytics:ReturnType<typeof buildOverviewAnalytics>;onProjects:()=>void;onInvoices:()=>void}){
  const {business}=analytics;
  const max=Math.max(business.wonValueInclVat,business.invoicedInclVat,business.paidValueOnPeriodInvoices,1);
  const steps=[
    {label:"Won project value",value:business.wonValueInclVat,ratio:null,onClick:onProjects},
    {label:"Invoiced",value:business.invoicedInclVat,ratio:business.invoicedToWon,onClick:onInvoices},
    {label:"Paid value on period invoices",value:business.paidValueOnPeriodInvoices,ratio:business.paidToInvoiced,onClick:onInvoices},
  ];
  return <div>
    <div className="business-flow">
      {steps.map((item,index)=><div className="business-flow-step" key={item.label}>
        <button type="button" onClick={item.onClick} className="business-flow-value">
          <span>{item.label}</span><strong>{formatCurrency(item.value)}</strong>
          <i style={{width:String(item.value/max*100)+"%"}}/>
        </button>
        {index<steps.length-1&&<div className="business-flow-arrow"><ArrowRight size={18}/><span>{item.ratio===null?"":formatPercent(item.ratio)}</span></div>}
      </div>)}
    </div>
    <div className="business-flow-secondary">
      <div><span>Outstanding invoiced value</span><strong>{formatCurrency(business.outstanding)}</strong><small>Current unpaid balance on period invoices</small></div>
      <div title="This is an aggregate selected-period comparison. Period invoices can relate to projects won earlier, so it is not a project-level reconciliation."><span>Won value not yet invoiced · period gap</span><strong>{formatCurrency(business.notYetInvoicedPeriodGap)}</strong><small>Never labelled lost</small></div>
      <div><span>Paid / won value</span><strong>{business.paidToWon===null?"—":formatPercent(business.paidToWon)}</strong><small>Selected-period aggregate ratio</small></div>
    </div>
  </div>;
}

function ExecutiveMetric({label,value,note,onClick}:{label:string;value:string;note:string;onClick?:()=>void}){
  const body=<><span>{label}</span><strong className={onClick?"drillable-value":""}>{value}</strong><small>{note}</small></>;
  return onClick?<button type="button" className="executive-metric drillable text-left" onClick={onClick}>{body}</button>:<div className="executive-metric">{body}</div>;
}

function MilestoneBar({label,value,rate,onClick}:{label:string;value:number;rate:number;onClick:()=>void}){
  return <button type="button" className="milestone-row drillable text-left" onClick={onClick}><div className="milestone-row-head"><strong>{label}</strong><span>{formatNumber(value)} · {formatPercent(rate)}</span></div><div className="milestone-track"><i style={{width:String(Math.min(100,Math.max(0,rate)))+"%"}}/></div></button>;
}

function FlowStep({label,value,note,tone}:{label:string;value:string;note?:string;tone?:"yellow"}){
  return <div className={"acquisition-flow-step "+(tone==="yellow"?"is-yellow":"")}><span>{label}</span><strong>{value}</strong>{note&&<small>{note}</small>}</div>;
}

function EconomicsMetric({label,value,note}:{label:string;value:string;note:string}){
  return <div className="economics-metric"><span>{label}</span><strong>{value}</strong><small>{note}</small></div>;
}

function ActionButton({title,value,detail,onClick}:{title:string;value:string;detail:string;onClick:()=>void}){
  return <button type="button" className="action-card drillable text-left" onClick={onClick}><div><strong>{title}</strong><p>{detail}</p></div><span>{value}</span></button>;
}

function ActionLink({title,value,detail,href}:{title:string;value:string;detail:string;href:string}){
  return <Link href={href} className="action-card drillable"><div><strong>{title}</strong><p>{detail}</p></div><span>{value}</span></Link>;
}

type TrustState="Complete"|"Partial"|"Missing"|"Needs review";
function TrustPanel({title,icon,items}:{title:string;icon:ReactNode;items:Array<{label:string;state:TrustState;detail:string}>}){
  return <Card className="trust-v2-panel"><div className="trust-v2-title">{icon}<strong>{title}</strong></div><div className="trust-v2-list">{items.map(item=><div key={item.label}><div><strong>{item.label}</strong><StatusPill tone={item.state==="Complete"?"good":item.state==="Missing"?"bad":item.state==="Needs review"?"warn":"neutral"}>{item.state}</StatusPill></div><p>{item.detail}</p></div>)}</div></Card>;
}

function trustFromCoverage(label:string,value:number,detail:string){
  const state:TrustState=value>=100?"Complete":value>0?"Partial":"Missing";
  return{label,state,detail};
}
function trustCount(label:string,value:number,detail:string){
  return{label,state:(value===0?"Complete":"Needs review") as TrustState,detail:value===0?"No issue detected.":String(value)+" record(s). "+detail};
}
function trustIntegration(label:string,integration:CompanyDataset["integrations"][number]|undefined){
  if(!integration)return{label,state:"Missing" as TrustState,detail:"Integration is not configured."};
  if(integration.status!=="Connected")return{label,state:"Missing" as TrustState,detail:integration.errorMessage||"Integration is not connected."};
  if(!integration.lastSuccess)return{label,state:"Partial" as TrustState,detail:"Connected, but no successful sync is recorded yet."};
  return{label,state:"Complete" as TrustState,detail:"Last successful sync: "+formatTimestamp(integration.lastSuccess)};
}
function reconciliationTrust(value:ReturnType<typeof buildOverviewAnalytics>["reconciliation"]){
  const ok=(!value.spendComparable||value.coveredSpendDifference===0)&&value.periodProjectValueDifference===0&&value.periodInvoiceValueDifference===0;
  return{label:"Reconciliation checks",state:(ok?"Complete":"Needs review") as TrustState,detail:ok?(value.spendComparable?"Source spend and period project/invoice aggregates reconcile to their underlying records.":"Period project/invoice aggregates reconcile; campaign-level spend is checked against campaign evidence separately."):"One or more dashboard aggregates do not reconcile to their underlying records."};
}

function managementInsight(analytics:ReturnType<typeof buildOverviewAnalytics>){
  if(analytics.coverage.missingInvoices>0||analytics.coverage.missingProjects>0){
    return "ROBAWS detail coverage is incomplete: "+String(analytics.coverage.loadedInvoices)+" of "+String(analytics.coverage.expectedInvoices)+" invoice rows and "+String(analytics.coverage.loadedProjects)+" of "+String(analytics.coverage.expectedProjects)+" project rows are loaded, so detailed commercial views can be understated.";
  }
  if(analytics.economics.missingCostSources.length){
    return "Acquisition cost is missing for "+analytics.economics.missingCostSources.join(", ")+"; CAC and cohort cash ROAS are intentionally unavailable for that uncovered spend.";
  }
  if(analytics.business.outstanding>0){
    return formatCurrency(analytics.business.outstanding)+" remains outstanding on invoices dated in the selected calendar period.";
  }
  if(analytics.business.notYetInvoicedPeriodGap>0){
    return "Selected-period won project value exceeds selected-period invoiced value by "+formatCurrency(analytics.business.notYetInvoicedPeriodGap)+". This is an aggregate timing gap, not lost revenue.";
  }
  return "The currently loaded business, acquisition and attribution records reconcile without a supported exception requiring management attention.";
}

function buildSpendEvidence(data:CompanyDataset,sources:SourcePerformanceRow[],sourceFilter:string,campaignFilter:string){
  if(campaignFilter!=="all"){
    const campaign=data.campaigns.find(item=>item.name===campaignFilter);
    const source=sourceFilter==="all"?normalizeAcquisitionSource(campaign?.channel??"Unattributed"):sourceFilter;
    const paid=PAID_ACQUISITION_SOURCES.has(source);
    const spend=campaign&&campaign.spend>0?campaign.spend:null;
    return[{id:"campaign:"+campaignFilter,label:campaignFilter,source,campaign:campaignFilter,spend,state:(paid?(spend===null?"missing":"known"):"not-applicable") as "known"|"missing"|"not-applicable",note:"Campaign spend from the selected reporting period."}];
  }
  return sources.filter(item=>sourceFilter==="all"||item.source===sourceFilter).map(item=>({
    id:"source:"+item.source,label:item.source,source:item.source,spend:item.spend,state:item.costState,note:item.spendNote,
  }));
}

function clientsForRows(data:CompanyDataset,rows:ReturnType<typeof buildOverviewAnalytics>["rows"]){
  const ids=new Set(rows.flatMap(row=>row.leadIds));
  return [...new Map((data.commercialClients??[]).filter(client=>Boolean(client.matchedLeadId&&ids.has(client.matchedLeadId))).map(client=>[client.id,client])).values()];
}

function resolvedClientSource(data:CompanyDataset,client:CommercialClient){
  const manual=manualClientSource(data,client);
  if(manual)return normalizeAcquisitionSource(manual);
  if(client.matchedLeadId){
    const lead=data.leads.find(item=>item.id===client.matchedLeadId);
    if(lead?.source)return normalizeAcquisitionSource(lead.source);
  }
  return "";
}

function coverageGapClients(data:CompanyDataset){
  const loadedInvoices=new Map<string,number>();
  for(const invoice of data.allCommercialInvoices??[]){
    if(!invoice.externalClientId)continue;
    loadedInvoices.set(invoice.externalClientId,(loadedInvoices.get(invoice.externalClientId)??0)+1);
  }
  const loadedProjects=new Map<string,number>();
  for(const project of data.allCommercialProjects??[]){
    if(!project.externalClientId)continue;
    loadedProjects.set(project.externalClientId,(loadedProjects.get(project.externalClientId)??0)+1);
  }
  return (data.commercialClients??[]).filter(client=>
    (loadedInvoices.get(client.externalId)??0)<client.invoiceCount
    ||(loadedProjects.get(client.externalId)??0)<client.projectCount
  ).sort((a,b)=>b.paidTotal-a.paidTotal||b.invoicedTotal-a.invoicedTotal);
}

function sourceComparator(a:SourcePerformanceRow,b:SourcePerformanceRow,key:SourceSort){
  const nullLast=(left:number|null,right:number|null)=>{
    if(left===null&&right===null)return 0;
    if(left===null)return 1;
    if(right===null)return-1;
    return right-left;
  };
  if(key==="spend")return nullLast(a.spend,b.spend);
  if(key==="customers")return b.attributableClients-a.attributableClients;
  if(key==="cac")return nullLast(a.cac,b.cac);
  if(key==="roas")return nullLast(a.cohortCashRoas,b.cohortCashRoas);
  return b.paidValue-a.paidValue;
}

function nullableCurrency(value:number|null){return value===null?"Cost missing":formatCurrency(value)}
function nullableRatio(value:number|null){return value===null?"Cost missing":formatNumber(value)+"×"}
function netInvoice(item:CommercialInvoice){return Math.max(0,item.totalInclVat-item.creditedTotal)}
function monthLabel(value:string){const parsed=new Date(value+"-01T00:00:00Z");return Number.isNaN(parsed.getTime())?value:new Intl.DateTimeFormat("en-BE",{month:"short",year:"numeric",timeZone:"UTC"}).format(parsed)}
function formatTimestamp(value:string){const parsed=new Date(value);return Number.isNaN(parsed.getTime())?value:new Intl.DateTimeFormat("en-BE",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",timeZone:"Europe/Brussels"}).format(parsed)}
