import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { credentialStore } from "./credentials";
import { syncMetaLeadAttribution, type MetaLeadSyncResult } from "./meta-lead-sync";
import { fetchMetaDailyInsights, fetchMetaLeadAds, fetchMetaPermissionState } from "./meta/client";
import { normalizeMetaAdAccountId, type MetaInsight } from "./meta/core";
import type { MetaLeadRecord } from "./meta/lead-attribution-core";
import { optionalMetaLeadPhase, parseMetaPermissionRows, readMetaSyncSources, type MetaReadinessStatus } from "./meta/production-core";
import type { ConnectionConfiguration } from "./types";

const INITIAL_SYNC_FROM = "2026-01-01";

export type MetaSyncResult = {
  recordsImported: number;
  dailyRowsImported: number;
  campaignsImported: number;
  adsetsImported: number;
  adsImported: number;
  dateFrom: string;
  dateTo: string;
  earliestDate: string | null;
  latestDate: string | null;
  totalSpend: number;
  selectedAdAccountId: string;
  monthlySpend: { month: string; spend: number; rowCount: number }[];
  missingMonths: string[];
  metaLeadsImported: number;
  metaLeadsMatched: number;
  metaLeadsUnmatched: number;
  metaLeadsAmbiguous: number;
  earliestMetaLead: string | null;
  latestMetaLead: string | null;
  metaLeadMatchRate: number;
  metaLeadAttributionWarning: string | null;
  metaPermissionStatus: MetaReadinessStatus;
  grantedPermissions: string[];
  missingPermissions: string[];
  leadAdsAvailable: boolean;
  metaLeadRetrievalScope: "direct_forms" | "selected_pages" | "accessible_pages_fallback" | null;
  metaLeadPagesProcessed: number;
  metaLeadFormsProcessed: number;
};

