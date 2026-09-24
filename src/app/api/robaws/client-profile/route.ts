import { NextResponse } from "next/server";
import { requireIntegrationConnection } from "@/lib/integrations/access";
import { fetchAllRobaws } from "@/lib/integrations/robaws-client";

export const runtime="nodejs";

type RobawsClient={
  id:string;name?:string|null;companyName?:string|null;firstName?:string|null;lastName?:string|null;
  email?:string|null;invoiceEmail?:string|null;tel?:string|null;gsm?:string|null;clientSince?:string|null;
  city?:string|null;municipality?:string|null;address?:Record<string,unknown>|null;invoiceAddress?:Record<string,unknown>|null;contacts?:unknown;
};
type RobawsOffer={id:string;logicId?:string|null;date?:string|null;sentDate?:string|null;followUpDate?:string|null;clientId?:string|null;projectId?:string|null;totalInclVat?:number|null;totalExclVat?:number|null;status?:string|null};
type RobawsProject={id:string;date?:string|null;clientId?:string|null;planningName?:string|null;status?:string|null};
type RobawsInvoice={id:string;logicId?:string|null;date?:string|null;clientId?:string|null;status?:string|null;type?:string|null;originType?:string|null;documentId?:string|null;totalInclVat?:number|null;totalExclVat?:number|null;paidTotal?:number|null;creditedTotal?:number|null};

export async function GET(request:Request){
  const url=new URL(request.url);
  const companyId=url.searchParams.get("companyId")??"";
  const externalId=url.searchParams.get("externalId")??"";
  if(!companyId||!externalId)return json({error:"companyId and externalId are required."},400);

  const access=await requireIntegrationConnection(companyId,"robaws");
  if("error" in access)return json({error:access.error},access.status);

  try{
    const [clients,offers,projects,invoices]=await Promise.all([
      fetchAllRobaws<RobawsClient>("clients",{include:"contacts"}),
      fetchAllRobaws<RobawsOffer>("offers"),
      fetchAllRobaws<RobawsProject>("projects"),
      fetchAllRobaws<RobawsInvoice>("sales-invoices"),
    ]);
    const client=clients.find(item=>String(item.id)===externalId)??null;
    if(!client)return json({error:"ROBAWS client not found."},404);
    const clientOffers=offers.filter(item=>String(item.clientId??"")===externalId);
    const clientProjects=projects.filter(item=>String(item.clientId??"")===externalId);
    const clientInvoices=invoices.filter(item=>String(item.clientId??"")===externalId);

    return json({
      client:{
        id:client.id,
        name:client.name??client.companyName??[client.firstName,client.lastName].filter(Boolean).join(" ")||"—",
        companyName:client.companyName??null,
        firstName:client.firstName??null,lastName:client.lastName??null,
        email:client.email??null,invoiceEmail:client.invoiceEmail??null,
        tel:client.tel??null,gsm:client.gsm??null,clientSince:client.clientSince??null,
        city:client.city??client.municipality??null,address:client.address??null,invoiceAddress:client.invoiceAddress??null,
        contacts:client.contacts??null,
      },
      offers:clientOffers.map(item=>({
        id:item.id,number:item.logicId??`ROB-${item.id}`,date:item.date??null,sentDate:item.sentDate??null,followUpDate:item.followUpDate??null,
        projectId:item.projectId??null,totalInclVat:Number(item.totalInclVat??0),totalExclVat:Number(item.totalExclVat??0),status:item.status??"unknown"
      })),
      projects:clientProjects.map(item=>({id:item.id,date:item.date??null,planningName:item.planningName??null,status:item.status??"unknown"})),
      invoices:clientInvoices.map(item=>({
        id:item.id,number:item.logicId??`ROB-${item.id}`,date:item.date??null,status:item.status??"unknown",type:item.type??null,originType:item.originType??null,
        documentId:item.documentId??null,totalInclVat:Number(item.totalInclVat??0),totalExclVat:Number(item.totalExclVat??0),
        paidTotal:Number(item.paidTotal??0),creditedTotal:Number(item.creditedTotal??0)
      }))
    });
  }catch(error){
    return json({error:error instanceof Error?error.message:"Unable to load client profile."},502);
  }
}
function json(body:Record<string,unknown>,status=200){return NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store"}})}
