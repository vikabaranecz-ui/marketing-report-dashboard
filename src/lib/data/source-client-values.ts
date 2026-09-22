import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { SourceClientValue } from "./source-client-types";

type LeadRow = {
  id: string;
  source: string | null;
  campaign_id: string | null;
  created_at: string;
};

type CampaignRow = {
  id: string;
  name: string;
};

type ClientRow = {
  id: string;
  name: string;
  client_since: string | null;
  matched_lead_id: string | null;
  commercial_status: string;
  invoiced_total: number | string | null;
  paid_total: number | string | null;
};

type ProjectRow = {
  lead_id: string | null;
  project_value: number | string | null;
  attribution_status: string | null;
};

type OverrideRow = {
  period_key: string;
  scope_key: string;
  field_key: string;
  value: unknown;
};

const EMPTY_UUID = "00000000-0000-0000-0000-000000000000";

export async function getSourceClientValues(companyId: string, month = "ytd"): Promise<SourceClientValue[]> {
  if (!companyId) return [];
  const period = reportingPeriod(month);
  const supabase = await createSupabaseServerClient();

  const [leadsRes, clientsRes, campaignsRes, overridesRes] = await Promise.all([
    supabase
      .from("leads")
      .select("id,source,campaign_id,created_at")
      .eq("company_id", companyId)
      .gte("created_at", period.fromIso)
      .lte("created_at", period.toIso),
    supabase
      .from("commercial_clients")
      .select("id,name,client_since,matched_lead_id,commercial_status,invoiced_total,paid_total")
      .eq("company_id", companyId),
    supabase
      .from("campaigns")
      .select("id,name")
      .eq("company_id", companyId),
    supabase
      .from("reporting_overrides")
      .select("period_key,scope_key,field_key,value")
      .eq("company_id", companyId)
      .eq("scope_type", "client")
      .in("period_key", ["all", period.selectedMonth]),
  ]);

  const error = [leadsRes, clientsRes, campaignsRes, overridesRes].find(result => result.error)?.error;
  if (error) throw new Error(`Unable to load source client values: ${error.message}`);

  const leads = (leadsRes.data ?? []) as LeadRow[];
  const clients = (clientsRes.data ?? []) as ClientRow[];
  const campaigns = (campaignsRes.data ?? []) as CampaignRow[];
  const overrides = (overridesRes.data ?? []) as OverrideRow[];

  const leadById = new Map(leads.map(lead => [lead.id, lead]));
  const campaignById = new Map(campaigns.map(campaign => [campaign.id, campaign.name]));
  const sourceOverrideByClient = new Map(
    overrides
      .filter(row => row.field_key === "source" && typeof row.value === "string" && row.value.trim())
      .map(row => [row.scope_key, String(row.value).trim()]),
  );

  const matchedLeadIds = [...new Set(
    clients
      .flatMap(client => client.matched_lead_id ? [client.matched_lead_id] : [])
      .filter(leadId => leadById.has(leadId)),
  )];
  const projectScope = matchedLeadIds.length ? matchedLeadIds : [EMPTY_UUID];
  const projectsRes = await supabase
    .from("projects")
    .select("lead_id,project_value,attribution_status")
    .in("lead_id", projectScope);

  if (projectsRes.error) {
    throw new Error(`Unable to load source client projects: ${projectsRes.error.message}`);
  }

  const projects = (projectsRes.data ?? []) as ProjectRow[];
  const projectsByLead = groupBy(projects, row => row.lead_id ?? "");

  return clients.flatMap(client => {
    if (client.commercial_status !== "CLIENT_WON") return [];

    const lead = client.matched_lead_id ? leadById.get(client.matched_lead_id) : undefined;
    const manualSource = sourceOverrideByClient.get(client.id);
    const source = lead?.source?.trim() || manualSource;
    if (!source) return [];

    const clientDate = client.client_since?.slice(0, 10) ?? null;
    const manualInPeriod = Boolean(
      manualSource &&
      clientDate &&
      clientDate >= period.dateFrom &&
      clientDate <= period.dateTo
    );

    if (!lead && !manualInPeriod) return [];

    const safeProjects = lead
      ? (projectsByLead.get(lead.id) ?? []).filter(project =>
          !String(project.attribution_status ?? "").toLowerCase().includes("date_conflict")
        )
      : [];

    return [{
      id: client.id,
      name: client.name,
      source,
      campaign: lead?.campaign_id ? campaignById.get(lead.campaign_id) ?? null : null,
      clientSince: client.client_since,
      projectValue: safeProjects.length
        ? safeProjects.reduce((sum, project) => sum + numeric(project.project_value), 0)
        : null,
      invoiced: numeric(client.invoiced_total),
      paid: numeric(client.paid_total),
      status: client.commercial_status,
      attribution: lead ? "CRM matched" : "Manual source",
    } satisfies SourceClientValue];
  }).sort((a, b) => b.paid - a.paid || b.invoiced - a.invoiced);
}

function groupBy<T>(rows: T[], key: (row: T) => string) {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const value = key(row);
    groups.set(value, [...(groups.get(value) ?? []), row]);
  }
  return groups;
}

function numeric(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
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
