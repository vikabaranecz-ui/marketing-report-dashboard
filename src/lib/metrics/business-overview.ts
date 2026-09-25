import type { CompanyDataset, CommercialClient, CommercialInvoice, CommercialProject } from "@/lib/data/types";
import { buildJourneyRows, hasLeadOfferEvidence, hasOfferSentEvidence, type JourneyRow } from "@/lib/metrics/client-funnel";
import { percentage, safeDivide } from "@/lib/metrics/kpis";

export const PAID_ACQUISITION_SOURCES = new Set(["Meta Ads / Facebook","Google Ads","LeadAngel","AgenciYou","Solary"]);

export type SourcePerformanceRow = {
  source:string;
  spend:number|null;
  costState:"known"|"missing"|"not-applicable";
  spendNote:string;
  isManualSpend:boolean;
  recurringSpend:number;
  leads:number;
  deliveredLeads:number|null;
  supplierOnlyLeads:number;
  supplierMatchedPeople:number|null;
  leadCountNote:string;
  qualified:number;
  visits:number;
  offers:number;
  customers:number;
  sourceKnownClients:number;
  sourceClientIds:string[];
  attributableClients:number;
  undatedClients:number;
  clientIds:string[];
  sourceProjectValueExclVat:number;
  sourceProjectValueInclVat:number;
  sourceInvoicedValue:number;
  sourcePaidValue:number;
  projectValueExclVat:number;
  projectValueInclVat:number;
  invoicedValue:number;
  paidValue:number;
  cpl:number|null;
  costQualified:number|null;
  costVisit:number|null;
  costOffer:number|null;
  cac:number|null;
  cohortCashRoas:number|null;
};

export type OverviewScope = { source:string; campaign:string };

export function normalizeAcquisitionSource(source:string){
  const lower=String(source??"").trim().toLowerCase();
  if(lower.includes("facebook")||lower.includes("meta")||lower.includes("instagram")||lower.includes("facade ad")) return "Meta Ads / Facebook";
  if(lower.includes("google ads")) return "Google Ads";
  if(lower.includes("leadangel")) return "LeadAngel";
  if(lower.includes("agenciyou")) return "AgenciYou";
  if(lower.includes("solary")) return "Solary";
  if(lower.includes("web calculator")) return "Web calculator";
  if(lower==="web"||lower.includes("website")) return "Web";
  return String(source??"").trim()||"Unattributed";
}

export function hasSafeAcquisitionSource(source:string|null|undefined){
  const value=normalizeAcquisitionSource(String(source??"")).trim().toLowerCase();
  return !["","unknown","unattributed","onbekend","n/a","—"].includes(value);
}

export function hasCompletedVisitEvidence(row:JourneyRow){
  const status=normalized(row.lead.crmStatus);
  const stage=normalized(row.lead.stage);
  return row.appointments.some(item=>Boolean(item.completedAt))
    || stage.includes("visit completed")
    || stage.includes("quote")
    || stage.includes("won")
    || ["visited offerte to be done","offer sent","email offerte","signed","offerte afgekeurd"].includes(status);
}