export async function syncMetaProvider(
  connectionId: string,
  companyId: string,
  configuration: ConnectionConfiguration,
): Promise<MetaSyncResult> {
  const adAccountId = normalizeMetaAdAccountId(configuration.ad_account_id ?? "");
  if (!adAccountId) {
    throw new Error("Select a Meta ad account before syncing.");
  }

  const credential = await credentialStore.read(connectionId, "meta");
  if (!credential?.accessToken) {
    throw new Error("Meta authorization is missing. Reconnect Meta and try again.");
  }

  const permissionCheck = await optionalMetaLeadPhase(
    () => fetchMetaPermissionState(credential.accessToken),
    "Meta permission verification is unavailable.",
  );
  const storedPermissionRows = Object.entries(credential.permissionStatuses ?? {}).map(
    ([permission, status]) => ({ permission, status }),
  );
  const permissions = permissionCheck.value ?? parseMetaPermissionRows(storedPermissionRows);
  const leadWarnings = permissionCheck.warning ? [permissionCheck.warning] : [];
  if (permissionCheck.value) {
    const credentialUpdate = await optionalMetaLeadPhase(
      () => credentialStore.write(connectionId, "meta", {
        ...credential,
        scopes: permissions.granted,
        permissionStatuses: permissions.statuses,
      }),
      "Verified Meta permissions could not be saved to secure credential storage.",
    );
    if (credentialUpdate.warning) leadWarnings.push(credentialUpdate.warning);
  }

  const dateTo = brusselsDate(new Date());
  const sources = await readMetaSyncSources({
    fetchInsights: () => fetchMetaDailyInsights(
      credential.accessToken,
      adAccountId,
      INITIAL_SYNC_FROM,
      dateTo,
    ),
    fetchLeads: () => fetchMetaLeadAds(credential.accessToken, adAccountId),
    leadAdsAvailable: permissions.leadAdsAvailable,
    unavailableWarning: `Lead Ads retrieval is unavailable because these Meta permissions are missing: ${permissions.missing.join(", ")}.`,
  });
  const insights = sources.insights;
  let metaLeads: MetaLeadRecord[] = [];
  let metaLeadRetrievalScope: MetaSyncResult["metaLeadRetrievalScope"] = null;
  let metaLeadPagesProcessed = 0;
  let metaLeadFormsProcessed = 0;
  if (sources.leads) {
    metaLeads = sources.leads.records;
    metaLeadRetrievalScope = sources.leads.retrievalScope;
    metaLeadPagesProcessed = sources.leads.pagesProcessed;
    metaLeadFormsProcessed = sources.leads.formsProcessed;
  }
  if (sources.warning) leadWarnings.push(sources.warning);
  const admin = createSupabaseAdminClient();
  const companyResult = await admin
    .from("companies")
    .select("organization_id")
    .eq("id", companyId)
    .single();
  if (companyResult.error) throw new Error(`Unable to load the reporting company: ${companyResult.error.message}`);

  const channelResult = await admin
    .from("marketing_channels")
    .upsert({
      organization_id: companyResult.data.organization_id,
      name: "Meta Ads",
      channel_type: "paid_social",
      is_paid: true,
    }, { onConflict: "organization_id,name" })
    .select("id")
    .single();
  if (channelResult.error) throw new Error(`Unable to prepare the Meta channel: ${channelResult.error.message}`);

  const channelId = channelResult.data.id;
  const campaignSources = insights.map(row => ({ id: row.campaignId, name: row.campaignName }));
  const campaigns = uniqueBy(campaignSources, row => row.id);
  const campaignRows = await upsertEntities(
    admin,
    "campaigns",
    campaigns.map(row => ({
      company_id: companyId,
      channel_id: channelId,
      external_id: row.id,
      name: row.name,
    })),
    "company_id,channel_id,external_id",
  );
  const campaignIds = new Map(campaignRows.map(row => [String(row.external_id), String(row.id)]));

  const adsetSources = insights.map(row => ({ id: row.adsetId, name: row.adsetName, campaignId: row.campaignId }));
  const adsets = uniqueBy(adsetSources, row => row.id);
  const adsetRows = await upsertEntities(
    admin,
    "ad_groups",
    adsets.map(row => ({
      campaign_id: requiredMap(campaignIds, row.campaignId, "campaign"),
      external_id: row.id,
      name: row.name,
      group_type: "ad_set",
    })),
    "campaign_id,external_id",
  );
  const adsetIds = new Map(adsetRows.map(row => [String(row.external_id), String(row.id)]));

  const adSources = insights.map(row => ({ id: row.adId, name: row.adName, adsetId: row.adsetId }));
  const ads = uniqueBy(adSources, row => row.id);
  const adRows = await upsertEntities(
    admin,
    "ads",
    ads.map(row => ({
      ad_group_id: requiredMap(adsetIds, row.adsetId, "ad set"),
      external_id: row.id,
      name: row.name,
    })),
    "ad_group_id,external_id",
  );
  const adIds = new Map(adRows.map(row => [String(row.external_id), String(row.id)]));

  // Only replace rows after the complete Meta response has been received.
  // This keeps each selected account's reporting window exact and prevents
  // stale rows when Meta revises attribution or an ad-day disappears.
  const deleteResult = await admin
    .from("daily_marketing_metrics")
    .delete()
    .eq("company_id", companyId)
    .eq("channel_id", channelId)
    .eq("ad_account_id", adAccountId)
    .gte("date", INITIAL_SYNC_FROM)
    .lte("date", dateTo);
  if (deleteResult.error) throw new Error(`Unable to replace existing Meta daily facts: ${deleteResult.error.message}`);

  await upsertInChunks(
    admin,
    "daily_marketing_metrics",
    insights.map(row => ({
      company_id: companyId,
      date: row.date,
      ad_account_id: adAccountId,
      channel_id: channelId,
      campaign_id: requiredMap(campaignIds, row.campaignId, "campaign"),
      ad_group_id: requiredMap(adsetIds, row.adsetId, "ad set"),
      ad_id: requiredMap(adIds, row.adId, "ad"),
      service_id: null,
      spend: row.spend,
      impressions: row.impressions,
      reach: row.reach,
      clicks: row.clicks,
      landing_page_views: row.landingPageViews,
      platform_conversions: row.platformLeads,
    })),
    "company_id,date,ad_account_id,channel_id,campaign_id,ad_group_id,ad_id,service_id",
  );

  let leadSync = emptyMetaLeadSync();
  if (metaLeads.length) {
    const attribution = await optionalMetaLeadPhase(
      () => syncMetaLeadAttribution(
        admin,
        companyId,
        metaLeads,
        campaignIds,
        adsetIds,
        adIds,
      ),
      "Meta Lead Ads attribution could not be persisted.",
    );
    if (attribution.value) leadSync = attribution.value;
    if (attribution.warning) leadWarnings.push(attribution.warning);
  }

  const dates = insights.map(row => row.date).sort();
  const monthlySpend = monthlySummary(insights);
  return {
    recordsImported: insights.length + leadSync.imported,
    dailyRowsImported: insights.length,
    campaignsImported: campaigns.length,
    adsetsImported: adsets.length,
    adsImported: ads.length,
    dateFrom: INITIAL_SYNC_FROM,
    dateTo,
    earliestDate: dates[0] ?? null,
    latestDate: dates.at(-1) ?? null,
    totalSpend: insights.reduce((total, row) => total + row.spend, 0),
    selectedAdAccountId: adAccountId,
    monthlySpend,
    missingMonths: calendarMonths(INITIAL_SYNC_FROM, dateTo).filter(
      month => !monthlySpend.some(row => row.month === month),
    ),
    metaLeadsImported: leadSync.imported,
    metaLeadsMatched: leadSync.matched,
    metaLeadsUnmatched: leadSync.unmatched,
    metaLeadsAmbiguous: leadSync.ambiguous,
    earliestMetaLead: leadSync.earliest,
    latestMetaLead: leadSync.latest,
    metaLeadMatchRate: leadSync.matchRate,
    metaLeadAttributionWarning: leadWarnings.length ? leadWarnings.join(" ") : null,
    metaPermissionStatus: permissions.status,
    grantedPermissions: permissions.granted,
    missingPermissions: permissions.missing,
    leadAdsAvailable: permissions.leadAdsAvailable,
    metaLeadRetrievalScope,
    metaLeadPagesProcessed,
    metaLeadFormsProcessed,
  };
}

