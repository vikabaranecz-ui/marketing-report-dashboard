import type { CommercialClient, CompanyDataset } from "@/lib/data/types";
import type { JourneyRow } from "@/lib/metrics/client-funnel";
import { hasCompletedVisitEvidence } from "@/lib/metrics/client-funnel";
import { percentage, safeDivide } from "@/lib/metrics/kpis";

export type OverviewSourceInput = {
  source:string;
  spend:number|null;
  leads:number;
  qualified:number;
  visits:number;
  offers:number;
  attributedClients:number;
  projectValue:number;
  paid:number;
};

export function buildOverviewModel(data:CompanyDataset,rows:JourneyRow[],sources:OverviewSourceInput[]){
  const decision=data.businessDecision;
  const period=decision?.current??null;
  const periodProjects=data.periodCommercialProjects??[];
  const periodInvoices=data.periodCommercialInvoices??[];
  const allInvoices=data.commercialInvoices??[];
  const allClients=data.commercialClients??[];

  const periodWonValue=periodProjects.reduce((sum,item)=>sum+Number(item.valueInclVat??0),0);
  const periodInvoiced=periodInvoices.reduce((sum,item)=>sum+Math.max(0,item.totalInclVat-item.creditedTotal),0);
  const periodPaid=periodInvoices.reduce((sum,item)=>sum+item.paidTotal,0);
  const periodOutstanding=Math.max(0,periodInvoiced-periodPaid);
  const periodNotInvoiced=Math.max(0,periodWonValue-periodInvoiced);

  const milestoneCounts=[
    {key:"leads",label:"Unique leads",value:rows.length},
    {key:"qualified",label:"Qualified",value:rows.filter(item=>item.isQualified).length},
    {key:"visits",label:"Completed visits",value:rows.filter(hasCompletedVisitEvidence).length},
    {key:"offers",label:"Offers sent",value:rows.filter(item=>item.offers.some(offer=>Boolean(offer.sentAt))).length},
    {key:"signed",label:"Signed CRM",value:rows.filter(item=>item.isSigned).length},
    {key:"customers",label:"Commercial customers",value:rows.filter(item=>item.isCommercialClient).length},
  ].map(item=>({...item,share:percentage(item.value,rows.length)??0}));

  const nonSequential=milestoneCounts.some((item,index)=>index>0&&item.value>milestoneCounts[index-1].value);

  const coveredSources=sources.filter(item=>item.spend!==null);
  const coveredSpend=coveredSources.reduce((sum,item)=>sum+Number(item.spend??0),0);
  const coveredLeads=coveredSources.reduce((sum,item)=>sum+item.leads,0);
  const coveredQualified=coveredSources.reduce((sum,item)=>sum+item.qualified,0);
  const coveredVisits=coveredSources.reduce((sum,item)=>sum+item.visits,0);
  const coveredOffers=coveredSources.reduce((sum,item)=>sum+item.offers,0);
  const coveredCustomers=coveredSources.reduce((sum,item)=>sum+item.attributedClients,0);
  const cohortProjectValue=coveredSources.reduce((sum,item)=>sum+item.projectValue,0);
  const cohortPaid=coveredSources.reduce((sum,item)=>sum+item.paid,0);

  const acquisitionEconomics={
    spend:coveredSpend,
    leads:coveredLeads,
    qualified:coveredQualified,
    visits:coveredVisits,
    offers:coveredOffers,
    customers:coveredCustomers,
    projectValue:cohortProjectValue,
    paid:cohortPaid,
    cpl:safeDivide(coveredSpend,coveredLeads),
    costQualified:safeDivide(coveredSpend,coveredQualified),
    costVisit:safeDivide(coveredSpend,coveredVisits),
    costOffer:safeDivide(coveredSpend,coveredOffers),
    cac:safeDivide(coveredSpend,coveredCustomers),
    cashRoas:coveredSpend?cohortPaid/coveredSpend:null,
  };

  const costPerOutcome=[
    {name:"Lead",value:acquisitionEconomics.cpl},
    {name:"Qualified lead",value:acquisitionEconomics.costQualified},
    {name:"Visit",value:acquisitionEconomics.costVisit},
    {name:"Offer",value:acquisitionEconomics.costOffer},
    {name:"Customer",value:acquisitionEconomics.cac},
  ].filter((item):item is {name:string;value:number}=>item.value!==null&&Number.isFinite(item.value));

  const sourcePerformance=sources.map(item=>({
    ...item,
    cpl:item.spend===null?null:safeDivide(item.spend,item.leads),
    costQualified:item.spend===null?null:safeDivide(item.spend,item.qualified),
    costVisit:item.spend===null?null:safeDivide(item.spend,item.visits),
    costOffer:item.spend===null?null:safeDivide(item.spend,item.offers),
    cac:item.spend===null?null:safeDivide(item.spend,item.attributedClients),
    cashRoas:item.spend===null||item.spend===0?null:item.paid/item.spend,
  }));

  const monthly=(decision?.monthly??[]).map(item=>({
    month:item.month,
    label:item.label,
    won:item.wonProjectValue,
    invoiced:item.invoiced,
    paid:item.paid,
    spend:item.spend,
    complete:item.complete,
  }));

  const cohortPayback=buildCohortPayback(data,rows);

  const invoiceCountsByClient=new Map<string,{count:number;invoiced:number;paid:number}>();
  for(const invoice of allInvoices){
    const key=invoice.externalClientId??"UNKNOWN";
    const current=invoiceCountsByClient.get(key)??{count:0,invoiced:0,paid:0};
    current.count+=1;
    current.invoiced+=Math.max(0,invoice.totalInclVat-invoice.creditedTotal);
    current.paid+=invoice.paidTotal;
    invoiceCountsByClient.set(key,current);
  }
  const expectedInvoices=allClients.reduce((sum,item)=>sum+item.invoiceCount,0);
  const expectedInvoiced=allClients.reduce((sum,item)=>sum+item.invoicedTotal,0);
  const expectedPaid=allClients.reduce((sum,item)=>sum+item.paidTotal,0);
  const loadedInvoices=allInvoices.length;
  const loadedInvoiced=allInvoices.reduce((sum,item)=>sum+Math.max(0,item.totalInclVat-item.creditedTotal),0);
  const loadedPaid=allInvoices.reduce((sum,item)=>sum+item.paidTotal,0);
  const affectedClients=allClients.filter(client=>{
    const loaded=invoiceCountsByClient.get(client.externalId)??{count:0,invoiced:0,paid:0};
    return client.invoiceCount>loaded.count||client.invoicedTotal-loaded.invoiced>.01||client.paidTotal-loaded.paid>.01;
  }).sort((a,b)=>b.paidTotal-a.paidTotal);

  const financialCoverage={
    expectedInvoices,
    loadedInvoices,
    missingInvoices:Math.max(0,expectedInvoices-loadedInvoices),
    missingInvoiced:Math.max(0,expectedInvoiced-loadedInvoiced),
    missingPaid:Math.max(0,expectedPaid-loadedPaid),
    affectedClients,
    coverage:percentage(loadedInvoices,expectedInvoices)??0,
  };

  return {
    period:{
      projects:periodProjects,
      invoices:periodInvoices,
      wonProjects:period?.wonProjects??periodProjects.length,
      wonValue:periodWonValue,
      invoiced:periodInvoiced,
      paid:periodPaid,
      outstanding:periodOutstanding,
      notInvoiced:periodNotInvoiced,
      invoicedShare:percentage(periodInvoiced,periodWonValue)??0,
      paidOfInvoicedShare:percentage(periodPaid,periodInvoiced)??0,
      paidOfWonShare:percentage(periodPaid,periodWonValue)??0,
    },
    milestones:milestoneCounts,
    nonSequential,
    acquisitionEconomics,
    costPerOutcome,
    sourcePerformance,
    monthly,
    cohortPayback,
    financialCoverage,
  };
}

