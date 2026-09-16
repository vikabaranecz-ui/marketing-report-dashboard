import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { credentialStore } from "./credentials";
import { fetchMetaDailyInsights } from "./meta/client";
import { normalizeMetaAdAccountId, type MetaInsight } from "./meta/core";
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

  const dateTo = brusselsDate(new Date());
  const insights = await fetchMetaDailyInsights(
    credential.accessToken,
    adAccountId,
    INITIAL_SYNC_FROM,
    dateTo,
  );
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
  const campaigns = uniqueBy(insights, row => row.campaignId);
  const campaignRows = await upsertEntities(
    admin,
    "campaigns",
    campaigns.map(row => ({
      company_id: companyId,
      channel_id: channelId,
      external_id: row.campaignId,
      name: row.campaignName,
    })),
    "company_id,channel_id,external_id",
  );
  const campaignIds = new Map(campaignRows.map(row => [String(row.external_id), String(row.id)]));

  const adsets = uniqueBy(insights, row => row.adsetId);
  const adsetRows = await upsertEntities(
    admin,
    "ad_groups",
    adsets.map(row => ({
      campaign_id: requiredMap(campaignIds, row.campaignId, "campaign"),
      external_id: row.adsetId,
      name: row.adsetName,
      group_type: "ad_set",
    })),
    "campaign_id,external_id",
  );
  const adsetIds = new Map(adsetRows.map(row => [String(row.external_id), String(row.id)]));

  const ads = uniqueBy(insights, row => row.adId);
  const adRows = await upsertEntities(
    admin,
    "ads",
    ads.map(row => ({
      ad_group_id: requiredMap(adsetIds, row.adsetId, "ad set"),
      external_id: row.adId,
      name: row.adName,
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

  const dates = insights.map(row => row.date).sort();
  const monthlySpend = monthlySummary(insights);
  return {
    recordsImported: insights.length,
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

function uniqueBy(rows: MetaInsight[], key: (row: MetaInsight) => string) {
  return [...new Map(rows.map(row => [key(row), row])).values()];
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