export function buildSourcePerformance(data:CompanyDataset,rows:JourneyRow[]=buildJourneyRows(data)):SourcePerformanceRow[]{
  const groups=new Map<string,JourneyRow[]>();
  for(const row of rows){
    const key=normalizeAcquisitionSource(row.lead.source);
    groups.set(key,[...(groups.get(key)??[]),row]);
  }

  const result=[...groups.entries()].map(([source,group])=>{
    const manual=sourceSpendOverride(data,source);
    const delivered=sourceNumericOverride(data,source,"delivered_leads");
    const supplierOnly=sourceNumericOverride(data,source,"supplier_only_leads");
    const supplierMatched=sourceNumericOverride(data,source,"supplier_matched_people");
    const recurring=recurringSourceSpend(data,source);
    const baseSpend=manual?Number(manual.value):syncedSpendForSource(data,source,group);
    const spend=baseSpend===null?(recurring.amount>0?recurring.amount:null):baseSpend+recurring.amount;
    const nonPaid=!PAID_ACQUISITION_SOURCES.has(source);
    const costState:SourcePerformanceRow["costState"]=nonPaid?"not-applicable":spend===null||!Number.isFinite(spend)?"missing":"known";
    const clients=uniqueCommercialClientsForRows(data,group);
    const attributableLeadIds=new Set(group.filter(item=>item.isAttributableClient).flatMap(item=>item.leadIds));
    const attributableClientRows=clients.filter(client=>Boolean(client.matchedLeadId&&attributableLeadIds.has(client.matchedLeadId)));
    const sourceClientExternalIds=new Set(clients.map(client=>client.externalId));
    const sourceProjects=(data.allCommercialProjects??[]).filter(project=>Boolean(project.externalClientId&&sourceClientExternalIds.has(project.externalClientId)));
    const sourceProjectValueExclVat=sourceProjects.reduce((sum,project)=>sum+Number(project.valueExclVat??0),0);
    const sourceProjectValueInclVat=sourceProjects.reduce((sum,project)=>sum+Number(project.valueInclVat??0),0);
    const sourceInvoicedValue=clients.reduce((sum,client)=>sum+client.invoicedTotal,0);
    const sourcePaidValue=clients.reduce((sum,client)=>sum+client.paidTotal,0);
    const attributableRows=group.filter(row=>row.isAttributableClient);
    const cohortProjects=[...new Map(attributableRows.flatMap(row=>row.projects).map(project=>[project.id,project])).values()];
    const cohortInvoices=uniqueInvoices(attributableRows.flatMap(row=>row.invoices));
    const projectValueExclVat=cohortProjects.reduce((sum,project)=>sum+Number(project.valueExclVat??0),0);
    const projectValueInclVat=cohortProjects.reduce((sum,project)=>sum+Number(project.valueInclVat??0),0);
    const invoicedValue=cohortInvoices.reduce((sum,invoice)=>sum+netInvoiceIncl(invoice),0);
    const paidValue=cohortInvoices.reduce((sum,invoice)=>sum+invoice.paidTotal,0);
    const qualified=group.filter(item=>item.isQualified).length;
    const visits=group.filter(hasCompletedVisitEvidence).length;
    const offers=group.filter(item=>item.offers.some(hasOfferSentEvidence)||hasLeadOfferEvidence(item.lead)).length;
    const attributableClients=attributableClientRows.length;
    return withCostMetrics({
      source,spend:Number.isFinite(spend as number)?spend:null,costState,
      spendNote:[manual?.note??"",recurring.note].filter(Boolean).join(" · "),
      isManualSpend:Boolean(manual),recurringSpend:recurring.amount,
      leads:group.length,deliveredLeads:delivered?Number(delivered.value):null,supplierOnlyLeads:supplierOnly?Number(supplierOnly.value):0,supplierMatchedPeople:supplierMatched?Number(supplierMatched.value):null,leadCountNote:delivered?.note??"",qualified,visits,offers,
      customers:group.filter(item=>item.isCommercialClient).length,
      sourceKnownClients:clients.length,sourceClientIds:clients.map(item=>item.id),
      attributableClients,undatedClients:Math.max(0,clients.length-attributableClientRows.length),clientIds:attributableClientRows.map(item=>item.id),
      sourceProjectValueExclVat,sourceProjectValueInclVat,sourceInvoicedValue,sourcePaidValue,
      projectValueExclVat,projectValueInclVat,invoicedValue,paidValue,
    });
  });

  const bySource=new Map(result.map(row=>[row.source,row]));
  const rowLeadIds=new Set(rows.flatMap(row=>row.leadIds));
  const manualOnlyClients=(data.commercialClients??[]).filter(client=>
    data.periodKey==="ytd"
    && client.commercialStatus==="CLIENT_WON"
    && clientInSelectedPeriod(data,client)
    && Boolean(manualClientSource(data,client))
    && !(client.matchedLeadId&&rowLeadIds.has(client.matchedLeadId))
  );

  for(const client of manualOnlyClients){
    const source=normalizeAcquisitionSource(manualClientSource(data,client)??"Unattributed");
    let row=bySource.get(source);
    if(!row){
      const manual=sourceSpendOverride(data,source);
      const delivered=sourceNumericOverride(data,source,"delivered_leads");
      const supplierOnly=sourceNumericOverride(data,source,"supplier_only_leads");
      const supplierMatched=sourceNumericOverride(data,source,"supplier_matched_people");
      const recurring=recurringSourceSpend(data,source);
      const baseSpend=manual?Number(manual.value):syncedSpendForSource(data,source,[]);
      const spend=baseSpend===null?(recurring.amount>0?recurring.amount:null):baseSpend+recurring.amount;
      const nonPaid=!PAID_ACQUISITION_SOURCES.has(source);
      row=withCostMetrics({
        source,spend:Number.isFinite(spend as number)?spend:null,
        costState:nonPaid?"not-applicable":spend===null||!Number.isFinite(spend)?"missing":"known",
        spendNote:[manual?.note??"",recurring.note].filter(Boolean).join(" · "),
        isManualSpend:Boolean(manual),recurringSpend:recurring.amount,
        leads:0,deliveredLeads:delivered?Number(delivered.value):null,supplierOnlyLeads:supplierOnly?Number(supplierOnly.value):0,supplierMatchedPeople:supplierMatched?Number(supplierMatched.value):null,leadCountNote:delivered?.note??"",qualified:0,visits:0,offers:0,customers:0,
        sourceKnownClients:0,sourceClientIds:[],attributableClients:0,undatedClients:0,clientIds:[],
        sourceProjectValueExclVat:0,sourceProjectValueInclVat:0,sourceInvoicedValue:0,sourcePaidValue:0,
        projectValueExclVat:0,projectValueInclVat:0,invoicedValue:0,paidValue:0,
      });
      bySource.set(source,row);
      result.push(row);
    }
    row.customers+=1;
    row.sourceKnownClients+=1;
    row.sourceClientIds.push(client.id);
    const clientProjects=(data.allCommercialProjects??[]).filter(project=>project.externalClientId===client.externalId);
    row.sourceProjectValueExclVat+=clientProjects.reduce((sum,project)=>sum+Number(project.valueExclVat??0),0);
    row.sourceProjectValueInclVat+=clientProjects.reduce((sum,project)=>sum+Number(project.valueInclVat??0),0);
    row.sourceInvoicedValue+=client.invoicedTotal;
    row.sourcePaidValue+=client.paidTotal;
    row.undatedClients+=1;
    refreshCostMetrics(row);
  }

  return result.sort((a,b)=>b.paidValue-a.paidValue||b.projectValueExclVat-a.projectValueExclVat||b.customers-a.customers||b.leads-a.leads);
}

