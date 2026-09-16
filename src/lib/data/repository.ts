import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { demoCompanies, demoDatasets } from "./demo";
import type { CampaignMetric, ChannelMetric, Company, CompanyDataset, Integration, Lead, LocationMetric, ServiceMetric, TrendPoint } from "./types";

export type DashboardBootstrap = {
  mode: "demo" | "live";
  companies: Company[];
  datasets: Record<string, CompanyDataset>;
};

export async function getDashboardBootstrap(): Promise<DashboardBootstrap> {
  if (!hasSupabaseConfig()) {
    return { mode: "demo", companies: demoCompanies, datasets: demoDatasets };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("companies")
    .select("id,name,slug")
    .eq("is_active", true)
    .order("name");

  if (error) throw new Error(`Unable to load companies: ${error.message}`);

  const companies: Company[] = (data ?? []).map((company) => ({
    id: company.id,
    name: company.name,
    shortName: company.name.slice(0, 3).toUpperCase(),
    accent: "#ceff3d",
  }));

  const loaded = await Promise.all(companies.map(async (company) => [company.id, await loadLiveDataset(supabase, company)] as const));
  const datasets = Object.fromEntries(loaded);
  return { mode: "live", companies, datasets };
}

type RawMetric = { date:string; spend:number|string; impressions:number; clicks:number; platform_conversions:number|string; channel_id:string; campaign_id:string|null; service_id:string|null; marketing_channels:{name:string}|null; campaigns:{name:string}|null; services:{name:string}|null };
type RawLead = { id:string; created_at:string; name:string; email:string|null; phone:string|null; source:string|null; channel_id:string|null; campaign_id:string|null; ad_id:string|null; service_id:string|null; municipality:string|null; lead_quality:"A"|"B"|"C"|null; sales_stage:string; assigned_to:string|null; utm_source:string|null; utm_medium:string|null; utm_campaign:string|null; utm_content:string|null; utm_term:string|null; notes:string|null; campaigns:{name:string}|null; services:{name:string}|null; ads:{name:string}|null; users:{full_name:string}|null };
type RawQuote = { lead_id:string; quote_value:number|string; status:string };
type RawProject = { lead_id:string; service_id:string|null; project_value:number|string|null; gross_margin:number|string|null; status:string; won_at:string|null };
type RawRevenue = { attributed_revenue:number|string; channel_id:string|null; campaign_id:string|null; attributed_at:string };
type RawWebsite = { date:string; users:number; sessions:number; new_users:number; engaged_sessions:number; form_submissions:number; whatsapp_clicks:number; phone_clicks:number; quote_requests:number };
type RawSeo = { impressions:number; clicks:number; position_sum:number|string; is_branded:boolean|null };
type RawIntegration = { id:string; provider:Integration["provider"]; status:"connected"|"connecting"|"not_connected"|"error"; configuration:Record<string,unknown>; error_message:string|null; last_successful_sync:string|null; last_attempted_sync:string|null; sync_logs:{records_imported:number}[]|null };

async function loadLiveDataset(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, company: Company): Promise<CompanyDataset> {
  const to = new Date();
  const from = new Date(
    Date.UTC(to.getUTCFullYear(), 0, 1),
  );
  const fromIso = from.toISOString(); const toIso = to.toISOString(); const fromDate = fromIso.slice(0,10); const toDate = toIso.slice(0,10);
  const [metricsRes, leadsRes, quotesRes, projectsRes, revenueRes, servicesRes, campaignsRes, websiteRes, seoRes, integrationsRes] = await Promise.all([
    supabase.from("daily_marketing_metrics").select("date,spend,impressions,clicks,platform_conversions,channel_id,campaign_id,service_id,marketing_channels(name),campaigns(name),services(name)").eq("company_id",company.id).gte("date",fromDate).lte("date",toDate),
    supabase.from("leads").select("id,created_at,name,email,phone,source,channel_id,campaign_id,ad_id,service_id,municipality,lead_quality,sales_stage,assigned_to,utm_source,utm_medium,utm_campaign,utm_content,utm_term,notes,campaigns(name),services(name),ads(name),users!leads_assigned_to_fkey(full_name)").eq("company_id",company.id).gte("created_at",fromIso).lte("created_at",toIso),
    supabase.from("quotes").select("lead_id,quote_value,status").in("lead_id", await accessibleLeadIds(supabase, company.id, fromIso, toIso)),
    supabase.from("projects").select("lead_id,service_id,project_value,gross_margin,status,won_at").in("lead_id", await accessibleLeadIds(supabase, company.id, fromIso, toIso)),
    supabase.from("revenue_attribution").select("attributed_revenue,channel_id,campaign_id,attributed_at").eq("company_id",company.id).gte("attributed_at",fromIso).lte("attributed_at",toIso).eq("model","first_touch"),
    supabase.from("services").select("id,name,default_gross_margin").eq("company_id",company.id).eq("is_active",true),
    supabase.from("campaigns").select("id,name,channel_id,marketing_channels(name)").eq("company_id",company.id),
    supabase.from("website_metrics").select("date,users,sessions,new_users,engaged_sessions,form_submissions,whatsapp_clicks,phone_clicks,quote_requests").eq("company_id",company.id).gte("date",fromDate).lte("date",toDate),
    supabase.from("seo_metrics").select("impressions,clicks,position_sum,is_branded").eq("company_id",company.id).gte("date",fromDate).lte("date",toDate),
    supabase.from("reporting_integration_connections").select("id,provider,status,configuration,error_message,last_successful_sync,last_attempted_sync,sync_logs(records_imported)").eq("company_id",company.id),
  ]);
  const firstError = [metricsRes,leadsRes,quotesRes,projectsRes,revenueRes,servicesRes,campaignsRes,websiteRes,seoRes,integrationsRes].find(result => result.error)?.error;
  if (firstError) throw new Error(`Unable to load reporting facts: ${firstError.message}`);

  const rawMetrics = (metricsRes.data ?? []) as unknown as RawMetric[];
  const rawLeads = (leadsRes.data ?? []) as unknown as RawLead[];
  const rawQuotes = (quotesRes.data ?? []) as unknown as RawQuote[];
  const rawProjects = (projectsRes.data ?? []) as unknown as RawProject[];
  const rawRevenue = (revenueRes.data ?? []) as unknown as RawRevenue[];
  const rawWebsite = (websiteRes.data ?? []) as unknown as RawWebsite[];
  const rawSeo = (seoRes.data ?? []) as unknown as RawSeo[];
  const quoteByLead = new Map<string,RawQuote>(); rawQuotes.forEach(q=>quoteByLead.set(q.lead_id,q));
  const projectByLead = new Map<string,RawProject>(); rawProjects.forEach(p=>projectByLead.set(p.lead_id,p));
  const leads = mapLeads(rawLeads,quoteByLead,projectByLead);
  const channelMap = new Map<string,ChannelMetric>();
  for (const row of rawMetrics) { const id=row.channel_id; const item=channelMap.get(id)??{id,channel:row.marketing_channels?.name??"Unknown",spend:0,impressions:0,clicks:0,platformConversions:0,leads:0,qualified:0,visits:0,quotes:0,won:0,revenue:0}; item.spend+=Number(row.spend); item.impressions+=row.impressions; item.clicks+=row.clicks; item.platformConversions+=Number(row.platform_conversions); channelMap.set(id,item); }
  for (const lead of rawLeads) { if(!lead.channel_id) continue; const item=channelMap.get(lead.channel_id); if(!item) continue; item.leads++; if(["qualified","visit_booked","visit_completed","quote_sent","won"].includes(lead.sales_stage)) item.qualified++; if(["visit_completed","quote_sent","won"].includes(lead.sales_stage)) item.visits++; if(["quote_sent","won"].includes(lead.sales_stage)||quoteByLead.has(lead.id)) item.quotes++; if(projectByLead.get(lead.id)?.status==="won"||lead.sales_stage==="won") item.won++; }
  for(const revenue of rawRevenue){ if(!revenue.channel_id)continue; const item=channelMap.get(revenue.channel_id); if(item)item.revenue+=Number(revenue.attributed_revenue); }
  const channels=[...channelMap.values()];
  const total=(key:keyof Pick<ChannelMetric,"spend"|"leads"|"qualified"|"visits"|"quotes"|"won"|"revenue">)=>channels.reduce((s,r)=>s+Number(r[key]),0);
  const services = buildServices((servicesRes.data??[]) as unknown as {id:string;name:string;default_gross_margin:number|null}[],rawMetrics,rawLeads,rawProjects,quoteByLead);
  const campaigns = buildCampaigns((campaignsRes.data??[]) as unknown as {id:string;name:string;channel_id:string;marketing_channels:{name:string}|null}[],rawMetrics,rawLeads,rawRevenue,projectByLead);
  const trend = buildTrend(rawMetrics,rawLeads,rawRevenue,projectByLead,rawWebsite);
  const locations = buildLocations(rawLeads,rawMetrics,projectByLead);
  const website={users:sum(rawWebsite,"users"),sessions:sum(rawWebsite,"sessions"),newUsers:sum(rawWebsite,"new_users"),engagedSessions:sum(rawWebsite,"engaged_sessions"),formSubmissions:sum(rawWebsite,"form_submissions"),whatsappClicks:sum(rawWebsite,"whatsapp_clicks"),phoneClicks:sum(rawWebsite,"phone_clicks"),quoteRequests:sum(rawWebsite,"quote_requests")};
  const seoImpressions=sum(rawSeo,"impressions"),seoClicks=sum(rawSeo,"clicks"),positionSum=rawSeo.reduce((s,r)=>s+Number(r.position_sum),0),branded=rawSeo.filter(r=>r.is_branded).reduce((s,r)=>s+r.clicks,0);
  const revenue=total("revenue"), grossProfit=rawProjects.every(p=>p.gross_margin!==null)?rawProjects.reduce((s,p)=>s+Number(p.project_value??0)*Number(p.gross_margin??0),0):null;
  return {company,periodLabel:`${fromDate} — ${toDate}`,comparisonLabel:"vs previous period",metrics:{spend:total("spend"),leads:rawLeads.length,qualified:total("qualified"),visits:total("visits"),quotes:rawQuotes.length,won:rawProjects.filter(p=>p.status==="won").length,revenue,grossProfit},previous:{spend:0,leads:0,qualified:0,visits:0,quotes:0,won:0,revenue:0},channels,leads,services,campaigns,trend,locations,website,seo:{impressions:seoImpressions,clicks:seoClicks,ctr:seoImpressions?seoClicks/seoImpressions*100:0,position:seoImpressions?positionSum/seoImpressions:0,brandedShare:seoClicks?branded/seoClicks*100:0},integrations:((integrationsRes.data??[]) as unknown as RawIntegration[]).map(i=>({id:i.id,provider:i.provider,name:providerName(i.provider),status:i.status==="connected"?"Connected":i.status==="connecting"?"Connecting":i.status==="error"?"Error":"Not connected",lastSuccess:i.last_successful_sync,lastAttempt:i.last_attempted_sync,records:(i.sync_logs??[]).reduce((s,l)=>s+l.records_imported,0),resource:integrationResource(i.provider,i.configuration),errorMessage:i.error_message})),dataHealth:{missingSource:rawLeads.filter(l=>!l.source&&!l.channel_id).length,missingService:rawLeads.filter(l=>!l.service_id).length,missingCampaign:rawLeads.filter(l=>!l.campaign_id).length,wonMissingRevenue:rawProjects.filter(p=>p.status==="won"&&!p.project_value).length,duplicates:0,campaignsWithoutSpend:Math.max(0,((campaignsRes.data??[]).length-new Set(rawMetrics.filter(m=>Number(m.spend)>0).map(m=>m.campaign_id)).size)),daysSinceSync:null}};
}

async function accessibleLeadIds(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,companyId:string,from:string,to:string){const {data}=await supabase.from("leads").select("id").eq("company_id",companyId).gte("created_at",from).lte("created_at",to);const ids=(data??[]).map(r=>r.id);return ids.length?ids:["00000000-0000-0000-0000-000000000000"];}
function sum<T>(rows:T[],key:keyof T){return rows.reduce((s,row)=>s+Number(row[key]??0),0);}
function mapLeads(rows:RawLead[],quotes:Map<string,RawQuote>,projects:Map<string,RawProject>):Lead[]{return rows.map(row=>{const q=quotes.get(row.id),p=projects.get(row.id);return{id:row.id,date:row.created_at.slice(0,10),name:row.name,email:row.email??"",phone:row.phone??"",source:row.source??"Unattributed",campaign:row.campaigns?.name??"—",ad:row.ads?.name??"—",service:row.services?.name??"Unassigned",municipality:row.municipality??"Unknown",quality:row.lead_quality??"C",stage:row.sales_stage.split("_").map(v=>v[0].toUpperCase()+v.slice(1)).join(" "),quoteValue:q?Number(q.quote_value):null,wonRevenue:p?.project_value?Number(p.project_value):null,salesperson:row.users?.full_name??"Unassigned",daysOpen:Math.max(0,Math.floor((Date.now()-new Date(row.created_at).getTime())/86400000)),notes:row.notes??"",utm:[row.utm_source&&`utm_source=${row.utm_source}`,row.utm_medium&&`utm_medium=${row.utm_medium}`,row.utm_campaign&&`utm_campaign=${row.utm_campaign}`,row.utm_content&&`utm_content=${row.utm_content}`,row.utm_term&&`utm_term=${row.utm_term}`].filter(Boolean).join("&")};});}
function buildServices(rows:{id:string;name:string;default_gross_margin:number|null}[],metrics:RawMetric[],leads:RawLead[],projects:RawProject[],quotes:Map<string,RawQuote>):ServiceMetric[]{return rows.map(s=>{const ls=leads.filter(l=>l.service_id===s.id),ps=projects.filter(p=>p.service_id===s.id&&p.status==="won");return{id:s.id,name:s.name,spend:metrics.filter(m=>m.service_id===s.id).reduce((n,m)=>n+Number(m.spend),0),leads:ls.length,qualified:ls.filter(l=>["qualified","visit_booked","visit_completed","quote_sent","won"].includes(l.sales_stage)).length,visits:ls.filter(l=>["visit_completed","quote_sent","won"].includes(l.sales_stage)).length,quotes:ls.filter(l=>quotes.has(l.id)).length,won:ps.length,revenue:ps.reduce((n,p)=>n+Number(p.project_value??0),0),grossMargin:s.default_gross_margin===null?null:Number(s.default_gross_margin)*100};});}
function buildCampaigns(rows:{id:string;name:string;channel_id:string;marketing_channels:{name:string}|null}[],metrics:RawMetric[],leads:RawLead[],revenues:RawRevenue[],projects:Map<string,RawProject>):CampaignMetric[]{return rows.map(c=>{const ms=metrics.filter(m=>m.campaign_id===c.id),ls=leads.filter(l=>l.campaign_id===c.id);return{id:c.id,name:c.name,channel:c.marketing_channels?.name??"Unknown",childLabel:"Drill-down available",spend:ms.reduce((n,m)=>n+Number(m.spend),0),impressions:ms.reduce((n,m)=>n+m.impressions,0),clicks:ms.reduce((n,m)=>n+m.clicks,0),leads:ls.length,qualified:ls.filter(l=>["qualified","visit_booked","visit_completed","quote_sent","won"].includes(l.sales_stage)).length,visits:ls.filter(l=>["visit_completed","quote_sent","won"].includes(l.sales_stage)).length,won:ls.filter(l=>projects.get(l.id)?.status==="won").length,revenue:revenues.filter(r=>r.campaign_id===c.id).reduce((n,r)=>n+Number(r.attributed_revenue),0),angle:"Unclassified"};});}
function buildTrend(metrics:RawMetric[],leads:RawLead[],revenues:RawRevenue[],projects:Map<string,RawProject>,website:RawWebsite[]):TrendPoint[]{const dates=[...new Set([...metrics.map(m=>m.date),...website.map(w=>w.date)])].sort();return dates.map(date=>{const ms=metrics.filter(m=>m.date===date),ls=leads.filter(l=>l.created_at.startsWith(date)),spend=ms.reduce((n,m)=>n+Number(m.spend),0),won=ls.filter(l=>projects.get(l.id)?.status==="won").length,revenue=revenues.filter(r=>r.attributed_at.startsWith(date)).reduce((n,r)=>n+Number(r.attributed_revenue),0),qualified=ls.filter(l=>l.lead_quality==="A"||l.lead_quality==="B").length;return{date,spend,leads:ls.length,qualified,revenue,cpl:ls.length?spend/ls.length:0,cac:won?spend/won:0,roas:spend?revenue/spend:0,sessions:website.filter(w=>w.date===date).reduce((n,w)=>n+w.sessions,0),conversions:ls.length};});}
function buildLocations(leads:RawLead[],metrics:RawMetric[],projects:Map<string,RawProject>):LocationMetric[]{const names=[...new Set(leads.map(l=>l.municipality??"Unknown"))];const spend=metrics.reduce((n,m)=>n+Number(m.spend),0);return names.map(name=>{const ls=leads.filter(l=>(l.municipality??"Unknown")===name),ps=ls.map(l=>projects.get(l.id)).filter((p):p is RawProject=>Boolean(p&&p.status==="won"));return{municipality:name,leads:ls.length,qualified:ls.filter(l=>l.lead_quality==="A"||l.lead_quality==="B").length,won:ps.length,revenue:ps.reduce((n,p)=>n+Number(p.project_value??0),0),spend:leads.length?spend*(ls.length/leads.length):0};});}
function providerName(provider:string){return({meta:"Meta Ads",google_ads:"Google Ads",ga4:"Google Analytics 4",search_console:"Google Search Console",google_business:"Google Business Profile",monday:"CRM / Monday",hubspot:"CRM / HubSpot",website_forms:"Website forms"} as Record<string,string>)[provider]??provider;}
function integrationResource(provider:string,configuration:Record<string,unknown>){const keys=({meta:["ad_account_name","ad_account_id"],google_ads:["customer_name","customer_id"],ga4:["property_name","property_id"],search_console:["site_url"],google_business:["location_name","location_id"],monday:["board_name","board_id"],hubspot:["portal_name","portal_id"],website_forms:["endpoint_name"]} as Record<string,string[]>)[provider]??[];for(const key of keys){const value=configuration?.[key];if(typeof value==="string"&&value.trim())return value;}return "Not selected";}