function buildCohortPayback(data:CompanyDataset,rows:JourneyRow[]){
  const invoices=data.commercialInvoices??[];
  const clientByLead=new Map<string,CommercialClient>();
  for(const client of data.commercialClients??[]){
    if(client.matchedLeadId)clientByLead.set(client.matchedLeadId,client);
  }

  const cohort=new Map<number,{monthIndex:number;paid:number;invoiced:number;customers:Set<string>}>();
  for(const row of rows){
    const client=clientByLead.get(row.lead.id);
    if(!client)continue;
    const acquiredMonth=row.lead.date.slice(0,7);
    for(const invoice of invoices.filter(item=>item.leadId===row.lead.id&&item.date)){
      const lag=monthDistance(acquiredMonth,invoice.date.slice(0,7));
      if(lag<0)continue;
      const current=cohort.get(lag)??{monthIndex:lag,paid:0,invoiced:0,customers:new Set<string>()};
      current.invoiced+=Math.max(0,invoice.totalInclVat-invoice.creditedTotal);
      current.paid+=invoice.paidTotal;
      current.customers.add(client.id);
      cohort.set(lag,current);
    }
  }

  const points=[...cohort.values()].sort((a,b)=>a.monthIndex-b.monthIndex);
  let cumulativePaid=0;
  let cumulativeInvoiced=0;
  return points.map(point=>{
    cumulativePaid+=point.paid;
    cumulativeInvoiced+=point.invoiced;
    return {
      monthIndex:point.monthIndex,
      label:point.monthIndex===0?"Month 0":`Month ${point.monthIndex}`,
      paid:point.paid,
      invoiced:point.invoiced,
      cumulativePaid,
      cumulativeInvoiced,
      customers:point.customers.size,
    };
  });
}

function monthDistance(from:string,to:string){
  const [fy,fm]=from.split("-").map(Number);
  const [ty,tm]=to.split("-").map(Number);
  if(!fy||!fm||!ty||!tm)return -1;
  return (ty-fy)*12+(tm-fm);
}