export function buildOverviewAnalytics(data:CompanyDataset,scope:OverviewScope){
  const allRows=buildJourneyRows(data);
  const rows=allRows.filter(row=>
    (scope.source==="all"||normalizeAcquisitionSource(row.lead.source)===scope.source)
    && (scope.campaign==="all"||row.lead.campaign===scope.campaign)
  );

  const periodProjects=(data.periodCommercialProjects??[]).filter(item=>Boolean(item.date));
  const periodInvoices=(data.periodCommercialInvoices??[]).filter(item=>Boolean(item.date));
  const wonValueInclVat=periodProjects.reduce((sum,item)=>sum+Number(item.valueInclVat??0),0);
  const wonValueExclVat=periodProjects.reduce((sum,item)=>sum+Number(item.valueExclVat??0),0);
  const invoicedInclVat=periodInvoices.reduce((sum,item)=>sum+netInvoiceIncl(item),0);
  const invoicedExclVat=periodInvoices.reduce((sum,item)=>sum+Math.max(0,item.totalExclVat),0);
  const paidValueOnPeriodInvoices=periodInvoices.reduce((sum,item)=>sum+item.paidTotal,0);
  const outstanding=periodInvoices.reduce((sum,item)=>sum+Math.max(0,netInvoiceIncl(item)-item.paidTotal),0);
  const business={
    projects:periodProjects,
    invoices:periodInvoices,
    wonProjects:periodProjects.length,
    wonValueInclVat,
    wonValueExclVat,
    invoicedInclVat,
    invoicedExclVat,
    paidValueOnPeriodInvoices,
    outstanding,
    notYetInvoicedPeriodGap:Math.max(0,wonValueInclVat-invoicedInclVat),
    invoicedToWon:percentage(invoicedInclVat,wonValueInclVat),
    paidToInvoiced:percentage(paidValueOnPeriodInvoices,invoicedInclVat),
    paidToWon:percentage(paidValueOnPeriodInvoices,wonValueInclVat),
  };

  const unique=rows.length;
  const supplierOnly=scope.campaign==="all"
    ? supplierOnlyLeadCount(data,scope.source)
    : 0;
  const knownAcquired=unique+supplierOnly;
  const qualified=rows.filter(row=>row.isQualified).length;
  const visits=rows.filter(hasCompletedVisitEvidence).length;
  const offers=rows.filter(row=>row.offers.some(hasOfferSentEvidence)||hasLeadOfferEvidence(row.lead)).length;
  const signed=rows.filter(row=>row.isSigned).length;
  const customers=rows.filter(row=>row.isCommercialClient).length;
  const strictSets={
    qualified:new Set(rows.filter(row=>row.isQualified).map(row=>row.lead.id)),
    visits:new Set(rows.filter(hasCompletedVisitEvidence).map(row=>row.lead.id)),
    offers:new Set(rows.filter(row=>row.offers.some(hasOfferSentEvidence)||hasLeadOfferEvidence(row.lead)).map(row=>row.lead.id)),
    customers:new Set(rows.filter(row=>row.isCommercialClient).map(row=>row.lead.id)),
  };
  const sequentialSupported=
    isSubset(strictSets.visits,strictSets.qualified)
    && isSubset(strictSets.offers,strictSets.visits)
    && isSubset(strictSets.customers,strictSets.offers);
  const cohortClients=uniqueCommercialClientsForRows(data,rows);
  const cohort={
    rows,clients:cohortClients,
    unique,knownAcquired,supplierOnly,qualified,visits,offers,signed,customers,
    projectValueExclVat:[...new Map(rows.filter(row=>row.isAttributableClient).flatMap(row=>row.projects).map(project=>[project.id,project])).values()].reduce((sum,project)=>sum+Number(project.valueExclVat??0),0),
    projectValueInclVat:[...new Map(rows.filter(row=>row.isAttributableClient).flatMap(row=>row.projects).map(project=>[project.id,project])).values()].reduce((sum,project)=>sum+Number(project.valueInclVat??0),0),
    invoicedToDate:uniqueInvoices(rows.filter(row=>row.isAttributableClient).flatMap(row=>row.invoices)).reduce((sum,invoice)=>sum+netInvoiceIncl(invoice),0),
    paidToDate:uniqueInvoices(rows.filter(row=>row.isAttributableClient).flatMap(row=>row.invoices)).reduce((sum,invoice)=>sum+invoice.paidTotal,0),
    sequentialSupported,
    milestones:[
      {key:"acquired",label:"Known acquired leads",value:knownAcquired,rate:knownAcquired?100:0},
      {key:"tracked",label:"CRM-tracked people",value:unique,rate:percentage(unique,knownAcquired)??0},
      {key:"qualified",label:"Qualified",value:qualified,rate:percentage(qualified,unique)??0},
      {key:"visits",label:"Completed visits",value:visits,rate:percentage(visits,unique)??0},
      {key:"offers",label:"Offers sent",value:offers,rate:percentage(offers,unique)??0},
      {key:"signed",label:"Signed CRM",value:signed,rate:percentage(signed,unique)??0},
      {key:"customers",label:"Commercial customers",value:customers,rate:percentage(customers,unique)??0},
    ],
  };

  const commercialLedger=buildCommercialLedger(data);
  const conversion={
    sequentialSupported,
    leadRelative:[
      {key:"qualified",label:"Qualified / CRM tracked",numerator:qualified,denominator:unique,rate:percentage(qualified,unique)},
      {key:"visits",label:"Visits / CRM tracked",numerator:visits,denominator:unique,rate:percentage(visits,unique)},
      {key:"offers",label:"Offers / CRM tracked",numerator:offers,denominator:unique,rate:percentage(offers,unique)},
      {key:"customers",label:"Customers / CRM tracked",numerator:customers,denominator:unique,rate:percentage(customers,unique)},
    ],
    sequential:sequentialSupported?[
      {key:"qualified-visits",label:"Qualified → Visit",numerator:visits,denominator:qualified,rate:percentage(visits,qualified)},
      {key:"visits-offers",label:"Visit → Offer",numerator:offers,denominator:visits,rate:percentage(offers,visits)},
      {key:"offers-customers",label:"Offer → Customer",numerator:customers,denominator:offers,rate:percentage(customers,offers)},
    ]:[],
  };

  const sourceRows=buildSourcePerformance(data,allRows);
  const economics=buildEconomics(data,rows,sourceRows,scope);
  const payback=buildPayback(data,rows,economics.coveredSpend,scope);
  const coverage=buildCoverage(data);
  const attribution=buildAttributionCoverage(data,sourceRows);
  const reconciliation=buildReconciliation(sourceRows,economics,business,coverage,scope);

  return {allRows,rows,business,cohort,commercialLedger,conversion,economics,sourceRows,payback,coverage,attribution,reconciliation};
}

