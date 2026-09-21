import "server-only";

import { commercialFunnelTotals, isFacebookSource } from "@/lib/integrations/meta/lead-attribution-core";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type MetaCampaignLead = {
  id: string;
  name: string;
  createdAt: string;
  source: string;
  campaign: string;
  ad: string;
  crmStatus: string;
  appointment: string | null;
  offers: number;
  latestOfferStatus: string | null;
  latestOfferValue: number;
  projectStatus: string | null;
  projectValue: number;
  invoiced: number;
  paid: number;
  attributionMethod: string;
  attributionConfidence: "High" | "Medium";
};

export type MetaCampaignMetric = {
  id: string;
  name: string;
  status: string;
  spend: number;
  impressions: number;
  clicks: number;
  platformLeads: number;
  crmLeads: number;
  appointments: number;
  qualified: number;
  offers: number;
  openOffers: number;
  viewedOffers: number;
  rejectedOffers: number;
  acceptedOffers: number;
  projects: number;
  pipelineValue: number;
  wonValue: number;
  projectValue: number;
  invoiced: number;
  paid: number;
  cpl: number | null;
  costPerAppointment: number | null;
  costPerOffer: number | null;
  cac: number | null;
  pipelineRoas: number | null;
  wonRoas: number | null;
  cashRoas: number | null;
  leads: MetaCampaignLead[];
};

export type MetaAttributionQuality = {
  imported: number;
  matched: number;
  unmatched: number;
  ambiguous: number;
  matchRate: number | null;
  earliest: string | null;
  latest: string | null;
  unattributedFacebookLeads: number;
};

export type MetaCampaignDataset = {
  company: { id: string; name: string; shortName: string };
  periodLabel: string;
  campaigns: MetaCampaignMetric[];
  quality: MetaAttributionQuality;
};

export type MetaCampaignReportBootstrap = {
  mode: "live" | "unavailable";
  companies: { id: string; name: string }[];
  datasets: Record<string, MetaCampaignDataset>;
  selectedMonth: string;
  selectedCompanyId: string;
  availableMonths: string[];
};

type MetricRow = { campaign_id: string | null; spend: number | string; impressions: number; clicks: number; platform_conversions: number | string };
type CampaignRow = { id: string; name: string; status: string | null };
type AttributionRow = { created_time: string; campaign_id: string | null; ad_id: string | null; matched_lead_id: string | null; match_method: string; match_status: string };
type LeadRow = { id: string; created_at: string; name: string; source: string | null; sales_stage: string; crm_status: string | null; campaign_id: string | null; ad_id: string | null };
type AppointmentRow = { lead_id: string; scheduled_at: string; status: string };
type QuoteRow = { id: string; lead_id: string | null; status: string | null; quote_value: number | string; quote_value_incl_vat: number | string | null; created_at: string | null };
type ProjectRow = { id: string; lead_id: string | null; status: string | null; project_value: number | string | null; attribution_status: string | null };
type InvoiceRow = { id: string; lead_id: string | null; total_incl_vat: number | string | null; paid_total: number | string | null; credited_total: number | string | null; attribution_status: string | null };
type AdRow = { id: string; name: string };

const EMPTY_UUID = "00000000-0000-0000-0000-000000000000";

export async function getMetaCampaignReportBootstrap(month = "ytd", companyId?: string): Promise<MetaCampaignReportBootstrap> {
  const period = reportingPeriod(month);
  if (!hasSupabaseConfig()) return { mode: "unavailable", companies: [], datasets: {}, selectedMonth: period.selectedMonth, selectedCompanyId: "", availableMonths: availableReportingMonths() };
  const supabase = await createSupabaseServerClient();
  const companiesResult = await supabase.from("companies").select("id,name").eq("is_active", true).order("name");
  if (companiesResult.error) throw new Error(`Unable to load companies: ${companiesResult.error.message}`);
  const companies = (companiesResult.data ?? []).map(row => ({ id: row.id, name: row.name }));
  const selectedCompany = companies.find(company => company.id === companyId) ?? companies[0];
  const selectedCompanyId = selectedCompany?.id ?? "";
  const datasets = selectedCompany ? { [selectedCompany.id]: await loadCompany(supabase, selectedCompany, period) } : {};
  return { mode: "live", companies, datasets, selectedMonth: period.selectedMonth, selectedCompanyId, availableMonths: availableReportingMonths() };
}

