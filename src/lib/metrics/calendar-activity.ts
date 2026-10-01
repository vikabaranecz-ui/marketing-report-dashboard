type OfferFact = { id:string; date:string; sentAt?:string|null; acceptedAt?:string|null };
type ProjectFact = { id:string; date:string; completedAt?:string|null; valueInclVat:number|null };
type InvoiceFact = { id:string; date:string; totalInclVat:number; totalExclVat:number; creditedTotal:number; paidTotal:number };

function inRange(value:string|null|undefined,from:string,to:string){
  const date=String(value??"").slice(0,10);
  return Boolean(date&&date>=from&&date<=to);
}

function uniqueById<T extends {id:string}>(rows:T[]){
  return [...new Map(rows.map(row=>[row.id,row])).values()];
}

export function buildCalendarActivity<O extends OfferFact,P extends ProjectFact,I extends InvoiceFact>(
  facts:{offers?:O[];projects?:P[];invoices?:I[]},
  from:string,
  to:string,
){
  const offers=uniqueById(facts.offers??[]);
  const projects=uniqueById(facts.projects??[]);
  const invoices=uniqueById(facts.invoices??[]);
  const offersCreated=offers.filter(row=>inRange(row.date,from,to));
  const offersSent=offers.filter(row=>inRange(row.sentAt,from,to));
  const offersAccepted=offers.filter(row=>inRange(row.acceptedAt,from,to));
  const projectsWon=projects.filter(row=>inRange(row.date,from,to));
  const projectsCompleted=projects.filter(row=>inRange(row.completedAt,from,to));
  const periodInvoices=invoices.filter(row=>inRange(row.date,from,to));
  return {
    offersCreated,offersSent,offersAccepted,projectsWon,projectsCompleted,invoices:periodInvoices,
    wonProjectValue:projectsWon.reduce((sum,row)=>sum+Number(row.valueInclVat??0),0),
    invoicedInclVat:periodInvoices.reduce((sum,row)=>sum+Math.max(0,row.totalInclVat-row.creditedTotal),0),
    invoicedExclVat:periodInvoices.reduce((sum,row)=>sum+Math.max(0,row.totalExclVat),0),
    paidSnapshotOnPeriodInvoices:periodInvoices.reduce((sum,row)=>sum+row.paidTotal,0),
    paymentsReceived:null as null,
  };
}