function buildCommercialLedger(data:CompanyDataset){
  const clients=(data.commercialClients??[]).filter(item=>item.commercialStatus==="CLIENT_WON");
  const payingClients=clients.filter(item=>item.paidTotal>0);
  return {
    clients,
    payingClients:payingClients.length,
    projectValue:clients.reduce((sum,item)=>sum+item.projectValueTotal,0),
    projectValueExclVat:clients.reduce((sum,item)=>sum+item.projectValueTotalExclVat,0),
    invoiced:clients.reduce((sum,item)=>sum+item.invoicedTotal,0),
    paid:clients.reduce((sum,item)=>sum+item.paidTotal,0),
  };
}

function buildEconomics(data:CompanyDataset,rows:JourneyRow[],sources:SourcePerformanceRow[],scope:OverviewScope){
  if(scope.campaign!=="all"){
    const campaign=data.campaigns.find(item=>item.name===scope.campaign);
    const inferredSource=campaign?normalizeAcquisitionSource(campaign.channel):scope.source;
    const paidSource=scope.source!=="all"
      ? PAID_ACQUISITION_SOURCES.has(scope.source)
      : PAID_ACQUISITION_SOURCES.has(inferredSource);
    const spend=campaign&&campaign.spend>0?campaign.spend:(paidSource?null:0);
    const clients=uniqueCommercialClientsForRows(data,rows);
    const attributableLeadIds=new Set(rows.filter(item=>item.isAttributableClient).flatMap(item=>item.leadIds));
    const attributableClientIds=clients.filter(item=>Boolean(item.matchedLeadId&&attributableLeadIds.has(item.matchedLeadId))).map(item=>item.id);
    const counts={
      leads:rows.length,
      qualified:rows.filter(item=>item.isQualified).length,
      visits:rows.filter(hasCompletedVisitEvidence).length,
      offers:rows.filter(item=>item.offers.some(hasOfferSentEvidence)||hasLeadOfferEvidence(item.lead)).length,
      customers:attributableClientIds.length,
    };
    const coveredSpend=paidSource?spend:0;
    const cplCoveredSpend=spend===null||counts.leads===0?0:Number(coveredSpend);
    return {
      costState:paidSource?(spend===null?"missing":"known"):"not-applicable" as const,
      coveredSpend:spend===null?0:Number(coveredSpend),
      cplCoveredSpend,
      cplCoveredSources:spend===null||counts.leads===0?[]:[scope.campaign],
      coveredLeads:spend===null?0:counts.leads,
      coveredQualified:spend===null?0:counts.qualified,
      coveredVisits:spend===null?0:counts.visits,
      coveredOffers:spend===null?0:counts.offers,
      attributableCustomers:spend===null?0:counts.customers,
      attributableClientIds:spend===null?[]:attributableClientIds,
      cohortValueExclVat:clients.reduce((sum,client)=>sum+client.projectValueTotalExclVat,0),
      cohortPaidValue:clients.reduce((sum,client)=>sum+client.paidTotal,0),
      cpl:spend===null?null:safeDivide(cplCoveredSpend,counts.leads),
      costQualified:spend===null?null:safeDivide(spend,counts.qualified),
      costVisit:spend===null?null:safeDivide(spend,counts.visits),
      costOffer:spend===null?null:safeDivide(spend,counts.offers),
      cac:spend===null?null:safeDivide(spend,counts.customers),
      cohortCashRoas:spend===null||spend===0?null:clients.reduce((sum,client)=>sum+client.paidTotal,0)/spend,
      missingCostSources:spend===null?[scope.campaign]:[],
      coveredSources:spend===null?[]:[scope.campaign],
    };
  }

  const relevant=scope.source==="all"?sources:sources.filter(item=>item.source===scope.source);
  const paidRelevant=relevant.filter(item=>PAID_ACQUISITION_SOURCES.has(item.source));
  const known=paidRelevant.filter(item=>item.costState==="known"&&item.spend!==null);
  const missing=paidRelevant.filter(item=>item.costState==="missing");
  const coveredSpend=known.reduce((sum,item)=>sum+Number(item.spend??0),0);
  const leadCountCovered=known.filter(item=>!(item.deliveredLeads===null&&item.leads===0&&item.customers>0));
  const cplCoveredSpend=leadCountCovered.reduce((sum,item)=>sum+Number(item.spend??0),0);
  const coveredLeads=leadCountCovered.reduce((sum,item)=>sum+(item.deliveredLeads??item.leads),0);
  const coveredQualified=known.reduce((sum,item)=>sum+item.qualified,0);
  const coveredVisits=known.reduce((sum,item)=>sum+item.visits,0);
  const coveredOffers=known.reduce((sum,item)=>sum+item.offers,0);
  const attributableClientIds=[...new Set(known.flatMap(item=>item.clientIds))];
  const attributableCustomers=attributableClientIds.length;
  const cohortValueExclVat=relevant.reduce((sum,item)=>sum+item.projectValueExclVat,0);
  const cohortPaidValue=relevant.reduce((sum,item)=>sum+item.paidValue,0);
  return {
    costState:missing.length?"partial":known.length?"known":"missing" as "partial"|"known"|"missing",
    coveredSpend,cplCoveredSpend,cplCoveredSources:leadCountCovered.map(item=>item.source),coveredLeads,coveredQualified,coveredVisits,coveredOffers,attributableCustomers,attributableClientIds,
    cohortValueExclVat,cohortPaidValue,
    cpl:safeDivide(cplCoveredSpend,coveredLeads),
    costQualified:safeDivide(coveredSpend,coveredQualified),
    costVisit:safeDivide(coveredSpend,coveredVisits),
    costOffer:safeDivide(coveredSpend,coveredOffers),
    cac:safeDivide(coveredSpend,attributableCustomers),
    cohortCashRoas:coveredSpend?cohortPaidValue/coveredSpend:null,
    missingCostSources:missing.map(item=>item.source),
    coveredSources:known.map(item=>item.source),
  };
}

