import "server-only";

import { googleJson } from "../google/client";
import { normalizeGbpTimeSeries, type GbpMetric } from "../google/core";

export type GoogleBusinessResource = {
  id: string;
  name: string;
  account_id: string;
  account_name: string;
  location_id: string;
  location_name: string;
};

const DAILY_METRICS = [
  "BUSINESS_IMPRESSIONS_DESKTOP_MAPS",
  "BUSINESS_IMPRESSIONS_MOBILE_MAPS",
  "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH",
  "BUSINESS_IMPRESSIONS_MOBILE_SEARCH",
  "WEBSITE_CLICKS",
  "CALL_CLICKS",
  "BUSINESS_DIRECTION_REQUESTS",
];

export async function discoverGoogleBusinessLocations(
  accessToken: string,
): Promise<GoogleBusinessResource[]> {
  const accounts = await listAccounts(accessToken);
  const resources: GoogleBusinessResource[] = [];

  for (const account of accounts) {
    const accountId = suffix(account.name);
    if (!accountId) continue;
    let pageToken = "";

    do {
      const url = new URL(
        `https://mybusinessbusinessinformation.googleapis.com/v1/accounts/${encodeURIComponent(accountId)}/locations`,
      );
      url.searchParams.set("readMask", "name,title,storeCode,metadata");
      url.searchParams.set("pageSize", "100");
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      const body = await googleJson<{
        locations?: Array<{ name?: string; title?: string; storeCode?: string }>;
        nextPageToken?: string;
      }>(url, accessToken, {}, {}, gbpContext(
        "Google Business Profile Business Information API",
        `account ${accountId}`,
      ));

      for (const location of body.locations ?? []) {
        const locationId = suffix(location.name);
        if (!locationId) continue;
        const locationName = location.title?.trim() || location.storeCode?.trim() || locationId;
        resources.push({
          id: locationId,
          name: locationName,
          account_id: accountId,
          account_name: account.accountName?.trim() || accountId,
          location_id: locationId,
          location_name: locationName,
        });
      }
      pageToken = body.nextPageToken ?? "";
    } while (pageToken);
  }

  return resources.sort((a, b) => a.name.localeCompare(b.name));
}

export async function fetchGoogleBusinessDailyMetrics(
  accessToken: string,
  locationId: string,
  from: string,
  to: string,
): Promise<GbpMetric[]> {
  const url = new URL(
    `https://businessprofileperformance.googleapis.com/v1/locations/${encodeURIComponent(suffix(locationId))}:fetchMultiDailyMetricsTimeSeries`,
  );
  for (const metric of DAILY_METRICS) url.searchParams.append("dailyMetrics", metric);
  addDate(url, "dailyRange.start_date", from);
  addDate(url, "dailyRange.end_date", to);
  const body = await googleJson<{
    multiDailyMetricTimeSeries?: Array<{
      dailyMetricTimeSeries?: Record<string, unknown>[];
    }>;
  }>(url, accessToken, {}, {}, gbpContext(
    "Google Business Profile Performance API",
    `location ${suffix(locationId)}`,
  ));

  return normalizeGbpTimeSeries(
    (body.multiDailyMetricTimeSeries ?? [])
      .flatMap(series => series.dailyMetricTimeSeries ?? []),
  );
}

async function listAccounts(accessToken: string) {
  const accounts: Array<{ name?: string; accountName?: string }> = [];
  let pageToken = "";
  do {
    const url = new URL("https://mybusinessaccountmanagement.googleapis.com/v1/accounts");
    url.searchParams.set("pageSize", "20");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const body = await googleJson<{
      accounts?: Array<{ name?: string; accountName?: string }>;
      nextPageToken?: string;
    }>(url, accessToken, {}, {}, gbpContext(
      "Google Business Profile Account Management API",
      "the authorized Google account",
    ));
    accounts.push(...(body.accounts ?? []));
    pageToken = body.nextPageToken ?? "";
  } while (pageToken);
  return accounts;
}

function addDate(url: URL, prefix: string, value: string) {
  const [year, month, day] = value.split("-");
  url.searchParams.set(`${prefix}.year`, year);
  url.searchParams.set(`${prefix}.month`, month);
  url.searchParams.set(`${prefix}.day`, day);
}

function suffix(value?: string) {
  return value?.split("/").at(-1)?.trim() ?? "";
}

function gbpContext(apiName: string, resource: string) {
  return {
    apiName,
    resource,
    retryQuota: true,
    quotaHelp: "If this Cloud project has zero GBP API quota, submit Google's Application for Basic API Access; code cannot enable zero quota.",
  };
}