type Admin = ReturnType<typeof createSupabaseAdminClient>;
type EntityRow = { id: unknown; external_id: unknown };

async function upsertEntities(
  admin: Admin,
  table: "campaigns" | "ad_groups" | "ads",
  rows: Record<string, unknown>[],
  onConflict: string,
) {
  if (!rows.length) return [] as EntityRow[];
  const result = await admin.from(table).upsert(rows, { onConflict }).select("id,external_id");
  if (result.error) throw new Error(`Unable to upsert Meta ${table}: ${result.error.message}`);
  return (result.data ?? []) as unknown as EntityRow[];
}

async function upsertInChunks(
  admin: Admin,
  table: "daily_marketing_metrics",
  rows: Record<string, unknown>[],
  onConflict: string,
) {
  for (let index = 0; index < rows.length; index += 500) {
    const result = await admin.from(table).upsert(rows.slice(index, index + 500), { onConflict });
    if (result.error) throw new Error(`Unable to upsert Meta daily facts: ${result.error.message}`);
  }
}

function uniqueBy<T>(rows: T[], key: (row: T) => string) {
  return [...new Map(rows.map(row => [key(row), row])).values()];
}

function emptyMetaLeadSync(): MetaLeadSyncResult {
  return {
    imported: 0,
    matched: 0,
    unmatched: 0,
    ambiguous: 0,
    earliest: null,
    latest: null,
    matchRate: 0,
  };
}

function requiredMap(map: Map<string, string>, key: string, label: string) {
  const value = map.get(key);
  if (!value) throw new Error(`Meta ${label} ${key} could not be mapped to reporting storage.`);
  return value;
}

function monthlySummary(rows: MetaInsight[]) {
  const totals = new Map<string, { month: string; spend: number; rowCount: number }>();
  for (const row of rows) {
    const month = row.date.slice(0, 7);
    const current = totals.get(month) ?? { month, spend: 0, rowCount: 0 };
    current.spend += row.spend;
    current.rowCount += 1;
    totals.set(month, current);
  }
  return [...totals.values()].sort((a, b) => a.month.localeCompare(b.month));
}

function calendarMonths(from: string, to: string) {
  const months: string[] = [];
  const cursor = new Date(`${from.slice(0, 7)}-01T12:00:00Z`);
  const end = to.slice(0, 7);
  while (cursor.toISOString().slice(0, 7) <= end) {
    months.push(cursor.toISOString().slice(0, 7));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return months;
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