function buildPayback(data:CompanyDataset,rows:JourneyRow[],coveredSpend:number,scope:OverviewScope){
  const clientByLead=new Map((data.commercialClients??[]).filter(item=>item.matchedLeadId).map(item=>[item.matchedLeadId as string,item]));
  const cohorts=new Map<string,{month:string;customers:Set<string>;projectValue:number;invoiced:number;paid:number}>();
  const offsets=new Map<number,number>();
  const syncedSpendByMonth=new Map<string,number>();
  for(const point of data.trend){
    const month=point.date.slice(0,7);
    syncedSpendByMonth.set(month,(syncedSpendByMonth.get(month)??0)+point.spend);
  }
  const [periodFrom,periodTo]=data.periodLabel.split(" — ");
  const selectedSingleMonth=Boolean(periodFrom&&periodTo&&periodFrom.slice(0,7)===periodTo.slice(0,7));

  for(const row of rows){
    const month=row.lead.date.slice(0,7);
    if(!month) continue;
    const clients=row.isAttributableClient
      ? row.leadIds.map(id=>clientByLead.get(id)).filter(Boolean) as CommercialClient[]
      : [];
    const unique=[...new Map(clients.map(item=>[item.id,item])).values()];
    const current=cohorts.get(month)??{month,customers:new Set<string>(),projectValue:0,invoiced:0,paid:0};
    for(const client of unique){
      current.customers.add(client.id);
    }
    if(row.isAttributableClient){
      current.projectValue+=row.projects.reduce((sum,project)=>sum+Number(project.valueExclVat??0),0);
      const rowInvoices=uniqueInvoices(row.invoices);
      current.invoiced+=rowInvoices.reduce((sum,invoice)=>sum+netInvoiceIncl(invoice),0);
      current.paid+=rowInvoices.reduce((sum,invoice)=>sum+invoice.paidTotal,0);
    }
    cohorts.set(month,current);

    if(!row.isAttributableClient) continue;
    for(const invoice of uniqueInvoices(row.invoices)){
      if(!invoice.date) continue;
      const offset=monthDistance(month,invoice.date.slice(0,7));
      if(offset<0) continue;
      offsets.set(offset,(offsets.get(offset)??0)+invoice.paidTotal);
    }
  }

  let cumulative=0;
  const series=[...offsets.entries()].sort((a,b)=>a[0]-b[0]).map(([monthOffset,paid])=>{
    cumulative+=paid;
    return {monthOffset,label:monthOffset===0?"Month 0":`Month ${monthOffset}`,paid,cumulativePaid:cumulative};
  });

  return {
    cohorts:[...cohorts.values()].sort((a,b)=>a.month.localeCompare(b.month)).map(item=>{
      const exactScopedSpend=selectedSingleMonth&&item.month===periodFrom.slice(0,7)?coveredSpend:null;
      const syncedMonthlySpend=scope.source==="all"&&scope.campaign==="all"?(syncedSpendByMonth.get(item.month)??null):null;
      const acquisitionSpend=exactScopedSpend??syncedMonthlySpend;
      const spendState=exactScopedSpend!==null?"covered":syncedMonthlySpend!==null?"synced-only":"missing";
      return {...item,customers:item.customers.size,acquisitionSpend,spendState};
    }),
    series,
    acquisitionSpendReference:coveredSpend>0?coveredSpend:null,
    paymentTimingAvailable:false,
  };
}

