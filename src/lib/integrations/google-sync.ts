import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { fetchGa4DailyMetrics } from "./ga4";
import { fetchGoogleAdsDailyInsights } from "./google-ads";
import { fetchGoogleBusinessDailyMetrics } from "./google-business";
import { getGoogleCredential, type GoogleProvider } from "./google/client";
import { googleAdsFactIdentity, googleAdsReplacementScope, normalizeGoogleCustomerId, searchConsolePersistenceRow, searchConsoleReplacementCompanyId, searchConsoleSyncIdentity, searchConsoleSyncScope } from "./google/core";
import { fetchSearchConsoleMetrics } from "./search-console";
import type { ConnectionConfiguration } from "./types";

const INITIAL_SYNC_FROM = "2026-01-01";

export type GoogleSyncResult = {
  provider: GoogleProvider;
  recordsImported: number;
  dailyRowsImported: number;
  dateFrom: string;
  dateTo: string;
  selectedResourceId: string;
  campaignsImported?: number;
  adGroupsImported?: number;
  adsImported?: number;
  totalSpend?: number;
};

export async function syncGoogleProvider(
  provider: GoogleProvider,
  connectionId: string,
  companyId: string,
  configuration: ConnectionConfiguration,
): Promise<GoogleSyncResult> {
  const credential = await getGoogleCredential(connectionId, provider);
  const dateTo = brusselsDate(new Date());

  if (provider === "google_ads") {
    return syncGoogleAds(
      credential.accessToken,
      companyId,
      configuration,
      dateTo,
    );
  }
  if (provider === "ga4") {
    return syncGa4(credential.accessToken, companyId, configuration, dateTo);
  }
  if (provider === "search_console") {
    return syncSearchConsole(
      credential.accessToken,
      companyId,
      configuration,
      dateTo,
    );
  }
  return syncGoogleBusiness(
    credential.accessToken,
    companyId,
    configuration,
    dateTo,
  );
}