async function loadCompany(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  company: { id: string; name: string },
  period: ReturnType<typeof reportingPeriod>,
): Promise<MetaCampaignDataset> {
  const { dateFrom, dateTo, fromIso, toIso } = period;
  // Phase 1: load only tables that are directly company-scoped. Quotes,
  // projects, appointments and ads do not have a company_id column, so they
  // must never be queried with a guessed company filter or left unscoped.
  const [campaignsRes, metricsRes, attributionRes, leadsRes] = await Promise.all([
    supabase.from("campaigns").select("id,name,status").eq("company_id", company.id),
    supabase.from("daily_marketing_metrics").select("campaign_id,spend,impressions,clicks,platform_conversions,marketing_channels!inner(name)").eq("company_id", company.id).eq("marketing_channels.name", "Meta Ads").gte("date", dateFrom).lte("date", dateTo),
    supabase.from("meta_lead_attribution").select("created_time,campaign_id,ad_id,matched_lead_id,match_method,match_status").eq("company_id", company.id).gte("created_time", fromIso).lte("created_time", toIso),
    supabase.from("leads").select("id,created_at,name,source,sales_stage,crm_status,campaign_id,ad_id").eq("company_id", company.id).gte("created_at", fromIso).lte("created_at", toIso),
  ]);
  const phaseOne = [campaignsRes, metricsRes, attributionRes, leadsRes];
  const phaseOneError = phaseOne.find(result => result.error)?.error;
  if (phaseOneError) throw new Error(`Unable to load Meta campaign attribution: ${phaseOneError.message}`);

  const campaignRows = (campaignsRes.data ?? []) as CampaignRow[];
  const metricRows = (metricsRes.data ?? []) as unknown as MetricRow[];
  const attributionRows = (attributionRes.data ?? []) as AttributionRow[];
  const leads = (leadsRes.data ?? []) as LeadRow[];

  // Phase 2: scope dependent tables through the exact company lead IDs and
  // attribution ad IDs. The impossible UUID keeps empty scopes empty instead
  // of accidentally turning them into unfiltered reads.
  const companyLeadIds = [...new Set(leads.map(row => row.id).filter(Boolean))];
  const relevantAdIds = [...new Set(attributionRows.flatMap(row => row.ad_id ? [row.ad_id] : []))];
  const leadScope = companyLeadIds.length ? companyLeadIds : [EMPTY_UUID];
  const adScope = relevantAdIds.length ? relevantAdIds : [EMPTY_UUID];

  const [adsRes, appointmentsRes, quotesRes, projectsRes, invoicesRes] = await Promise.all([
    supabase.from("ads").select("id,name").in("id", adScope),
    supabase.from("appointments").select("lead_id,scheduled_at,status").in("lead_id", leadScope),
    supabase.from("quotes").select("id,lead_id,status,quote_value,quote_value_incl_vat,created_at").in("lead_id", leadScope),
    supabase.from("projects").select("id,lead_id,status,project_value,attribution_status").in("lead_id", leadScope),
    supabase.from("commercial_invoices").select("id,lead_id,total_incl_vat,paid_total,credited_total,attribution_status").eq("company_id", company.id).in("lead_id", leadScope),
  ]);
  const phaseTwo = [adsRes, appointmentsRes, quotesRes, projectsRes, invoicesRes];
  const phaseTwoError = phaseTwo.find(result => result.error)?.error;
  if (phaseTwoError) throw new Error(`Unable to load Meta campaign attribution: ${phaseTwoError.message}`);

  const ads = (adsRes.data ?? []) as AdRow[];
  const appointments = (appointmentsRes.data ?? []) as AppointmentRow[];
  const quotes = (quotesRes.data ?? []) as QuoteRow[];
  const projects = (projectsRes.data ?? []) as ProjectRow[];
  const invoices = (invoicesRes.data ?? []) as InvoiceRow[];
  const campaignById = new Map(campaignRows.map(row => [row.id, row]));
  const leadById = new Map(leads.map(row => [row.id, row]));
  const adById = new Map(ads.map(row => [row.id, row.name]));
  const appointmentsByLead = groupBy(appointments, row => row.lead_id);
  const quotesByLead = groupBy(quotes, row => row.lead_id ?? "");
  const projectsByLead = groupBy(projects, row => row.lead_id ?? "");
  const invoicesByLead = groupBy(invoices, row => row.lead_id ?? "");
  const campaignIds = new Set([
    ...metricRows.flatMap(row => row.campaign_id ? [row.campaign_id] : []),
    ...attributionRows.flatMap(row => row.campaign_id ? [row.campaign_id] : []),
  ]);

  const campaigns = [...campaignIds].map(campaignId => {
    const campaign = campaignById.get(campaignId);
    const campaignMetrics = metricRows.filter(row => row.campaign_id === campaignId);
    const campaignAttribution = attributionRows.filter(row => row.campaign_id === campaignId && row.match_status === "MATCHED" && row.matched_lead_id);
    const leadIds = new Set(campaignAttribution.map(row => row.matched_lead_id as string));
    const campaignLeads = [...leadIds].flatMap(leadId => {
      const lead = leadById.get(leadId);
      if (!lead) return [];
      const attribution = campaignAttribution.find(row => row.matched_lead_id === leadId);
      return [buildLeadDetail(
        lead,
        campaign?.name ?? "Unnamed campaign",
        attribution,
        adById,
        appointmentsByLead.get(leadId) ?? [],
        quotesByLead.get(leadId) ?? [],
        projectsByLead.get(leadId) ?? [],
        invoicesByLead.get(leadId) ?? [],
      )];
    });
    const campaignQuotes = quotes.filter(row => row.lead_id && leadIds.has(row.lead_id)).map(row => ({ id: row.id, leadId: row.lead_id as string, status: row.status, valueInclVat: number(row.quote_value_incl_vat ?? row.quote_value) }));
    const campaignProjects = projects.filter(row => row.lead_id && leadIds.has(row.lead_id)).map(row => ({ id: row.id, leadId: row.lead_id as string, valueInclVat: number(row.project_value), attributionStatus: row.attribution_status }));
    const campaignInvoices = invoices.filter(row => row.lead_id && leadIds.has(row.lead_id)).map(row => ({ id: row.id, leadId: row.lead_id as string, invoicedInclVat: netInvoiced(row), paid: number(row.paid_total), attributionStatus: row.attribution_status }));
    const funnel = commercialFunnelTotals(leadIds, campaignQuotes, campaignProjects, campaignInvoices);
    const spend = sum(campaignMetrics, row => number(row.spend));
    const platformLeads = sum(campaignMetrics, row => number(row.platform_conversions));
    const appointmentCount = [...leadIds].filter(id => (appointmentsByLead.get(id) ?? []).length > 0).length;
    const clients = new Set(campaignProjects.map(row => row.leadId)).size;
    return {
      id: campaignId,
      name: campaign?.name ?? "Unnamed campaign",
      status: campaign?.status ?? "Unknown",
      spend,
      impressions: sum(campaignMetrics, row => number(row.impressions)),
      clicks: sum(campaignMetrics, row => number(row.clicks)),
      platformLeads,
      crmLeads: leadIds.size,
      appointments: appointmentCount,
      qualified: [...leadIds].filter(id => isQualified(leadById.get(id)?.sales_stage)).length,
      offers: funnel.offers,
      openOffers: funnel.openOffers,
      viewedOffers: funnel.viewedOffers,
      rejectedOffers: funnel.rejectedOffers,
      acceptedOffers: funnel.acceptedOffers,
      projects: funnel.projects,
      pipelineValue: funnel.pipelineValue,
      wonValue: funnel.wonValue,
      projectValue: funnel.projectValue,
      invoiced: funnel.invoiced,
      paid: funnel.paid,
      cpl: divide(spend, platformLeads),
      costPerAppointment: divide(spend, appointmentCount),
      costPerOffer: divide(spend, funnel.offers),
      cac: divide(spend, clients),
      pipelineRoas: divide(funnel.pipelineValue, spend),
      wonRoas: divide(funnel.wonValue, spend),
      cashRoas: divide(funnel.paid, spend),
      leads: campaignLeads,
    } satisfies MetaCampaignMetric;
  }).sort((a, b) => b.spend - a.spend);

  const matched = attributionRows.filter(row => row.match_status === "MATCHED").length;
  const dates = attributionRows.map(row => row.created_time).sort();
  return {
    company: { id: company.id, name: company.name, shortName: company.name.slice(0, 3).toUpperCase() },
    periodLabel: `${dateFrom} – ${dateTo}`,
    campaigns,
    quality: {
      imported: attributionRows.length,
      matched,
      unmatched: attributionRows.filter(row => row.match_status === "UNMATCHED").length,
      ambiguous: attributionRows.filter(row => row.match_status === "AMBIGUOUS").length,
      matchRate: attributionRows.length ? matched / attributionRows.length : null,
      earliest: dates[0] ?? null,
      latest: dates.at(-1) ?? null,
      unattributedFacebookLeads: leads.filter(lead => isFacebookSource(lead.source) && !lead.campaign_id && lead.created_at.slice(0, 10) >= dateFrom && lead.created_at.slice(0, 10) <= dateTo).length,
    },
  };
}