function buildCoverage(data:CompanyDataset){
  const clients=(data.commercialClients??[]).filter(item=>item.commercialStatus==="CLIENT_WON");
  const allInvoices=data.allCommercialInvoices??[];
  const allProjects=data.allCommercialProjects??[];
  const expectedInvoices=clients.reduce((sum,item)=>sum+item.invoiceCount,0);
  const expectedProjects=clients.reduce((sum,item)=>sum+item.projectCount,0);
  const expectedInvoiced=clients.reduce((sum,item)=>sum+item.invoicedTotal,0);
  const expectedPaid=clients.reduce((sum,item)=>sum+item.paidTotal,0);
  const clientAggregateProjectValue=clients.reduce((sum,item)=>sum+item.projectValueTotal,0);
  const clientAggregateProjectValueExclVat=clients.reduce((sum,item)=>sum+item.projectValueTotalExclVat,0);
  const loadedProjectValue=allProjects.reduce((sum,item)=>sum+Number(item.valueInclVat??0),0);
  const loadedProjectValueExclVat=allProjects.reduce((sum,item)=>sum+Number(item.valueExclVat??0),0);
  const loadedInvoiced=allInvoices.reduce((sum,item)=>sum+netInvoiceIncl(item),0);
  const loadedPaid=allInvoices.reduce((sum,item)=>sum+item.paidTotal,0);
  return {
    expectedInvoices,loadedInvoices:allInvoices.length,missingInvoices:Math.max(0,expectedInvoices-allInvoices.length),
    expectedProjects,loadedProjects:allProjects.length,missingProjects:Math.max(0,expectedProjects-allProjects.length),
    clientAggregateProjectValue,clientAggregateProjectValueExclVat,loadedProjectValue,loadedProjectValueExclVat,
    projectValueGap:Math.abs(clientAggregateProjectValue-loadedProjectValue),
    projectValueGapExclVat:Math.abs(clientAggregateProjectValueExclVat-loadedProjectValueExclVat),
    expectedInvoiced,loadedInvoiced,missingInvoiced:Math.max(0,expectedInvoiced-loadedInvoiced),
    expectedPaid,loadedPaid,missingPaid:Math.max(0,expectedPaid-loadedPaid),
    invoiceCoverage:percentage(allInvoices.length,expectedInvoices)??0,
    projectCoverage:percentage(allProjects.length,expectedProjects)??0,
  };
}

