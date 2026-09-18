import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { aggregateGa4WebsiteMetrics } from "@/lib/metrics/website";
import { demoCompanies, demoDatasets } from "./demo";
import type { CampaignMetric, ChannelMetric, Company, CompanyDataset, Integration, Lead, LocationMetric, ServiceMetric, TrendPoint } from "./types";

export type DashboardBootstrap = {
  mode: "demo" | "live";
  companies: Company[];
  datasets: Record<string, CompanyDataset>;
  selectedMonth: string;
  availableMonths: string[];
};

type DashboardPeriod = {
  selectedMonth: string;
  fromDate: string;
  toDate: string;
  fromIso: string;
  toIso: string;
};

export async function getDashboardBootstrap(month = "ytd"): Promise<DashboardBootstrap> {
  const period = dashboardPeriod(month);
  if (!hasSupabaseConfig()) {
    return { mode: "demo", companies: demoCompanies, datasets: demoDatasets, selectedMonth: period.selectedMonth, availableMonths: availableDashboardMonths() };
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

  const loaded = await Promise.all(companies.map(async (company) => [company.id, await loadLiveDataset(supabase, company, period)] as const));
  const datasets = Object.fromEntries(loaded);
  return { mode: "live", companies, datasets, selectedMonth: period.selectedMonth, availableMonths: availableDashboardMonths() };
}

type RawMetric = { date:string; spend:number|string; impressions:number; clicks:number; platform_conversions:number|string; channel_id:string; campaign_id:string|null; service_id:string|null; marketing_channels:{name:string}|null; campaigns:{name:string}|null; services:{name:string}|null };
type RawLead = { id:string; created_at:string; name:string; email:string|null; phone:string|null; source:string|null; channel_id:string|null; campaign_id:string|null; ad_id:string|null; service_id:string|null; municipality:string|null; lead_quality:"A"|"B"|"C"|null; sales_stage:string; crm_status:string|null; commercial_status:string|null; commercial_attribution_status:string|null; robaws_match_method:string|null; robaws_client_id:string|null; attributed_acquisition_cost:number|string|null; attribution_level:string|null; assigned_to:string|null; utm_source:string|null; utm_medium:string|null; utm_campaign:string|null; utm_content:string|null; utm_term:string|null; notes:string|null; campaigns:{name:string}|null; services:{name:string}|null; ads:{name:string}|null; users:{full_name:string}|null };
type RawAppointment = { lead_id:string; scheduled_at:string; completed_at:string|null; status:string; no_show:boolean };
type RawQuote = { id:string; lead_id:string; quote_number:string; quote_value:number|string; quote_value_incl_vat:number|string|null; created_at:string; status:string; accepted_at:string|null; external_source:string|null; project_external_id:string|null; attribution_status:string|null };
type RawProject = { id:string; lead_id:string; service_id:string|null; project_value:number|string|null; project_value_excl_vat:number|string|null; gross_margin:number|string|null; status:string; won_at:string|null; crm_source:string|null; crm_external_id:string|null; external_status:string|null; attribution_status:string|null };
type RawCommercialInvoice = { id:string; lead_id:string|null; invoice_number:string|null; invoice_date:string|null; status:string|null; document_id:string|null; total_excl_vat:number|string|null; total_incl_vat:number|string|null; paid_total:number|string|null; credited_total:number|string|null; attribution_status:string|null };
type RawCrmDeal = {
  id:string;
  name:string;
  stage:string|null;
  pipeline_group:string|null;
  deal_value:number|string|null;
  offer_status:string|null;
  offer_number:string|null;
  lost_reason:string|null;
  linked_lead_id:string|null;
  created_at_external:string|null;
};

type RawWebsite = { company_id:string; date:string; users:number; sessions:number; new_users:number; engaged_sessions:number; form_submissions:number; whatsapp_clicks:number; phone_clicks:number; quote_requests:number };
type RawSeo = { impressions:number; clicks:number; position_sum:number|string; is_branded:boolean|null };
type RawGbp = { profile_views:number; website_clicks:number; calls:number; direction_requests:number; messages:number; searches:number; reviews:number; rating_sum:number|string };
type RawIntegration = { id:string; provider:Integration["provider"]; status:"connected"|"connecting"|"not_connected"|"error"; configuration:Record<string,unknown>; error_message:string|null; last_successful_sync:string|null; last_attempted_sync:string|null; sync_logs:{records_imported:number}[]|null };

async function loadLiveDataset(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, company: Company, period: DashboardPeriod): Promise<CompanyDataset> {
  const { fromIso, toIso, fromDate, toDate } = period;
  const [metricsRes, leadsRes, appointmentsRes, quotesRes, projectsRes, invoicesRes, crmDealsRes, servicesRes, campaignsRes, websiteRes, seoRes, integrationsRes] = await Promise.all([
    supabase.from("daily_marketing_metrics").select("date,spend,impressions,clicks,platform_conversions,channel_id,campaign_id,service_id,marketing_channels(name),campaigns(name),services(name)").eq("company_id",company.id).gte("date",fromDate).lte("date",toDate),
    supabase.from("leads").select("id,created_at,name,email,phone,source,channel_id,campaign_id,ad_id,service_id,municipality,lead_quality,sales_stage,crm_status,commercial_status,commercial_attribution_status,robaws_match_method,robaws_client_id,attributed_acquisition_cost,attribution_level,assigned_to,utm_source,utm_medium,utm_campaign,utm_content,utm_term,notes,campaigns(name),services(name),ads(name),users!leads_assigned_to_fkey(full_name)").eq("company_id",company.id).gte("created_at",fromIso).lte("created_at",toIso),
    supabase.from("appointments").select("lead_id,scheduled_at,completed_at,status,no_show").in("lead_id", await accessibleLeadIds(supabase, company.id, fromIso, toIso)),
    supabase.from("quotes").select("id,lead_id,quote_number,quote_value,quote_value_incl_vat,created_at,status,accepted_at,external_source,project_external_id,attribution_status").in("lead_id", await accessibleLeadIds(supabase, company.id, fromIso, toIso)),
    supabase.from("projects").select("id,lead_id,service_id,project_value,project_value_excl_vat,gross_margin,status,won_at,crm_source,crm_external_id,external_status,attribution_status").in("lead_id", await accessibleLeadIds(supabase, company.id, fromIso, toIso)),
    supabase.from("commercial_invoices").select("id,lead_id,invoice_number,invoice_date,status,document_id,total_excl_vat,total_incl_vat,paid_total,credited_total,attribution_status").eq("company_id",company.id).gte("invoice_date",fromDate).lte("invoice_date",toDate),
    supabase.from("crm_deals").select("id,name,stage,pipeline_group,deal_value,offer_status,offer_number,lost_reason,linked_lead_id,created_at_external").eq("company_id",company.id).gte("created_at_external",fromIso).lte("created_at_external",toIso),
    supabase.from("services").select("id,name,default_gross_margin").eq("company_id",company.id).eq("is_active",true),
    supabase.from("campaigns").select("id,name,channel_id,marketing_channels(name)").eq("company_id",company.id),
    supabase.from("website_metrics").select("company_id,date,users,sessions,new_users,engaged_sessions,form_submissions,whatsapp_clicks,phone_clicks,quote_requests").eq("company_id",company.id).gte("date",fromDate).lte("date",toDate),
    supabase.from("seo_metrics").select("impressions,clicks,position_sum,is_branded").eq("company_id",company.id).gte("date",fromDate).lte("date",toDate),
    supabase.from("reporting_integration_connections").select("id,provider,status,configuration,error_message,last_successful_sync,last_attempted_sync,sync_logs(records_imported)").eq("company_id",company.id),
  ]);
  const firstError = [metricsRes,leadsRes,appointmentsRes,quotesRes,projectsRes,invoicesRes,crmDealsRes,servicesRes,campaignsRes,websiteRes,seoRes,integrationsRes].find(result => result.error)?.error;
  if (firstError) throw new Error(`Unable to load reporting facts: ${firstError.message}`);

  const rawMetrics = (metricsRes.data ?? []) as unknown as RawMetric[];
  const rawLeads = (leadsRes.data ?? []) as unknown as RawLead[];
  const rawAppointments = (appointmentsRes.data ?? []) as unknown as RawAppointment[];
  const rawQuotes = (quotesRes.data ?? []) as unknown as RawQuote[];
  const rawProjects = (projectsRes.data ?? []) as unknown as RawProject[];
  const rawInvoices = (invoicesRes.data ?? []) as unknown as RawCommercialInvoice[];
  const rawCrmDeals = (crmDealsRes.data ?? []) as unknown as RawCrmDeal[];
  const rawWebsite = (websiteRes.data ?? []) as unknown as RawWebsite[];
  const rawSeo = (seoRes.data ?? []) as unknown as RawSeo[];
  // Keep commercial truth visible, but only use documents that are safe to
  // attribute to the CRM lead for marketing/source performance.
  const attributableQuotes = rawQuotes.filter(quote => !isDateConflict(quote.attribution_status));
  const attributableProjects = rawProjects.filter(project => !isDateConflict(project.attribution_status));
  const quoteByLead = latestQuoteByLead(attributableQuotes);
  const projectByLead = aggregateProjectsByLead(attributableProjects);
  const leads = mapLeads(rawLeads,quoteByLead,projectByLead);
  const leadById = new Map(leads.map(lead => [lead.id, lead]));
  const rawLeadById = new Map(rawLeads.map(lead => [lead.id, lead]));
  const commercialOffers = rawQuotes
    .filter(quote => quote.external_source === "robaws")
    .map(quote => {
      const lead = leadById.get(quote.lead_id);
      const outcome = offerOutcome(quote.status);
      const offerDate = quote.created_at.slice(0, 10);

      return {
        id: quote.id,
        leadId: quote.lead_id,
        leadName: lead?.name ?? "Unknown lead",
        source: lead?.source ?? "Unattributed",
        date: offerDate,
        number: quote.quote_number,
        status: quote.status || "Unknown",
        priceInclVat: Number(quote.quote_value_incl_vat ?? 0),
        priceExclVat: Number(quote.quote_value ?? 0),
        projectExternalId: quote.project_external_id,
        attributionStatus: quote.attribution_status ?? "UNVERIFIED",
        isOpen: outcome === "open",
        isAccepted: outcome === "accepted",
        isRejected: outcome === "rejected",
        daysWaiting: outcome === "open" ? daysBetween(offerDate, toIso) : null,
      };
    });
  const commercialProjects = rawProjects
    .filter(project => project.crm_source === "robaws")
    .map(project => {
      const lead = leadById.get(project.lead_id);

      return {
        id: project.id,
        leadId: project.lead_id,
        leadName: lead?.name ?? "Unknown lead",
        source: lead?.source ?? "Unattributed",
        externalId: project.crm_external_id ?? "—",
        status: project.external_status ?? project.status,
        valueInclVat: project.project_value === null ? null : Number(project.project_value),
        valueExclVat: project.project_value_excl_vat === null ? null : Number(project.project_value_excl_vat),
        attributionStatus: project.attribution_status ?? "UNVERIFIED",
      };
    });
  const commercialInvoices = rawInvoices.map(invoice => {
    const lead = invoice.lead_id ? leadById.get(invoice.lead_id) : undefined;

    return {
      id: invoice.id,
      leadId: invoice.lead_id,
      leadName: lead?.name ?? "Unmatched invoice",
      source: lead?.source ?? "Unattributed",
      date: invoice.invoice_date ?? "",
      number: invoice.invoice_number ?? "—",
      status: invoice.status ?? "Unknown",
      totalInclVat: Number(invoice.total_incl_vat ?? 0),
      totalExclVat: Number(invoice.total_excl_vat ?? 0),
      paidTotal: Number(invoice.paid_total ?? 0),
      creditedTotal: Number(invoice.credited_total ?? 0),
      projectExternalId: invoice.document_id,
      attributionStatus: invoice.attribution_status ?? "UNVERIFIED",
    };
  });
  const appointmentLeadIds = [...new Set(rawAppointments.map(row => row.lead_id))];
  const channelMap = new Map<string,ChannelMetric>();
  for (const row of rawMetrics) { const id=row.channel_id; const item=channelMap.get(id)??{id,channel:row.marketing_channels?.name??"Unknown",spend:0,impressions:0,clicks:0,platformConversions:0,leads:0,qualified:0,visits:0,quotes:0,won:0,revenue:0}; item.spend+=Number(row.spend); item.impressions+=row.impressions; item.clicks+=row.clicks; item.platformConversions+=Number(row.platform_conversions); channelMap.set(id,item); }
  for (const lead of rawLeads) { if(!lead.channel_id) continue; const item=channelMap.get(lead.channel_id); if(!item) continue; item.leads++; if(["qualified","visit_booked","visit_completed","quote_sent","won"].includes(lead.sales_stage)) item.qualified++; if(["visit_completed","quote_sent","won"].includes(lead.sales_stage)) item.visits++; if(["quote_sent","won"].includes(lead.sales_stage)||quoteByLead.has(lead.id)) item.quotes++; if(projectByLead.get(lead.id)?.status==="won"||lead.sales_stage==="won") item.won++; }
  for (const project of attributableProjects) {
    const lead = rawLeadById.get(project.lead_id);
    if (!lead?.channel_id) continue;
    const item = channelMap.get(lead.channel_id);
    if (item) item.revenue += Number(project.project_value ?? 0);
  }
  const channels=[...channelMap.values()];
  const total=(key:keyof Pick<ChannelMetric,"spend"|"leads"|"qualified"|"visits"|"quotes"|"won"|"revenue">)=>channels.reduce((s,r)=>s+Number(r[key]),0);
  const services = buildServices((servicesRes.data??[]) as unknown as {id:string;name:string;default_gross_margin:number|null}[],rawMetrics,rawLeads,attributableProjects,quoteByLead);
  const campaigns = buildCampaigns((campaignsRes.data??[]) as unknown as {id:string;name:string;channel_id:string;marketing_channels:{name:string}|null}[],rawMetrics,rawLeads,projectByLead);
  const trend = buildTrend(rawMetrics,rawLeads,attributableProjects,projectByLead,rawWebsite);
  const locations = buildLocations(rawLeads,rawMetrics,projectByLead);
  const leadSources = buildLeadSources(rawLeads,quoteByLead,projectByLead);
  const websiteTraffic = aggregateGa4WebsiteMetrics(rawWebsite.map(row => ({
    companyId: row.company_id,
    date: row.date,
    users: Number(row.users),
    sessions: Number(row.sessions),
    newUsers: Number(row.new_users),
    engagedSessions: Number(row.engaged_sessions),
  })), company.id, fromDate, toDate);
  const website={users:websiteTraffic.users,sessions:websiteTraffic.sessions,newUsers:websiteTraffic.newUsers,engagedSessions:websiteTraffic.engagedSessions,formSubmissions:sum(rawWebsite,"form_submissions"),whatsappClicks:sum(rawWebsite,"whatsapp_clicks"),phoneClicks:sum(rawWebsite,"phone_clicks"),quoteRequests:sum(rawWebsite,"quote_requests")};
  const seoImpressions=sum(rawSeo,"impressions"),seoClicks=sum(rawSeo,"clicks"),positionSum=rawSeo.reduce((s,r)=>s+Number(r.position_sum),0),branded=rawSeo.filter(r=>r.is_branded).reduce((s,r)=>s+r.clicks,0);
  const commercialDeals = rawCrmDeals.map(deal => ({
    id: deal.id,
    name: deal.name,
    stage: deal.stage ?? "open",
    pipelineGroup: deal.pipeline_group ?? "—",
    value:
      deal.deal_value === null
        ? null
        : Number(deal.deal_value),
    offerStatus: deal.offer_status ?? "—",
    offerNumber: deal.offer_number ?? "—",
    lostReason: deal.lost_reason ?? "—",
    linkedLeadId: deal.linked_lead_id,
  }));

  const wonLeadIds = new Set(
    rawLeads
      .filter(lead => lead.sales_stage === "won")
      .map(lead => lead.id)
      .concat(
        attributableProjects
          .filter(project => project.status === "won")
          .map(project => project.lead_id),
      ),
  );

  const quoteLeadIds = new Set(
    attributableQuotes.map(quote => quote.lead_id)
      .concat(
        rawLeads
          .filter(
            lead =>
              ["quote_sent", "won"].includes(
                lead.sales_stage,
              ) ||
              isQuoteOutcomeStatus(
                lead.crm_status,
              ),
          )
          .map(lead => lead.id),
      ),
  );

  const revenue=attributableProjects.reduce((sum, project) => sum + Number(project.project_value ?? 0), 0), grossProfit=attributableProjects.every(p=>p.gross_margin!==null)?attributableProjects.reduce((s,p)=>s+Number(p.project_value??0)*Number(p.gross_margin??0),0):null;
  return {company,periodLabel:`${fromDate} — ${toDate}`,comparisonLabel:"vs previous period",metrics:{spend:total("spend"),leads:rawLeads.length,qualified:total("qualified"),visits:total("visits"),quotes:quoteLeadIds.size,won:wonLeadIds.size,revenue,grossProfit},previous:{spend:0,leads:0,qualified:0,visits:0,quotes:0,won:0,revenue:0},channels,leadSources,commercialDeals,commercialOffers,commercialProjects,commercialInvoices,appointmentLeadIds,leads,services,campaigns,trend,locations,website,seo:{impressions:seoImpressions,clicks:seoClicks,ctr:seoImpressions?seoClicks/seoImpressions*100:0,position:seoImpressions?positionSum/seoImpressions:0,brandedShare:seoClicks?branded/seoClicks*100:0},integrations:((integrationsRes.data??[]) as unknown as RawIntegration[]).map(i=>({id:i.id,provider:i.provider,name:providerName(i.provider),status:i.status==="connected"?"Connected":i.status==="connecting"?"Connecting":i.status==="error"?"Error":"Not connected",lastSuccess:i.last_successful_sync,lastAttempt:i.last_attempted_sync,records:(i.sync_logs??[]).reduce((s,l)=>s+l.records_imported,0),resource:integrationResource(i.provider,i.configuration),errorMessage:i.error_message,metaPermissionStatus:metaPermissionStatus(i.provider,i.configuration),metaMissingPermissions:metaMissingPermissions(i.provider,i.configuration)})),dataHealth:{missingSource:rawLeads.filter(l=>!l.source&&!l.channel_id).length,missingService:rawLeads.filter(l=>!l.service_id).length,missingCampaign:rawLeads.filter(l=>!l.campaign_id).length,wonMissingRevenue:rawProjects.filter(p=>p.status==="won"&&!p.project_value).length,duplicates:0,campaignsWithoutSpend:Math.max(0,((campaignsRes.data??[]).length-new Set(rawMetrics.filter(m=>Number(m.spend)>0).map(m=>m.campaign_id)).size)),daysSinceSync:null}};
}

function isDateConflict(status: string | null | undefined) {
  return String(status ?? "").trim().toLowerCase().includes("date_conflict");
}

function latestQuoteByLead(rows: RawQuote[]) {
  const map = new Map<string, RawQuote>();

  for (const row of rows) {
    const existing = map.get(row.lead_id);
    if (!existing || (row.created_at ?? "").localeCompare(existing.created_at ?? "") > 0) {
      map.set(row.lead_id, row);
    }
  }

  return map;
}

function aggregateProjectsByLead(rows: RawProject[]) {
  const map = new Map<string, RawProject>();

  for (const row of rows) {
    const existing = map.get(row.lead_id);
    if (!existing) {
      map.set(row.lead_id, { ...row });
      continue;
    }

    const existingWonAt = existing.won_at ?? "";
    const rowWonAt = row.won_at ?? "";
    const newest = rowWonAt.localeCompare(existingWonAt) > 0 ? row : existing;

    map.set(row.lead_id, {
      ...newest,
      id: existing.id,
      lead_id: row.lead_id,
      project_value: Number(existing.project_value ?? 0) + Number(row.project_value ?? 0),
      project_value_excl_vat: Number(existing.project_value_excl_vat ?? 0) + Number(row.project_value_excl_vat ?? 0),
      status: existing.status === "won" || row.status === "won" ? "won" : newest.status,
      gross_margin: null,
    });
  }

  return map;
}

function offerOutcome(status: string) {
  const value = status.trim().toLowerCase();

  if (["goedgekeurd", "gefactureerd", "deelfactuur", "accepted", "approved"].includes(value)) {
    return "accepted" as const;
  }

  if (["afgekeurd", "rejected", "declined"].includes(value)) {
    return "rejected" as const;
  }

  return "open" as const;
}

function daysBetween(from: string, to: string) {
  const start = new Date(`${from}T00:00:00+02:00`).getTime();
  const end = new Date(to).getTime();
  return Math.max(0, Math.floor((end - start) / 86400000));
}

async function accessibleLeadIds(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,companyId:string,from:string,to:string){const {data}=await supabase.from("leads").select("id").eq("company_id",companyId).gte("created_at",from).lte("created_at",to);const ids=(data??[]).map(r=>r.id);return ids.length?ids:["00000000-0000-0000-0000-000000000000"];}
function sum<T>(rows:T[],key:keyof T){return rows.reduce((s,row)=>s+Number(row[key]??0),0);}
function mapLeads(
  rows: RawLead[],
  quotes: Map<string,RawQuote>,
  projects: Map<string,RawProject>,
): Lead[] {
  return rows.map(row => {
    const q = quotes.get(row.id);
    const p = projects.get(row.id);

    const normalizedStage = row.sales_stage
      .split("_")
      .map(v => v[0].toUpperCase() + v.slice(1))
      .join(" ");

    const isClient =
      p?.status === "won" ||
      row.sales_stage === "won" ||
      row.commercial_status === "CLIENT_WON";

    let commercialStatus =
      row.commercial_status ??
      "NOT_VERIFIED";

    if (isClient) {
      commercialStatus = "CLIENT_WON";
    } else if (q?.accepted_at) {
      commercialStatus = "CLIENT_WON";
    } else if (q) {
      const status = (q.status ?? "").toLowerCase();

      if (
        status.includes("lost") ||
        status.includes("reject") ||
        status.includes("afgekeurd")
      ) {
        commercialStatus = "OFFER_LOST";
      } else {
        commercialStatus = "OFFER_SENT";
      }
    }

    return {
      id: row.id,
      date: row.created_at.slice(0,10),
      name: row.name,
      email: row.email ?? "",
      phone: row.phone ?? "",
      source: row.source ?? "Unattributed",
      campaign: row.campaigns?.name ?? "—",
      ad: row.ads?.name ?? "—",
      service: row.services?.name ?? "Unassigned",
      municipality: row.municipality ?? "Unknown",
      quality: row.lead_quality ?? "C",
      stage: normalizedStage,
      crmStatus: row.crm_status ?? "—",
      commercialStatus,
      robawsMatchMethod:
        row.robaws_match_method ?? "—",
      robawsClientId:
        row.robaws_client_id ?? "—",
      quoteNumber:
        q?.quote_number ?? "—",
      quoteStatus:
        q?.status ?? "—",
      quoteValue:
        q ? Number(q.quote_value) : null,
      isClient,
      wonRevenue:
        p?.project_value
          ? Number(p.project_value)
          : null,
      acquisitionCost:
        row.attributed_acquisition_cost === null
          ? null
          : Number(row.attributed_acquisition_cost),
      attributionLevel:
        row.commercial_attribution_status ??
        row.attribution_level ??
        "—",
      salesperson:
        row.users?.full_name ?? "Unassigned",
      daysOpen:
        Math.max(
          0,
          Math.floor(
            (
              Date.now() -
              new Date(row.created_at).getTime()
            ) / 86400000
          )
        ),
      notes: row.notes ?? "",
      utm: [
        row.utm_source &&
          `utm_source=${row.utm_source}`,
        row.utm_medium &&
          `utm_medium=${row.utm_medium}`,
        row.utm_campaign &&
          `utm_campaign=${row.utm_campaign}`,
        row.utm_content &&
          `utm_content=${row.utm_content}`,
        row.utm_term &&
          `utm_term=${row.utm_term}`,
      ].filter(Boolean).join("&"),
    };
  });
}

function isQuoteOutcomeStatus(
  value: string | null,
) {
  const status = (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

  return [
    "offer sent",
    "email offerte",
    "offerte afgekeurd",
    "signed",
    "proposal sent",
    "negotiation",
    "contract signed",
    "closed won",
    "closed lost",
  ].some(item => status.includes(item));
}

function buildLeadSources(
  leads: RawLead[],
  quotes: Map<string,RawQuote>,
  projects: Map<string,RawProject>,
): CompanyDataset["leadSources"] {
  const map = new Map<
    string,
    CompanyDataset["leadSources"][number]
  >();

  for (const lead of leads) {
    const source =
      lead.source?.trim() || "Unattributed";

    const row = map.get(source) ?? {
      source,
      leads: 0,
      qualified: 0,
      visits: 0,
      quotes: 0,
      won: 0,
      revenue: 0,
    };

    row.leads += 1;

    if (
      [
        "qualified",
        "visit_booked",
        "visit_completed",
        "quote_sent",
        "won",
      ].includes(lead.sales_stage)
    ) {
      row.qualified += 1;
    }

    if (
      [
        "visit_completed",
        "quote_sent",
        "won",
      ].includes(lead.sales_stage)
    ) {
      row.visits += 1;
    }

    if (
      quotes.has(lead.id) ||
      ["quote_sent", "won"].includes(lead.sales_stage) ||
      isQuoteOutcomeStatus(lead.crm_status)
    ) {
      row.quotes += 1;
    }

    const project = projects.get(lead.id);

    if (
      project?.status === "won" ||
      lead.sales_stage === "won"
    ) {
      row.won += 1;
    }

    row.revenue += Number(
      project?.project_value ?? 0
    );

    map.set(source, row);
  }

  return [...map.values()]
    .sort((a, b) => b.leads - a.leads);
}

function buildServices(rows:{id:string;name:string;default_gross_margin:number|null}[],metrics:RawMetric[],leads:RawLead[],projects:RawProject[],quotes:Map<string,RawQuote>):ServiceMetric[]{return rows.map(s=>{const ls=leads.filter(l=>l.service_id===s.id),ps=projects.filter(p=>p.service_id===s.id&&p.status==="won");return{id:s.id,name:s.name,spend:metrics.filter(m=>m.service_id===s.id).reduce((n,m)=>n+Number(m.spend),0),leads:ls.length,qualified:ls.filter(l=>["qualified","visit_booked","visit_completed","quote_sent","won"].includes(l.sales_stage)).length,visits:ls.filter(l=>["visit_completed","quote_sent","won"].includes(l.sales_stage)).length,quotes:ls.filter(l=>quotes.has(l.id)).length,won:ps.length,revenue:ps.reduce((n,p)=>n+Number(p.project_value??0),0),grossMargin:s.default_gross_margin===null?null:Number(s.default_gross_margin)*100};});}
function buildCampaigns(rows:{id:string;name:string;channel_id:string;marketing_channels:{name:string}|null}[],metrics:RawMetric[],leads:RawLead[],projects:Map<string,RawProject>):CampaignMetric[]{return rows.map(c=>{const ms=metrics.filter(m=>m.campaign_id===c.id),ls=leads.filter(l=>l.campaign_id===c.id);return{id:c.id,name:c.name,channel:c.marketing_channels?.name??"Unknown",childLabel:"Drill-down available",spend:ms.reduce((n,m)=>n+Number(m.spend),0),impressions:ms.reduce((n,m)=>n+m.impressions,0),clicks:ms.reduce((n,m)=>n+m.clicks,0),leads:ls.length,qualified:ls.filter(l=>["qualified","visit_booked","visit_completed","quote_sent","won"].includes(l.sales_stage)).length,visits:ls.filter(l=>["visit_completed","quote_sent","won"].includes(l.sales_stage)).length,won:ls.filter(l=>projects.get(l.id)?.status==="won").length,revenue:ls.reduce((n,l)=>n+Number(projects.get(l.id)?.project_value??0),0),angle:"Unclassified"};});}
function buildTrend(metrics:RawMetric[],leads:RawLead[],projectRows:RawProject[],projects:Map<string,RawProject>,website:RawWebsite[]):TrendPoint[]{const dates=[...new Set([...metrics.map(m=>m.date),...website.map(w=>w.date),...projectRows.flatMap(p=>p.won_at?[p.won_at.slice(0,10)]:[])])].sort();return dates.map(date=>{const ms=metrics.filter(m=>m.date===date),ls=leads.filter(l=>l.created_at.startsWith(date)),spend=ms.reduce((n,m)=>n+Number(m.spend),0),won=ls.filter(l=>projects.get(l.id)?.status==="won").length,revenue=projectRows.filter(p=>p.won_at?.startsWith(date)).reduce((n,p)=>n+Number(p.project_value??0),0),qualified=ls.filter(l=>l.lead_quality==="A"||l.lead_quality==="B").length;return{date,spend,leads:ls.length,qualified,revenue,cpl:ls.length?spend/ls.length:0,cac:won?spend/won:0,roas:spend?revenue/spend:0,sessions:website.filter(w=>w.date===date).reduce((n,w)=>n+w.sessions,0),conversions:ls.length};});}
function buildLocations(leads:RawLead[],metrics:RawMetric[],projects:Map<string,RawProject>):LocationMetric[]{const names=[...new Set(leads.map(l=>l.municipality??"Unknown"))];const spend=metrics.reduce((n,m)=>n+Number(m.spend),0);return names.map(name=>{const ls=leads.filter(l=>(l.municipality??"Unknown")===name),ps=ls.map(l=>projects.get(l.id)).filter((p):p is RawProject=>Boolean(p&&p.status==="won"));return{municipality:name,leads:ls.length,qualified:ls.filter(l=>l.lead_quality==="A"||l.lead_quality==="B").length,won:ps.length,revenue:ps.reduce((n,p)=>n+Number(p.project_value??0),0),spend:leads.length?spend*(ls.length/leads.length):0};});}
function providerName(provider:string){return({meta:"Meta Ads",google_ads:"Google Ads",ga4:"Google Analytics 4",search_console:"Google Search Console",google_business:"Google Business Profile",monday:"CRM / Monday",hubspot:"CRM / HubSpot",robaws:"ROBAWS",website_forms:"Website forms"} as Record<string,string>)[provider]??provider;}
function integrationResource(provider:string,configuration:Record<string,unknown>){const keys=({meta:["ad_account_name","ad_account_id"],google_ads:["customer_name","customer_id"],ga4:["property_name","property_id"],search_console:["site_url"],google_business:["location_name","location_id"],monday:["board_name","board_id"],hubspot:["portal_name","portal_id"],robaws:["account_name"],website_forms:["endpoint_name"]} as Record<string,string[]>)[provider]??[];for(const key of keys){const value=configuration?.[key];if(typeof value==="string"&&value.trim())return value;}return "Not selected";}
function metaPermissionStatus(provider:string,configuration:Record<string,unknown>):Integration["metaPermissionStatus"]{if(provider!=="meta")return null;const value=configuration?.meta_permission_status;return value==="Ready"||value==="Missing permissions"||value==="App Review / Advanced Access required"?value:null;}
function metaMissingPermissions(provider:string,configuration:Record<string,unknown>){if(provider!=="meta"||!Array.isArray(configuration?.meta_missing_permissions))return[];return configuration.meta_missing_permissions.filter((value):value is string=>typeof value==="string");}