function buildLeadDetail(
  lead: LeadRow,
  campaign: string,
  attribution: AttributionRow | undefined,
  adById: Map<string, string>,
  appointments: AppointmentRow[],
  quotes: QuoteRow[],
  projects: ProjectRow[],
  invoices: InvoiceRow[],
): MetaCampaignLead {
  const latestQuote = [...quotes].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))[0];
  const attributableProjects = projects.filter(row => !String(row.attribution_status ?? "").toLowerCase().includes("date_conflict"));
  const attributableInvoices = invoices.filter(row => !String(row.attribution_status ?? "").toLowerCase().includes("date_conflict"));
  const method = attribution?.match_method ?? "NONE";
  return {
    id: lead.id,
    name: lead.name,
    createdAt: lead.created_at,
    source: lead.source ?? "Unknown",
    campaign,
    ad: attribution?.ad_id ? adById.get(attribution.ad_id) ?? "Unnamed ad" : "Unattributed",
    crmStatus: lead.crm_status ?? lead.sales_stage,
    appointment: appointments.sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at))[0]?.scheduled_at ?? null,
    offers: quotes.length,
    latestOfferStatus: latestQuote?.status ?? null,
    latestOfferValue: number(latestQuote?.quote_value_incl_vat ?? latestQuote?.quote_value),
    projectStatus: attributableProjects[0]?.status ?? null,
    projectValue: sum(attributableProjects, row => number(row.project_value)),
    invoiced: sum(attributableInvoices, netInvoiced),
    paid: sum(attributableInvoices, row => number(row.paid_total)),
    attributionMethod: method,
    attributionConfidence: ["META_LEAD_ID", "EMAIL+PHONE"].includes(method) ? "High" : "Medium",
  };
}