function buildAttributionCoverage(data:CompanyDataset,sources:SourcePerformanceRow[]){
  const won=(data.commercialClients??[]).filter(item=>item.commercialStatus==="CLIENT_WON");
  const resolved=won.filter(client=>{
    const manual=manualClientSource(data,client);
    if(manual!==null)return hasSafeAcquisitionSource(manual);
    if(!client.matchedLeadId)return false;
    const lead=data.leads.find(item=>item.id===client.matchedLeadId);
    return hasSafeAcquisitionSource(lead?.source);
  });
  const paidTotal=won.reduce((sum,item)=>sum+item.paidTotal,0);
  const attributedPaid=resolved.reduce((sum,item)=>sum+item.paidTotal,0);
  const paidSources=sources.filter(item=>PAID_ACQUISITION_SOURCES.has(item.source));
  const knownCost=paidSources.filter(item=>item.costState==="known").length;
  return {
    commercialCustomers:won.length,
    sourceResolved:resolved.length,
    sourceCoverage:percentage(resolved.length,won.length)??0,
    paidTotal,attributedPaid,
    paidValueCoverage:percentage(attributedPaid,paidTotal)??0,
    paidSources:paidSources.length,
    paidSourcesWithCost:knownCost,
    spendCoverage:percentage(knownCost,paidSources.length)??0,
  };
}

function buildReconciliation(sources:SourcePerformanceRow[],economics:ReturnType<typeof buildEconomics>,business:{projects:CommercialProject[];invoices:CommercialInvoice[];wonValueInclVat:number;invoicedInclVat:number},coverage:ReturnType<typeof buildCoverage>,scope:OverviewScope){
  const comparableSources=scope.campaign!=="all"
    ? []
    : scope.source==="all"
      ? sources
      : sources.filter(item=>item.source===scope.source);
  const sourceSpend=comparableSources.filter(item=>item.costState==="known").reduce((sum,item)=>sum+Number(item.spend??0),0);
  const sourceCustomers=[...new Set(comparableSources
    .filter(item=>PAID_ACQUISITION_SOURCES.has(item.source)&&item.costState==="known")
    .flatMap(item=>item.clientIds))].length;
  return {
    spendComparable:scope.campaign==="all",
    coveredSpendDifference:scope.campaign==="all"?Math.abs(sourceSpend-economics.coveredSpend):0,
    sourceCustomerTotal:sourceCustomers,
    sourceCustomerDifference:Math.abs(sourceCustomers-economics.attributableCustomers),
    periodProjectValue:business.projects.reduce((sum:number,item:CommercialProject)=>sum+Number(item.valueInclVat??0),0),
    periodProjectValueDifference:Math.abs(business.projects.reduce((sum:number,item:CommercialProject)=>sum+Number(item.valueInclVat??0),0)-business.wonValueInclVat),
    periodInvoiceValue:business.invoices.reduce((sum:number,item:CommercialInvoice)=>sum+netInvoiceIncl(item),0),
    periodInvoiceValueDifference:Math.abs(business.invoices.reduce((sum:number,item:CommercialInvoice)=>sum+netInvoiceIncl(item),0)-business.invoicedInclVat),
    invoiceDetailGap:coverage.missingInvoices,
    projectDetailGap:coverage.missingProjects,
  };
}

function withCostMetrics(row:Omit<SourcePerformanceRow,"cpl"|"costQualified"|"costVisit"|"costOffer"|"cac"|"cohortCashRoas">):SourcePerformanceRow{
  const result={...row,cpl:null,costQualified:null,costVisit:null,costOffer:null,cac:null,cohortCashRoas:null} as SourcePerformanceRow;
  refreshCostMetrics(result);
  return result;
}

function refreshCostMetrics(row:SourcePerformanceRow){
  if(row.costState!=="known"||row.spend===null){
    row.cpl=row.costQualified=row.costVisit=row.costOffer=row.cac=row.cohortCashRoas=null;
    return;
  }
  row.cpl=safeDivide(row.spend,row.deliveredLeads??row.leads);
  row.costQualified=safeDivide(row.spend,row.qualified);
  row.costVisit=safeDivide(row.spend,row.visits);
  row.costOffer=safeDivide(row.spend,row.offers);
  row.cac=safeDivide(row.spend,row.attributableClients);
  row.cohortCashRoas=row.spend?row.paidValue/row.spend:null;
}