async function syncGoogleAds(
  accessToken: string,
  companyId: string,
  configuration: ConnectionConfiguration,
  dateTo: string,
): Promise<GoogleSyncResult> {
  const customerId = normalizeGoogleCustomerId(configuration.customer_id);
  if (!customerId) throw new Error("Select a Google Ads customer before syncing.");
  const insights = await fetchGoogleAdsDailyInsights(
    accessToken,
    customerId,
    configuration.login_customer_id,
    INITIAL_SYNC_FROM,
    dateTo,
  );
  const admin = createSupabaseAdminClient();
  const company = await admin
    .from("companies")
    .select("organization_id")
    .eq("id", companyId)
    .single();
  if (company.error) throw new Error(`Unable to load the reporting company: ${company.error.message}`);

  const channel = await admin
    .from("marketing_channels")
    .upsert({
      organization_id: company.data.organization_id,
      name: "Google Ads",
      channel_type: "paid_search",
      is_paid: true,
    }, { onConflict: "organization_id,name" })
    .select("id")
    .single();
  if (channel.error) throw new Error(`Unable to prepare the Google Ads channel: ${channel.error.message}`);
  const channelId = String(channel.data.id);

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

  const adGroups = uniqueBy(insights, row => row.adGroupId);
  const adGroupRows = await upsertEntities(
    admin,
    "ad_groups",
    adGroups.map(row => ({
      campaign_id: requiredMap(campaignIds, row.campaignId, "campaign"),
      external_id: row.adGroupId,
      name: row.adGroupName,
      group_type: "ad_group",
    })),
    "campaign_id,external_id",
  );
  const adGroupIds = new Map(adGroupRows.map(row => [String(row.external_id), String(row.id)]));

  const ads = uniqueBy(insights, row => row.adId);
  const adRows = await upsertEntities(
    admin,
    "ads",
    ads.map(row => ({
      ad_group_id: requiredMap(adGroupIds, row.adGroupId, "ad group"),
      external_id: row.adId,
      name: row.adName,
    })),
    "ad_group_id,external_id",
  );
  const adIds = new Map(adRows.map(row => [String(row.external_id), String(row.id)]));

  // One Google Ads connection selects one customer. Replacing every Google Ads
  // fact in the window prevents an earlier customer selection from being mixed
  // with the currently selected account while leaving every other channel intact.
  const replacementScope = googleAdsReplacementScope(companyId, channelId);
  const removed = await admin
    .from("daily_marketing_metrics")
    .delete()
    .eq("company_id", replacementScope.companyId)
    .eq("channel_id", replacementScope.channelId)
    .gte("date", INITIAL_SYNC_FROM)
    .lte("date", dateTo);
  if (removed.error) throw new Error(`Unable to replace Google Ads daily facts: ${removed.error.message}`);

  await upsertChunks(
    admin,
    "daily_marketing_metrics",
    insights.map(row => {
      const identity = googleAdsFactIdentity(companyId, customerId, row);
      return {
        company_id: identity.companyId,
        date: identity.date,
        ad_account_id: identity.adAccountId,
        channel_id: channelId,
        campaign_id: requiredMap(campaignIds, identity.campaignExternalId, "campaign"),
        ad_group_id: requiredMap(adGroupIds, identity.adGroupExternalId, "ad group"),
        ad_id: requiredMap(adIds, identity.adExternalId, "ad"),
        service_id: null,
        spend: row.spend,
        impressions: row.impressions,
        reach: 0,
        clicks: row.clicks,
        landing_page_views: 0,
        platform_conversions: row.conversions,
      };
    }),
    "company_id,date,ad_account_id,channel_id,campaign_id,ad_group_id,ad_id,service_id",
  );

  return {
    provider: "google_ads",
    recordsImported: insights.length,
    dailyRowsImported: insights.length,
    campaignsImported: campaigns.length,
    adGroupsImported: adGroups.length,
    adsImported: ads.length,
    totalSpend: insights.reduce((sum, row) => sum + row.spend, 0),
    dateFrom: INITIAL_SYNC_FROM,
    dateTo,
    selectedResourceId: customerId,
  };
}

async function syncGa4(
  accessToken: string,
  companyId: string,
  configuration: ConnectionConfiguration,
  dateTo: string,
): Promise<GoogleSyncResult> {
  const propertyId = clean(configuration.property_id);
  if (!propertyId) throw new Error("Select a GA4 property before syncing.");
  const metrics = await fetchGa4DailyMetrics(
    accessToken,
    propertyId,
    INITIAL_SYNC_FROM,
    dateTo,
  );
  const admin = createSupabaseAdminClient();
  await replaceCompanyWindow(admin, "website_metrics", companyId, dateTo);
  await upsertChunks(
    admin,
    "website_metrics",
    metrics.map(row => ({
      company_id: companyId,
      date: row.date,
      landing_page: null,
      source: null,
      medium: null,
      device_category: null,
      users: row.users,
      sessions: row.sessions,
      new_users: row.newUsers,
      engaged_sessions: row.engagedSessions,
      form_submissions: row.formSubmissions,
      whatsapp_clicks: row.whatsappClicks,
      phone_clicks: row.phoneClicks,
      quote_requests: row.quoteRequests,
    })),
    "date,company_id,landing_page,source,medium,device_category",
  );
  return baseResult("ga4", metrics.length, propertyId, dateTo);
}

async function syncSearchConsole(
  accessToken: string,
  companyId: string,
  configuration: ConnectionConfiguration,
  dateTo: string,
): Promise<GoogleSyncResult> {
  const scope = searchConsoleSyncScope(companyId, configuration.site_url);
  const identity = searchConsoleSyncIdentity(scope);
  const metrics = await fetchSearchConsoleMetrics(
    accessToken,
    identity.requestSiteUrl,
    INITIAL_SYNC_FROM,
    dateTo,
  );
  const admin = createSupabaseAdminClient();
  await replaceCompanyWindow(
    admin,
    "seo_metrics",
    searchConsoleReplacementCompanyId(scope),
    dateTo,
  );
  await upsertChunks(
    admin,
    "seo_metrics",
    metrics.map(row => searchConsolePersistenceRow(scope, row)),
    "date,company_id,query,page",
  );
  return baseResult("search_console", metrics.length, identity.selectedResourceId, dateTo);
}

