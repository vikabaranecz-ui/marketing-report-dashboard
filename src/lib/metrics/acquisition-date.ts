export function effectiveAcquisitionDate(createdAt:string,robawsClientSince:string|null|undefined){
  const crmDate=String(createdAt??"").slice(0,10);
  const robawsDate=String(robawsClientSince??"").slice(0,10);
  if(!crmDate)return robawsDate;
  return robawsDate&&robawsDate<crmDate?robawsDate:crmDate;
}

export function acquisitionDateWasRebased(createdAt:string,robawsClientSince:string|null|undefined){
  const crmDate=String(createdAt??"").slice(0,10);
  const effective=effectiveAcquisitionDate(createdAt,robawsClientSince);
  return Boolean(crmDate&&effective&&effective<crmDate);
}