export function supplierOnlyLeadCount(data:CompanyDataset,source:string="all"){
  if(source!=="all"){
    const item=sourceNumericOverride(data,source,"supplier_only_leads");
    return item?Number(item.value):0;
  }
  const sources=[...new Set((data.manualOverrides??[])
    .filter(item=>item.scopeType==="source"&&item.fieldKey==="supplier_only_leads")
    .map(item=>item.scopeKey))];
  return sources.reduce((sum,key)=>{
    const item=sourceNumericOverride(data,key,"supplier_only_leads");
    return sum+(item?Number(item.value):0);
  },0);
}

export function knownAcquiredLeadCount(data:CompanyDataset,source:string="all"){
  const rows=buildJourneyRows(data).filter(row=>source==="all"||normalizeAcquisitionSource(row.lead.source)===source);
  return rows.length+supplierOnlyLeadCount(data,source);
}

function sourceNumericOverride(data:CompanyDataset,source:string,fieldKey:string){
  const matches=(data.manualOverrides??[]).filter(item=>
    item.scopeType==="source"&&item.scopeKey===source&&item.fieldKey===fieldKey&&typeof item.value==="number"
  );
  return matches.find(item=>item.periodKey===data.periodKey)
    ??matches.find(item=>item.periodKey==="all")
    ??null;
}

function sourceSpendOverride(data:CompanyDataset,source:string){
  return sourceNumericOverride(data,source,"spend");
}

function recurringSourceSpend(data:CompanyDataset,source:string){
  const [periodStart,periodEnd]=data.periodLabel.split(" — ");
  if(!periodStart||!periodEnd)return{amount:0,note:""};
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
    notes.push(`${label}: ${months} month(s)`);
  }
  return{amount,note:notes.join(" · ")};
}

function syncedSpendForSource(data:CompanyDataset,source:string,rows:JourneyRow[]){
  const channelName=source==="Meta Ads / Facebook"?"Meta Ads":source==="Google Ads"?"Google Ads":null;
  if(channelName){
    const channel=data.channels.find(item=>item.channel===channelName);
    return channel&&channel.spend>0?channel.spend:null;
  }
  if(source==="LeadAngel"){
    const costs=rows.map(row=>row.lead.acquisitionCost);
    return costs.length&&costs.every(value=>value!==null)?costs.reduce<number>((sum,value)=>sum+Number(value),0):null;
  }
  return null;
}

export function manualClientSource(data:CompanyDataset,client:CommercialClient){
  const overrides=(data.manualOverrides??[]).filter(item=>item.scopeType==="client"&&item.fieldKey==="source"&&typeof item.value==="string");
  const keys=[`robaws:${client.externalId}`,client.id,client.matchedLeadId??""].filter(Boolean);
  const matches=overrides.filter(item=>keys.includes(item.scopeKey));
  const preferred=matches.find(item=>item.periodKey===data.periodKey)??matches.find(item=>item.periodKey==="all")??matches[0];
  return typeof preferred?.value==="string"&&preferred.value.trim()?preferred.value.trim():null;
}

function clientInSelectedPeriod(data:CompanyDataset,client:CommercialClient){
  const [from,to]=data.periodLabel.split(" — ");
  const date=client.clientSince?.slice(0,10)??"";
  return Boolean(date&&from&&to&&date>=from&&date<=to);
}

function uniqueCommercialClientsForRows(data:CompanyDataset,rows:JourneyRow[]){
  const leadIds=new Set(rows.flatMap(row=>row.leadIds));
  return [...new Map((data.commercialClients??[])
    .filter(client=>client.commercialStatus==="CLIENT_WON"&&Boolean(client.matchedLeadId&&leadIds.has(client.matchedLeadId)))
    .map(client=>[client.id,client])).values()];
}

function uniqueInvoices(invoices:CommercialInvoice[]){
  return [...new Map(invoices.map(item=>[item.id,item])).values()];
}

function netInvoiceIncl(invoice:CommercialInvoice){
  return Math.max(0,invoice.totalInclVat-invoice.creditedTotal);
}

function isSubset(child:Set<string>,parent:Set<string>){
  return [...child].every(value=>parent.has(value));
}

function monthDistance(from:string,to:string){
  const [fy,fm]=from.split("-").map(Number);
  const [ty,tm]=to.split("-").map(Number);
  if(!fy||!fm||!ty||!tm)return -1;
  return(ty-fy)*12+(tm-fm);
}

function normalized(value:string){
  return String(value??"").trim().toLowerCase().replace(/\s+/g," ");
}