function groupBy<T>(rows: T[], key: (row: T) => string) {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const value = key(row);
    groups.set(value, [...(groups.get(value) ?? []), row]);
  }
  return groups;
}

function sum<T>(rows: T[], value: (row: T) => number) {
  return rows.reduce((total, row) => total + value(row), 0);
}

function number(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function netInvoiced(invoice: Pick<InvoiceRow, "total_incl_vat" | "credited_total">) {
  return Math.max(0, number(invoice.total_incl_vat) - number(invoice.credited_total));
}

function divide(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : null;
}

function isQualified(stage: string | undefined) {
  return ["qualified", "visit_booked", "visit_completed", "quote_sent", "won"].includes(stage ?? "");
}

function reportingPeriod(month: string) {
  const today = brusselsDate(new Date());
  const year = today.slice(0, 4);
  const selectedMonth = /^\d{4}-\d{2}$/.test(month) ? month : "ytd";

  if (selectedMonth === "ytd") {
    const dateFrom = `${year}-01-01`;
    return {
      selectedMonth,
      dateFrom,
      dateTo: today,
      fromIso: `${dateFrom}T00:00:00.000Z`,
      toIso: `${today}T23:59:59.999Z`,
    };
  }

  const [selectedYear, selectedMonthNumber] = selectedMonth.split("-").map(Number);
  const lastDay = new Date(Date.UTC(selectedYear, selectedMonthNumber, 0)).getUTCDate();
  const dateFrom = `${selectedMonth}-01`;
  const rawDateTo = `${selectedMonth}-${String(lastDay).padStart(2, "0")}`;
  const dateTo = rawDateTo > today ? today : rawDateTo;
  return {
    selectedMonth,
    dateFrom,
    dateTo,
    fromIso: `${dateFrom}T00:00:00.000Z`,
    toIso: `${dateTo}T23:59:59.999Z`,
  };
}

function availableReportingMonths() {
  const today = brusselsDate(new Date());
  const year = Number(today.slice(0, 4));
  const currentMonth = Number(today.slice(5, 7));
  const months = ["ytd"];
  for (let month = 1; month <= currentMonth; month += 1) {
    months.push(`${year}-${String(month).padStart(2, "0")}`);
  }
  return months.reverse();
}
function brusselsDate(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}
