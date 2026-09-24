import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { aggregateGa4WebsiteMetrics } from "@/lib/metrics/website";
import { demoCompanies, demoDatasets } from "./demo";
import type { BusinessDecisionData, CampaignMetric, ChannelMetric, Company, CompanyDataset, Integration, Lead, LocationMetric, ServiceMetric, TrendPoint } from "./types";

export type DashboardBootstrap = {
  mode: "demo" | "live";
  companies: Company[];
  datasets: Record<string, CompanyDataset>;
  selectedMonth: string;
  selectedCompanyId: string;
  availableMonths: string[];
};

type DashboardPeriod = {
  selectedMonth: string;
  fromDate: string;
  toDate: string;
  fromIso: string;
  toIso: string;
};

export type DashboardLoadProfile = "full" | "overview" | "commercial" | "website" | "health";

export async function getDashboardBootstrap(month = "ytd", companyId?: string, profile: DashboardLoadProfile = "full"): Promise<DashboardBootstrap> {
  const period = dashboardPeriod(month);
  if (!hasSupabaseConfig()) {
    const selectedCompanyId = demoCompanies.some(company => company.id === companyId) ? companyId! : (demoCompanies[0]?.id ?? "");
    const selectedDataset = selectedCompanyId ? { [selectedCompanyId]: demoDatasets[selectedCompanyId] } : {};
    return { mode: "demo", companies: demoCompanies, datasets: selectedDataset, selectedMonth: period.selectedMonth, selectedCompanyId, availableMonths: availableDashboardMonths() };
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

  const selectedCompany = companies.find(company => company.id === companyId) ?? companies[0];
  const selectedCompanyId = selectedCompany?.id ?? "";
  const datasets = selectedCompany
    ? { [selectedCompany.id]: await loadLiveDataset(supabase, selectedCompany, period, profile) }
    : {};
  return { mode: "live", companies, datasets, selectedMonth: period.selectedMonth, selectedCompanyId, availableMonths: availableDashboardMonths() };
}

type RawMetric = { date:string; spend:number|string; impressions:number; clicks:number; platform_conversions:number|string; channel_id:string; campaign_id:string|null; service_id:string|null; marketing_channels:{name:string}|null; campaigns:{name:string}|null; services:{name:string}|null };
type RawLead = { id:string; created_at:string; name:string; email:string|null; phone:string|null; source:string|null; channel_id:string|null; campaign_id:string|null; ad_id:string|null; service_id:string|null; municipality:string|null; lead_quality:"A"|"B"|"C"|null; sales_stage:string; crm_status:string|null; commercial_status:string|null; commercial_attribution_status:string|null; robaws_match_method:string|null; robaws_client_id:string|null; attributed_acquisition_cost:number|string|null; attribution_level:string|null; assigned_to:string|null; utm_source:string|null; utm_medium:string|null; utm_campaign:string|null; utm_content:string|null; utm_term:string|null; notes:string|null; campaigns:{name:string}|null; services:{name:string}|null; ads:{name:string}|null; users:{full_name:string}|null };
type RawAppointment = { lead_id:string; scheduled_at:string; completed_at:string|null; status:string; no_show:boolean };
type RawQuote = { id:string; lead_id:string; quote_number:string; quote_value:number|string; quote_value_incl_vat:number|string|null; created_at:string; sent_at:string|null; follow_up_at:string|null; status:string; accepted_at:string|null; external_source:string|null; project_external_id:string|null; attribution_status:string|null };
type RawProject = { id:string; lead_id:string; service_id:string|null; project_value:number|string|null; project_value_excl_vat:number|string|null; gross_margin:number|string|null; status:string; won_at:string|null; crm_source:string|null; crm_external_id:string|null; external_client_id:string|null; external_status:string|null; attribution_status:string|null };
type RawCommercialInvoice = { id:string; lead_id:string|null; external_client_id:string|null; invoice_number:string|null; invoice_date:string|null; status:string|null; document_id:string|null; total_excl_vat:number|string|null; total_incl_vat:number|string|null; paid_total:number|string|null; credited_total:number|string|null; attribution_status:string|null };
type RawCommercialClient = { id:string; external_source:string; external_id:string; name:string; email:string|null; phone:string|null; client_since:string|null; matched_lead_id:string|null; match_method:string|null; commercial_status:string|null; offer_count:number; project_count:number; invoice_count:number; accepted_offer_total:number|string; accepted_offer_total_excl_vat:number|string; project_value_total:number|string; project_value_total_excl_vat:number|string; invoiced_total:number|string; paid_total:number|string };
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
type RawSeoSummary = { impressions:number|string; clicks:number|string; position_sum:number|string; branded_clicks:number|string; classified_clicks:number|string };
type RawGbp = { profile_views:number; website_clicks:number; calls:number; direction_requests:number; messages:number; searches:number; reviews:number; rating_sum:number|string };
type RawIntegration = { id:string; provider:Integration["provider"]; status:"connected"|"connecting"|"not_connected"|"error"; configuration:Record<string,unknown>; error_message:string|null; last_successful_sync:string|null; last_attempted_sync:string|null; sync_logs:{records_imported:number;completed_at:string|null}[]|null };
type RawChangeEvent = { id:number; provider:string; occurred_at:string; metric_key:string; title:string; detail:string|null; delta:number|string|null; before_value:number|string|null; after_value:number|string|null; severity:"info"|"good"|"warn"|"bad" };
type RawOverride = { id:string; period_key:string; scope_type:"company"|"source"|"client"; scope_key:string; field_key:string; value:unknown; note:string|null; updated_at:string };
type RawAutomation = { enabled:boolean; operational_schedule:string; marketing_schedule:string };

async function loadLiveDataset(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, company: Company, period: DashboardPeriod, profile: DashboardLoadProfile): Promise<CompanyDataset> {
  const { fromIso, toIso, fromDate, toDate } = period;
  const comparison = previousDashboardPeriod(period);
  const needsLeads = profile !== "website";
  const needsMarketing = profile === "full" || profile === "overview" || profile === "health" || profile === "commercial";
  const needsCommercial = profile === "full" || profile === "overview" || profile === "commercial";
  const needsAppointments = needsCommercial;
  const needsClients = profile === "full" || profile === "overview" || profile === "health";
  const needsCatalog = profile === "full" || profile === "commercial" || profile === "health";
  const needsWebsite = profile === "full" || profile === "website";
  const needsIntegrations = profile === "full" || profile === "overview" || profile === "health";
  const needsChanges = profile === "full" || profile === "overview";
  const needsOverrides = profile === "full" || profile === "overview" || profile === "commercial" || profile === "health";
  const needsAutomation = profile === "full" || profile === "overview" || profile === "health";
  const needsDecision = profile === "full" || profile === "overview";
  const selectedYearStart = `${fromDate.slice(0,4)}-01-01`;
  const decisionFromDate = comparison.fromDate < selectedYearStart ? comparison.fromDate : selectedYearStart;
  const decisionFromIso = `${decisionFromDate}T00:00:00.000Z`;
  const emptyRows = Promise.resolve({ data: [], error: null });
  const emptyOne = Promise.resolve({ data: null, error: null });
  const leadSelect = "id,created_at,name,email,phone,source,channel_id,campaign_id,ad_id,service_id,municipality,lead_quality,sales_stage,crm_status,commercial_status,commercial_attribution_status,robaws_match_method,robaws_client_id,attributed_acquisition_cost,attribution_level,assigned_to,utm_source,utm_medium,utm_campaign,utm_content,utm_term,notes,campaigns(name),services(name),ads(name),users!leads_assigned_to_fkey(full_name)";
  const leadsRes = needsLeads
    ? await supabase.from("leads").select(leadSelect).eq("company_id",company.id).gte("created_at",fromIso).lte("created_at",toIso)
    : { data: [], error: null };
  if (leadsRes.error) throw new Error(`Unable to load lead cohort: ${leadsRes.error.message}`);
  const rawLeads = (leadsRes.data ?? []) as unknown as RawLead[];
  const currentLeadIds = rawLeads.length ? rawLeads.map(row => row.id) : ["00000000-0000-0000-0000-000000000000"];

  const [metricsRes, appointmentsRes, quotesRes, projectsRes, invoicesRes, commercialClientsRes, crmDealsRes, servicesRes, campaignsRes, websiteRes, seoRes, gbpRes, integrationsRes, changeEventsRes, overridesRes, automationRes, decisionMetricsRes, decisionInvoicesRes, decisionLeadsRes, decisionProjectsRes, periodProjectsRes, periodInvoicesRes] = await Promise.all([
    needsMarketing ? supabase.from("daily_marketing_metrics").select("date,spend,impressions,clicks,platform_conversions,channel_id,campaign_id,service_id,marketing_channels(name),campaigns(name),services(name)").eq("company_id",company.id).gte("date",fromDate).lte("date",toDate) : emptyRows,
    needsAppointments ? supabase.from("appointments").select("lead_id,scheduled_at,completed_at,status,no_show").in("lead_id", currentLeadIds) : emptyRows,
    needsCommercial ? supabase.from("quotes").select("id,lead_id,quote_number,quote_value,quote_value_incl_vat,created_at,sent_at,follow_up_at,status,accepted_at,external_source,project_external_id,attribution_status").in("lead_id", currentLeadIds) : emptyRows,
    needsCommercial ? supabase.from("projects").select("id,lead_id,service_id,project_value,project_value_excl_vat,gross_margin,status,won_at,crm_source,crm_external_id,external_client_id,external_status,attribution_status").in("lead_id", currentLeadIds) : emptyRows,
    needsCommercial ? supabase.from("commercial_invoices").select("id,lead_id,external_client_id,invoice_number,invoice_date,status,document_id,total_excl_vat,total_incl_vat,paid_total,credited_total,attribution_status").eq("company_id",company.id).in("lead_id", currentLeadIds) : emptyRows,
    needsClients ? supabase.from("commercial_clients").select("id,external_source,external_id,name,email,phone,client_since,matched_lead_id,match_method,commercial_status,offer_count,project_count,invoice_count,accepted_offer_total,accepted_offer_total_excl_vat,project_value_total,project_value_total_excl_vat,invoiced_total,paid_total").eq("company_id",company.id) : emptyRows,
    profile === "full" ? supabase.from("crm_deals").select("id,name,stage,pipeline_group,deal_value,offer_status,offer_number,lost_reason,linked_lead_id,created_at_external").eq("company_id",company.id).gte("created_at_external",fromIso).lte("created_at_external",toIso) : emptyRows,
    needsCatalog ? supabase.from("services").select("id,name,default_gross_margin").eq("company_id",company.id).eq("is_active",true) : emptyRows,
    needsCatalog ? supabase.from("campaigns").select("id,name,channel_id,marketing_channels(name)").eq("company_id",company.id) : emptyRows,
    needsWebsite ? supabase.from("website_metrics").select("company_id,date,users,sessions,new_users,engaged_sessions,form_submissions,whatsapp_clicks,phone_clicks,quote_requests").eq("company_id",company.id).gte("date",fromDate).lte("date",toDate) : emptyRows,
    needsWebsite ? supabase.rpc("reporting_seo_summary",{p_company_id:company.id,p_from:fromDate,p_to:toDate}) : Promise.resolve({data:{impressions:0,clicks:0,position_sum:0,branded_clicks:0,classified_clicks:0},error:null}),
    needsWebsite ? supabase.from("gbp_metrics").select("profile_views,website_clicks,calls,direction_requests,messages,searches,reviews,rating_sum").eq("company_id",company.id).gte("date",fromDate).lte("date",toDate) : emptyRows,
    needsIntegrations ? supabase.from("reporting_integration_connections")
      .select("id,provider,status,configuration,error_message,last_successful_sync,last_attempted_sync,sync_logs(records_imported,completed_at)")
      .eq("company_id",company.id)
      .order("completed_at",{referencedTable:"sync_logs",ascending:false})
      .limit(1,{referencedTable:"sync_logs"}) : emptyRows,
    needsChanges ? supabase.from("reporting_change_events").select("id,provider,occurred_at,metric_key,title,detail,delta,before_value,after_value,severity").eq("company_id",company.id).order("occurred_at",{ascending:false}).limit(30) : emptyRows,
    needsOverrides ? supabase.from("reporting_overrides").select("id,period_key,scope_type,scope_key,field_key,value,note,updated_at").eq("company_id",company.id).in("period_key",["all",period.selectedMonth]) : emptyRows,
    needsAutomation ? supabase.from("reporting_automation_settings").select("enabled,operational_schedule,marketing_schedule").eq("company_id",company.id).maybeSingle() : emptyOne,
    needsDecision ? supabase.from("daily_marketing_metrics").select("date,spend").eq("company_id",company.id).gte("date",decisionFromDate).lte("date",toDate) : emptyRows,
    needsDecision ? supabase.from("commercial_invoices").select("invoice_date,total_incl_vat,paid_total,credited_total").eq("company_id",company.id).gte("invoice_date",decisionFromDate).lte("invoice_date",toDate) : emptyRows,
    needsDecision ? supabase.from("leads").select("id,created_at").eq("company_id",company.id).gte("created_at",decisionFromIso).lte("created_at",toIso) : emptyRows,
    needsDecision ? supabase.from("projects").select("won_at,project_value,status,leads!inner(company_id)").eq("leads.company_id",company.id).gte("won_at",decisionFromIso).lte("won_at",toIso) : emptyRows,
    needsCommercial ? supabase.from("projects").select("id,lead_id,service_id,project_value,project_value_excl_vat,gross_margin,status,won_at,crm_source,crm_external_id,external_client_id,external_status,attribution_status,leads!inner(company_id)").eq("leads.company_id",company.id).gte("won_at",fromIso).lte("won_at",toIso) : emptyRows,
    needsCommercial ? supabase.from("commercial_invoices").select("id,lead_id,external_client_id,invoice_number,invoice_date,status,document_id,total_excl_vat,total_incl_vat,paid_total,credited_total,attribution_status").eq("company_id",company.id).gte("invoice_date",fromDate).lte("invoice_date",toDate) : emptyRows,
  ]);
  const firstError = [metricsRes,appointmentsRes,quotesRes,projectsRes,invoicesRes,commercialClientsRes,crmDealsRes,servicesRes,campaignsRes,websiteRes,seoRes,gbpRes,integrationsRes,changeEventsRes,overridesRes,automationRes,decisionMetricsRes,decisionInvoicesRes,decisionLeadsRes,decisionProjectsRes,periodProjectsRes,periodInvoicesRes].find(result => result.error)?.error;
  if (firstError) throw new Error(`Unable to load reporting facts: ${firstError.message}`);

  const rawMetrics = (metricsRes.data ?? []) as unknown as RawMetric[];
  const rawAppointments = (appointmentsRes.data ?? []) as unknown as RawAppointment[];
  const rawQuotes = (quotesRes.data ?? []) as unknown as RawQuote[];
  const rawProjects = (projectsRes.data ?? []) as unknown as RawProject[];
  const rawInvoices = (invoicesRes.data ?? []) as unknown as RawCommercialInvoice[];
  const rawPeriodProjects = (periodProjectsRes.data ?? []) as unknown as RawProject[];
  const rawPeriodInvoices = (periodInvoicesRes.data ?? []) as unknown as RawCommercialInvoice[];
  const rawCommercialClients = (commercialClientsRes.data ?? []) as unknown as RawCommercialClient[];
  const rawCrmDeals = (crmDealsRes.data ?? []) as unknown as RawCrmDeal[];
  const rawChangeEvents = (changeEventsRes.data ?? []) as unknown as RawChangeEvent[];
  const rawOverrides = (overridesRes.data ?? []) as unknown as RawOverride[];
  const rawAutomation = (automationRes.data ?? null) as unknown as RawAutomation | null;
  const rawWebsite = (websiteRes.data ?? []) as unknown as RawWebsite[];
  const rawSeo = (seoRes.data ?? {impressions:0,clicks:0,position_sum:0,branded_clicks:0,classified_clicks:0}) as unknown as RawSeoSummary;
  const rawGbp = (gbpRes.data ?? []) as unknown as RawGbp[];
  const businessDecision = needsDecision
    ? buildBusinessDecision(
        (decisionMetricsRes.data ?? []) as unknown as Array<{date:string;spend:number|string}>,
        (decisionInvoicesRes.data ?? []) as unknown as Array<{invoice_date:string|null;total_incl_vat:number|string|null;paid_total:number|string|null;credited_total:number|string|null}>,
        (decisionLeadsRes.data ?? []) as unknown as Array<{id:string;created_at:string}>,
        (decisionProjectsRes.data ?? []) as unknown as Array<{won_at:string|null;project_value:number|string|null;status:string}>,
        period,
        comparison,
      )
    : undefined;
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
        sentAt: quote.sent_at,
        followUpAt: quote.follow_up_at,
        number: quote.quote_number,
        status: quote.status || "Unknown",
        priceInclVat: Number(quote.quote_value_incl_vat ?? 0),
        priceExclVat: Number(quote.quote_value ?? 0),
        projectExternalId: quote.project_external_id,
        attributionStatus: quote.attribution_status ?? "UNVERIFIED",
        isOpen: outcome === "open",
        isAccepted: outcome === "accepted",
        isRejected: outcome === "rejected",
        daysWaiting: outcome === "open" ? daysBetween(quote.sent_at?.slice(0, 10) ?? offerDate, toIso) : null,
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
  const commercialClients = rawCommercialClients.map(client => ({
    id: client.id,
    externalSource: client.external_source,
    externalId: client.external_id,
    name: client.name,
    email: client.email ?? "",
    phone: client.phone ?? "",
    clientSince: client.client_since,
    matchedLeadId: client.matched_lead_id,
    matchMethod: client.match_method ?? "NONE",
    commercialStatus: client.commercial_status ?? "ROBAWS_CONTACT",
    offerCount: Number(client.offer_count ?? 0),
    projectCount: Number(client.project_count ?? 0),
    invoiceCount: Number(client.invoice_count ?? 0),
    acceptedOfferTotal: Number(client.accepted_offer_total ?? 0),
    acceptedOfferTotalExclVat: Number(client.accepted_offer_total_excl_vat ?? 0),
    projectValueTotal: Number(client.project_value_total ?? 0),
    projectValueTotalExclVat: Number(client.project_value_total_excl_vat ?? 0),
    invoicedTotal: Number(client.invoiced_total ?? 0),
    paidTotal: Number(client.paid_total ?? 0),
  }));

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
  const commercialAppointments = rawAppointments.map(row => ({
    leadId: row.lead_id,
    leadName: leadById.get(row.lead_id)?.name ?? "Unknown lead",
    scheduledAt: row.scheduled_at,
    completedAt: row.completed_at,
    status: row.status,
    noShow: row.no_show,
  }));
  const appointmentLeadIds = [...new Set(rawAppointments.map(row => row.lead_id))];
  const channelMap = new Map<string,ChannelMetric>();
  for (const row of rawMetrics) { const id=row.channel_id; const item=channelMap.get(id)??{id,channel:row.marketing_channels?.name??"Unknown",spend:0,impressions:0,clicks:0,platformConversions:0,leads:0,notRelevant:0,qualified:0,visits:0,quotes:0,won:0,revenue:0}; item.spend+=Number(row.spend); item.impressions+=row.impressions; item.clicks+=row.clicks; item.platformConversions+=Number(row.platform_conversions); channelMap.set(id,item); }
  for (const lead of rawLeads) { if(!lead.channel_id) continue; const item=channelMap.get(lead.channel_id); if(!item) continue; item.leads++; if(isNotRelevantLead(lead)) item.notRelevant=(item.notRelevant??0)+1; if(isQualifiedLead(lead)) item.qualified++; if(hasReachedVisit(lead)) item.visits++; if(["quote_sent","won"].includes(lead.sales_stage)||isQuoteOutcomeStatus(lead.crm_status)||quoteByLead.has(lead.id)) item.quotes++; if(projectByLead.get(lead.id)?.status==="won") item.won++; }
  for (const project of attributableProjects) {
    const lead = rawLeadById.get(project.lead_id);
    if (!lead?.channel_id) continue;
    const item = channelMap.get(lead.channel_id);
    if (item) item.revenue += Number(project.project_value ?? 0);
  }
  const channels=[...channelMap.values()];
  const total=(key:keyof Pick<ChannelMetric,"spend"|"leads"|"notRelevant"|"qualified"|"visits"|"quotes"|"won"|"revenue">)=>channels.reduce((s,r)=>s+Number(r[key]??0),0);
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
  const seoImpressions=Number(rawSeo.impressions??0),seoClicks=Number(rawSeo.clicks??0),positionSum=Number(rawSeo.position_sum??0),branded=Number(rawSeo.branded_clicks??0),classifiedClicks=Number(rawSeo.classified_clicks??0);
  const gbpReviews=sum(rawGbp,"reviews"),gbpRatingSum=sum(rawGbp,"rating_sum");
  const gbp={profileViews:sum(rawGbp,"profile_views"),websiteClicks:sum(rawGbp,"website_clicks"),calls:sum(rawGbp,"calls"),directionRequests:sum(rawGbp,"direction_requests"),messages:sum(rawGbp,"messages"),searches:sum(rawGbp,"searches"),reviews:gbpReviews,averageRating:gbpReviews?gbpRatingSum/gbpReviews:null};
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
    attributableProjects
      .filter(project => project.status === "won")
      .map(project => project.lead_id),
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
  const previous = { spend:0, leads:0, notRelevant:0, qualified:0, visits:0, quotes:0, won:0, revenue:0 };
  return {company,periodKey:period.selectedMonth,periodLabel:`${fromDate} — ${toDate}`,comparisonLabel:`vs ${comparison.fromDate} — ${comparison.toDate}`,metrics:{spend:total("spend"),leads:rawLeads.length,notRelevant:rawLeads.filter(isNotRelevantLead).length,qualified:rawLeads.filter(isQualifiedLead).length,visits:rawLeads.filter(hasReachedVisit).length,quotes:quoteLeadIds.size,won:wonLeadIds.size,revenue,grossProfit},previous,channels,leadSources,commercialDeals,commercialClients,commercialOffers,commercialProjects,commercialInvoices,commercialAppointments,appointmentLeadIds,leads,services,campaigns,trend,businessDecision,locations,website,seo:{impressions:seoImpressions,clicks:seoClicks,ctr:seoImpressions?seoClicks/seoImpressions*100:0,position:seoImpressions?positionSum/seoImpressions:0,brandedShare:classifiedClicks?branded/classifiedClicks*100:null},gbp,integrations:((integrationsRes.data??[]) as unknown as RawIntegration[]).map(i=>({id:i.id,provider:i.provider,name:providerName(i.provider),status:i.status==="connected"?"Connected":i.status==="connecting"?"Connecting":i.status==="error"?"Error":"Not connected",lastSuccess:i.last_successful_sync,lastAttempt:i.last_attempted_sync,records:(i.sync_logs??[])[0]?.records_imported??0,resource:integrationResource(i.provider,i.configuration),errorMessage:i.error_message,metaPermissionStatus:metaPermissionStatus(i.provider,i.configuration),metaMissingPermissions:metaMissingPermissions(i.provider,i.configuration)})),changeEvents:rawChangeEvents.map(event=>({id:event.id,provider:event.provider,occurredAt:event.occurred_at,metricKey:event.metric_key,title:event.title,detail:event.detail??"",delta:event.delta===null?null:Number(event.delta),beforeValue:event.before_value===null?null:Number(event.before_value),afterValue:event.after_value===null?null:Number(event.after_value),severity:event.severity})),manualOverrides:rawOverrides.map(item=>({id:item.id,periodKey:item.period_key,scopeType:item.scope_type,scopeKey:item.scope_key,fieldKey:item.field_key,value:item.value,note:item.note??"",updatedAt:item.updated_at})),automation:rawAutomation?{enabled:rawAutomation.enabled,operationalSchedule:rawAutomation.operational_schedule,marketingSchedule:rawAutomation.marketing_schedule}:null,dataHealth:{missingSource:rawLeads.filter(l=>!l.source&&!l.channel_id).length,missingService:rawLeads.filter(l=>!l.service_id).length,missingCampaign:rawLeads.filter(l=>!l.campaign_id).length,wonMissingRevenue:attributableProjects.filter(p=>p.status==="won"&&!p.project_value).length,duplicates:potentialDuplicateCount(rawLeads),campaignsWithoutSpend:Math.max(0,((campaignsRes.data??[]).length-new Set(rawMetrics.filter(m=>Number(m.spend)>0).map(m=>m.campaign_id)).size)),daysSinceSync:null}};
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

function statusKey(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function isNotRelevantLead(lead: Pick<RawLead, "crm_status" | "sales_stage">) {
  const status = statusKey(lead.crm_status);
  return [
    "verkeerde regio",
    "wrong region",
    "onjuiste contactgegevens",
    "verkeerde nummer",
    "niet interessant",
    "geen interesse",
  ].includes(status);
}

function hasReachedVisit(lead: Pick<RawLead, "crm_status" | "sales_stage">) {
  if (["visit_completed", "quote_sent", "won"].includes(lead.sales_stage)) return true;
  return [
    "visited offerte to be done",
    "offer sent",
    "email offerte",
    "signed",
    "offerte afgekeurd",
  ].includes(statusKey(lead.crm_status));
}

function isSignedStatus(value: string | null | undefined) {
  return statusKey(value) === "signed";
}

function isQualifiedLead(lead: Pick<RawLead, "crm_status" | "sales_stage">) {
  return !isNotRelevantLead(lead) && [
    "qualified",
    "visit_booked",
    "visit_completed",
    "quote_sent",
    "won",
  ].includes(lead.sales_stage);
}

function potentialDuplicateCount(rows: RawLead[]) {
  const seenEmails = new Set<string>();
  const seenPhones = new Set<string>();
  const seenNames = new Set<string>();
  let duplicates = 0;

  for (const row of [...rows].sort((a,b)=>a.created_at.localeCompare(b.created_at))) {
    const email = String(row.email ?? "").trim().toLowerCase();
    const phone = String(row.phone ?? "").replace(/\D/g, "");
    const name = String(row.name ?? "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .replace(/\s+/g, " ");
    const reliableName = name.split(" ").filter(Boolean).length >= 2 && name.length >= 6 ? name : "";
    const duplicate = Boolean(
      (email && seenEmails.has(email)) ||
      (phone.length >= 8 && seenPhones.has(phone)) ||
      (reliableName && seenNames.has(reliableName))
    );
    if (duplicate) duplicates += 1;
    if (email) seenEmails.add(email);
    if (phone.length >= 8) seenPhones.add(phone);
    if (reliableName) seenNames.add(reliableName);
  }

  return duplicates;
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
      notRelevant: 0,
      qualified: 0,
      visits: 0,
      quotes: 0,
      won: 0,
      revenue: 0,
    };

    row.leads += 1;
    if (isNotRelevantLead(lead)) row.notRelevant = (row.notRelevant ?? 0) + 1;

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

    if (hasReachedVisit(lead)) {
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

    if (project?.status === "won") {
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

function buildServices(rows:{id:string;name:string;default_gross_margin:number|null}[],metrics:RawMetric[],leads:RawLead[],projects:RawProject[],quotes:Map<string,RawQuote>):ServiceMetric[]{return rows.map(s=>{const ls=leads.filter(l=>l.service_id===s.id),ps=projects.filter(p=>p.service_id===s.id&&p.status==="won"),wonLeadIds=new Set(ps.map(p=>p.lead_id));return{id:s.id,name:s.name,spend:metrics.filter(m=>m.service_id===s.id).reduce((n,m)=>n+Number(m.spend),0),leads:ls.length,qualified:ls.filter(isQualifiedLead).length,visits:ls.filter(hasReachedVisit).length,quotes:ls.filter(l=>quotes.has(l.id)||isQuoteOutcomeStatus(l.crm_status)).length,won:wonLeadIds.size,revenue:ps.reduce((n,p)=>n+Number(p.project_value??0),0),grossMargin:s.default_gross_margin===null?null:Number(s.default_gross_margin)*100};});}
function buildCampaigns(rows:{id:string;name:string;channel_id:string;marketing_channels:{name:string}|null}[],metrics:RawMetric[],leads:RawLead[],projects:Map<string,RawProject>):CampaignMetric[]{return rows.map(c=>{const ms=metrics.filter(m=>m.campaign_id===c.id),ls=leads.filter(l=>l.campaign_id===c.id);return{id:c.id,name:c.name,channel:c.marketing_channels?.name??"Unknown",childLabel:"Drill-down available",spend:ms.reduce((n,m)=>n+Number(m.spend),0),impressions:ms.reduce((n,m)=>n+m.impressions,0),clicks:ms.reduce((n,m)=>n+m.clicks,0),leads:ls.length,qualified:ls.filter(isQualifiedLead).length,visits:ls.filter(hasReachedVisit).length,won:ls.filter(l=>projects.get(l.id)?.status==="won").length,revenue:ls.reduce((n,l)=>n+Number(projects.get(l.id)?.project_value??0),0),angle:"Unclassified"};});}
function buildTrend(metrics:RawMetric[],leads:RawLead[],projectRows:RawProject[],projects:Map<string,RawProject>,website:RawWebsite[]):TrendPoint[]{const dates=[...new Set([...metrics.map(m=>m.date),...website.map(w=>w.date),...projectRows.flatMap(p=>p.won_at?[p.won_at.slice(0,10)]:[])])].sort();return dates.map(date=>{const ms=metrics.filter(m=>m.date===date),ls=leads.filter(l=>l.created_at.startsWith(date)),spend=ms.reduce((n,m)=>n+Number(m.spend),0),won=ls.filter(l=>projects.get(l.id)?.status==="won").length,revenue=projectRows.filter(p=>p.won_at?.startsWith(date)).reduce((n,p)=>n+Number(p.project_value??0),0),qualified=ls.filter(l=>l.lead_quality==="A"||l.lead_quality==="B").length;return{date,spend,leads:ls.length,qualified,revenue,cpl:ls.length?spend/ls.length:0,cac:won?spend/won:0,roas:spend?revenue/spend:0,sessions:website.filter(w=>w.date===date).reduce((n,w)=>n+w.sessions,0),conversions:ls.length};});}
function buildLocations(leads:RawLead[],_metrics:RawMetric[],projects:Map<string,RawProject>):LocationMetric[]{const names=[...new Set(leads.map(l=>l.municipality??"Unknown"))];return names.map(name=>{const ls=leads.filter(l=>(l.municipality??"Unknown")===name),ps=ls.map(l=>projects.get(l.id)).filter((p):p is RawProject=>Boolean(p&&p.status==="won"));return{municipality:name,leads:ls.length,qualified:ls.filter(isQualifiedLead).length,won:ps.length,revenue:ps.reduce((n,p)=>n+Number(p.project_value??0),0),spend:null};});}
function providerName(provider:string){return({meta:"Meta Ads",google_ads:"Google Ads",ga4:"Google Analytics 4",search_console:"Google Search Console",google_business:"Google Business Profile",monday:"CRM / Monday",hubspot:"CRM / HubSpot",robaws:"ROBAWS",website_forms:"Website forms"} as Record<string,string>)[provider]??provider;}
function integrationResource(provider:string,configuration:Record<string,unknown>){const keys=({meta:["ad_account_name","ad_account_id"],google_ads:["customer_name","customer_id"],ga4:["property_name","property_id"],search_console:["site_url"],google_business:["location_name","location_id"],monday:["board_name","board_id"],hubspot:["portal_name","portal_id"],robaws:["account_name"],website_forms:["endpoint_name"]} as Record<string,string[]>)[provider]??[];for(const key of keys){const value=configuration?.[key];if(typeof value==="string"&&value.trim())return value;}return "Not selected";}
function metaPermissionStatus(provider:string,configuration:Record<string,unknown>):Integration["metaPermissionStatus"]{if(provider!=="meta")return null;const value=configuration?.meta_permission_status;return value==="Ready"||value==="Missing permissions"||value==="App Review / Advanced Access required"?value:null;}
function metaMissingPermissions(provider:string,configuration:Record<string,unknown>){if(provider!=="meta"||!Array.isArray(configuration?.meta_missing_permissions))return[];return configuration.meta_missing_permissions.filter((value):value is string=>typeof value==="string");}
function dashboardPeriod(month: string): DashboardPeriod {
  const today = brusselsDate(new Date());
  const year = today.slice(0,4);
  const normalized = /^\d{4}-\d{2}$/.test(month) ? month : "ytd";

  if (normalized === "ytd") {
    return {
      selectedMonth: "ytd",
      fromDate: `${year}-01-01`,
      toDate: today,
      fromIso: `${year}-01-01T00:00:00.000Z`,
      toIso: `${today}T23:59:59.999Z`,
    };
  }

  const [selectedYear, selectedMonth] = normalized.split("-").map(Number);
  const lastDay = new Date(Date.UTC(selectedYear, selectedMonth, 0)).getUTCDate();
  const fromDate = `${normalized}-01`;
  const monthEnd = `${normalized}-${String(lastDay).padStart(2,"0")}`;
  const toDate = monthEnd > today ? today : monthEnd;

  return {
    selectedMonth: normalized,
    fromDate,
    toDate,
    fromIso: `${fromDate}T00:00:00.000Z`,
    toIso: `${toDate}T23:59:59.999Z`,
  };
}


function buildBusinessDecision(
  metrics: Array<{date:string;spend:number|string}>,
  invoices: Array<{invoice_date:string|null;total_incl_vat:number|string|null;paid_total:number|string|null;credited_total:number|string|null}>,
  leads: Array<{id:string;created_at:string}>,
  projects: Array<{won_at:string|null;project_value:number|string|null;status:string}>,
  period: DashboardPeriod,
  comparison: DashboardPeriod,
): BusinessDecisionData {
  const periodMetric = (range: DashboardPeriod) => {
    const rangeMetrics = metrics.filter(row => row.date >= range.fromDate && row.date <= range.toDate);
    const rangeInvoices = invoices.filter(row => {
      const date = row.invoice_date?.slice(0,10);
      return Boolean(date && date >= range.fromDate && date <= range.toDate);
    });
    const rangeLeads = leads.filter(row => {
      const date = row.created_at.slice(0,10);
      return date >= range.fromDate && date <= range.toDate;
    });
    const rangeWonProjects = projects.filter(row => {
      const date = row.won_at?.slice(0,10);
      return row.status==="won" && Boolean(date && date >= range.fromDate && date <= range.toDate);
    });
    return {
      label: `${range.fromDate} — ${range.toDate}`,
      fromDate: range.fromDate,
      toDate: range.toDate,
      spend: rangeMetrics.reduce((sum,row)=>sum+Number(row.spend??0),0),
      invoiced: rangeInvoices.reduce((sum,row)=>sum+Math.max(0,Number(row.total_incl_vat??0)-Number(row.credited_total??0)),0),
      paid: rangeInvoices.reduce((sum,row)=>sum+Number(row.paid_total??0),0),
      leads: rangeLeads.length,
      wonProjects: rangeWonProjects.length,
      wonProjectValue: rangeWonProjects.reduce((sum,row)=>sum+Number(row.project_value??0),0),
    };
  };

  const year = Number(period.fromDate.slice(0,4));
  const start = new Date(Date.UTC(year,0,1));
  const end = new Date(`${period.toDate}T00:00:00.000Z`);
  const monthly = [];
  for (let cursor = start; cursor <= end; cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth()+1, 1))) {
    const month = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth()+1).padStart(2,"0")}`;
    const monthStart = `${month}-01`;
    const monthLastDay = new Date(Date.UTC(cursor.getUTCFullYear(),cursor.getUTCMonth()+1,0)).getUTCDate();
    const monthEnd = `${month}-${String(monthLastDay).padStart(2,"0")}`;
    const effectiveEnd = monthEnd > period.toDate ? period.toDate : monthEnd;
    const range: DashboardPeriod = {
      selectedMonth: month,
      fromDate: monthStart,
      toDate: effectiveEnd,
      fromIso: `${monthStart}T00:00:00.000Z`,
      toIso: `${effectiveEnd}T23:59:59.999Z`,
    };
    const value = periodMetric(range);
    monthly.push({
      month,
      label: new Intl.DateTimeFormat("en-BE",{month:"short"}).format(cursor),
      spend: value.spend,
      invoiced: value.invoiced,
      paid: value.paid,
      leads: value.leads,
      wonProjects: value.wonProjects,
      wonProjectValue: value.wonProjectValue,
      complete: effectiveEnd === monthEnd,
    });
  }

  return {
    current: periodMetric(period),
    comparison: periodMetric(comparison),
    monthly,
  };
}

function previousDashboardPeriod(period: DashboardPeriod): DashboardPeriod {
  if (period.selectedMonth === "ytd") {
    const year = Number(period.fromDate.slice(0,4)) - 1;
    const monthDay = period.toDate.slice(5);
    const fromDate = `${year}-01-01`;
    const toDate = `${year}-${monthDay}`;
    return {
      selectedMonth: `${year}-ytd`,
      fromDate,
      toDate,
      fromIso: `${fromDate}T00:00:00.000Z`,
      toIso: `${toDate}T23:59:59.999Z`,
    };
  }

  const [year, month] = period.selectedMonth.split("-").map(Number);
  const previousMonthDate = new Date(Date.UTC(year, month - 2, 1));
  const previousYear = previousMonthDate.getUTCFullYear();
  const previousMonth = previousMonthDate.getUTCMonth() + 1;
  const previousKey = `${previousYear}-${String(previousMonth).padStart(2,"0")}`;
  const selectedLastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const previousLastDay = new Date(Date.UTC(previousYear, previousMonth, 0)).getUTCDate();
  const selectedToDay = Number(period.toDate.slice(-2));
  const selectionIsFullMonth = selectedToDay === selectedLastDay;
  const previousToDay = selectionIsFullMonth ? previousLastDay : Math.min(selectedToDay, previousLastDay);
  const fromDate = `${previousKey}-01`;
  const toDate = `${previousKey}-${String(previousToDay).padStart(2,"0")}`;

  return {
    selectedMonth: previousKey,
    fromDate,
    toDate,
    fromIso: `${fromDate}T00:00:00.000Z`,
    toIso: `${toDate}T23:59:59.999Z`,
  };
}

function availableDashboardMonths() {
  const today = brusselsDate(new Date());
  const year = Number(today.slice(0,4));
  const currentMonth = Number(today.slice(5,7));
  const months = ["ytd"];
  for (let month = 1; month <= currentMonth; month += 1) {
    months.push(`${year}-${String(month).padStart(2,"0")}`);
  }
  return months.reverse();
}

function brusselsDate(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Brussels",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