async function syncGoogleBusiness(
  accessToken: string,
  companyId: string,
  configuration: ConnectionConfiguration,
  dateTo: string,
): Promise<GoogleSyncResult> {
  const locationId = clean(configuration.location_id);
  if (!locationId) throw new Error("Select a Google Business Profile location before syncing.");
  const metrics = await fetchGoogleBusinessDailyMetrics(
    accessToken,
    locationId,
    INITIAL_SYNC_FROM,
    dateTo,
  );
  const admin = createSupabaseAdminClient();
  await replaceCompanyWindow(admin, "gbp_metrics", companyId, dateTo);
  await upsertChunks(
    admin,
    "gbp_metrics",
    metrics.map(row => ({
      company_id: companyId,
      date: row.date,
      profile_views: row.profileViews,
      website_clicks: row.websiteClicks,
      calls: row.calls,
      direction_requests: row.directionRequests,
      messages: 0,
      searches: 0,
      reviews: 0,
      rating_sum: 0,
    })),
    "date,company_id",
  );
  return baseResult("google_business", metrics.length, locationId, dateTo);
}

type Admin = ReturnType<typeof createSupabaseAdminClient>;
type EntityRow = { id: unknown; external_id: unknown };
type Table =
  | "daily_marketing_metrics"
  | "website_metrics"
  | "seo_metrics"
  | "gbp_metrics";

async function replaceCompanyWindow(
  admin: Admin,
  table: Exclude<Table, "daily_marketing_metrics">,
  companyId: string,
  dateTo: string,
) {
  const result = await admin
    .from(table)
    .delete()
    .eq("company_id", companyId)
    .gte("date", INITIAL_SYNC_FROM)
    .lte("date", dateTo);
  if (result.error) throw new Error(`Unable to replace ${table}: ${result.error.message}`);
}

async function upsertEntities(
  admin: Admin,
  table: "campaigns" | "ad_groups" | "ads",
  rows: Record<string, unknown>[],
  onConflict: string,
) {
  if (!rows.length) return [] as EntityRow[];
  const result = await admin.from(table).upsert(rows, { onConflict }).select("id,external_id");
  if (result.error) throw new Error(`Unable to upsert Google Ads ${table}: ${result.error.message}`);
  return (result.data ?? []) as unknown as EntityRow[];
}

async function upsertChunks(
  admin: Admin,
  table: Table,
  rows: Record<string, unknown>[],
  onConflict: string,
) {
  for (let index = 0; index < rows.length; index += 500) {
    const result = await admin
      .from(table)
      .upsert(rows.slice(index, index + 500), { onConflict });
    if (result.error) throw new Error(`Unable to upsert ${table}: ${result.error.message}`);
  }
}

function baseResult(
  provider: GoogleProvider,
  count: number,
  selectedResourceId: string,
  dateTo: string,
): GoogleSyncResult {
  return {
    provider,
    recordsImported: count,
    dailyRowsImported: count,
    dateFrom: INITIAL_SYNC_FROM,
    dateTo,
    selectedResourceId,
  };
}

function uniqueBy<T>(rows: T[], key: (row: T) => string) {
  return [...new Map(rows.map(row => [key(row), row])).values()];
}

function requiredMap(map: Map<string, string>, key: string, label: string) {
  const value = map.get(key);
  if (!value) throw new Error(`Google Ads ${label} ${key} could not be mapped to reporting storage.`);
  return value;
}

function clean(value?: string) {
  return value?.trim() ?? "";
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
